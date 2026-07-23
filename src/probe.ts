import { execFile, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { existsSync } from "node:fs";

import streamDeck from "@elgato/streamdeck";

import { isCompleteSnapshot, parseUsageOutput, pickUsableSnapshot, type Snapshot } from "./parse.js";
import { fetchUsageSnapshot } from "./usage-api.js";

export type { Snapshot } from "./parse.js";
export { formatCountdown } from "./format.js";

const execFileAsync = promisify(execFile);

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECT_SCRIPT = path.join(PLUGIN_ROOT, "scripts", "probe-usage.exp");

// CC 2.1.x is slower to start and renders the /usage panel progressively;
// a full expect run takes ~20s normally, worst case ~65s. 35s was too tight.
const PROBE_TIMEOUT_MS = 75_000;
const PROBE_WAIT_SECONDS = 10;
const RETRY_WAIT_SECONDS = 14;

const HOME_DIR = process.env.HOME ?? os.homedir();

const CLAUDE_CANDIDATES = [
	`${HOME_DIR}/.local/bin/claude`,
	"/opt/homebrew/bin/claude",
	"/usr/local/bin/claude",
	"claude",
];

async function resolveClaudeBinary(): Promise<string> {
	for (const candidate of CLAUDE_CANDIDATES) {
		if (!candidate) continue;
		if (candidate.startsWith("/") && existsSync(candidate)) return candidate;
	}
	const { stdout } = await execFileAsync("/usr/bin/which", ["claude"]).catch(() => ({ stdout: "" }));
	const found = stdout.trim().split("\n").find((line) => line.startsWith("/"));
	if (found && existsSync(found)) return found;
	return "claude";
}

export class ProbeParseError extends Error {
	constructor(message: string, public readonly preview: string) {
		super(message);
		this.name = "ProbeParseError";
	}
}

async function probeOnce(claudeBin: string, waitSeconds: number): Promise<Snapshot> {
	const raw = await runExpect(claudeBin, waitSeconds, PROBE_TIMEOUT_MS);
	return parseUsageOutput(raw);
}

export async function probe(): Promise<Snapshot> {
	// The usage API is faster and steadier than driving the TUI, and it is the
	// only source for the model-scoped (Fable) weekly bar. The TUI probe stays
	// as a fallback; running it also makes the CLI refresh the OAuth token that
	// the API path depends on.
	try {
		const snapshot = await fetchUsageSnapshot();
		streamDeck.logger.debug("probe: usage API snapshot ok");
		return snapshot;
	} catch (err) {
		streamDeck.logger.warn(
			`usage API failed (${err instanceof Error ? err.message : String(err)}); falling back to TUI probe`,
		);
	}

	const claudeBin = await resolveClaudeBinary();

	const first = await probeOnce(claudeBin, PROBE_WAIT_SECONDS);
	if (isCompleteSnapshot(first)) return first;

	streamDeck.logger.warn(
		`probe parse incomplete on first attempt; retrying with longer wait. preview=${first.rawTextPreview.slice(0, 200).replace(/\n/g, " ")}`,
	);

	// The retry can time out or throw; never let that discard a usable first
	// frame. Fall back to the best snapshot we have — preferring a complete one,
	// then one that at least has a weekly window, then any with a session percent.
	let second: Snapshot | null = null;
	try {
		second = await probeOnce(claudeBin, RETRY_WAIT_SECONDS);
		if (isCompleteSnapshot(second)) return second;
	} catch (err) {
		streamDeck.logger.warn(`probe retry failed: ${err instanceof Error ? err.message : String(err)}`);
	}

	// Degraded but usable: prefer a snapshot that also has the weekly window,
	// otherwise the freshest session percent; a missing window renders as an
	// em dash rather than a fake 0%.
	const best = pickUsableSnapshot(first, second);
	if (best) return best;

	throw new ProbeParseError(
		"could not extract usage from claude /usage output",
		(second ?? first).rawTextPreview,
	);
}

function runExpect(claudeBin: string, waitSeconds: number, timeoutMs: number): Promise<string> {
	return new Promise((resolve, reject) => {
		const env = {
			...process.env,
			HOME: HOME_DIR,
			PATH: `${process.env.PATH ?? ""}:/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:${HOME_DIR}/.local/bin`,
			TERM: process.env.TERM ?? "xterm-256color",
			LANG: process.env.LANG ?? "en_US.UTF-8",
			COLUMNS: "100",
			LINES: "40",
		};

		streamDeck.logger.debug(`spawn expect: bin=${claudeBin} wait=${waitSeconds}`);

		const child = spawn("/usr/bin/expect", ["-f", EXPECT_SCRIPT, claudeBin, String(waitSeconds)], {
			env,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (d) => { stdout += d.toString(); });
		child.stderr.on("data", (d) => { stderr += d.toString(); });

		const timer = setTimeout(() => {
			streamDeck.logger.warn(
				`probe timeout: stdout=${stdout.length}B stderr=${stderr.length}B preview=${stdout.slice(0, 120).replace(/\x1b/g, "ESC")}`,
			);
			child.kill("SIGKILL");
			reject(new Error(`probe timeout after ${timeoutMs}ms (stdout=${stdout.length}B)`));
		}, timeoutMs);

		child.on("error", (err) => {
			clearTimeout(timer);
			reject(err);
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			streamDeck.logger.debug(
				`expect closed: code=${code} stdout=${stdout.length}B stderr=${stderr.slice(0, 200)}`,
			);
			if (code === 0 || stdout.length > 200) {
				resolve(stdout);
			} else {
				reject(new Error(`expect exited code=${code} stderr=${stderr.slice(0, 200)}`));
			}
		});
	});
}
