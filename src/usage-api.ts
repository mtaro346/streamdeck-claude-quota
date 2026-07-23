// Primary data source: Claude Code's OAuth usage endpoint.
// Reads the CLI's own OAuth token (Keychain first, credentials file as
// fallback) and asks the API for the same windows `/usage` renders — including
// the model-scoped weekly bar (Fable) that the TUI often rate-limits away.
// Pure parsing is split from I/O so it can be unit-tested directly.

import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import type { Snapshot } from "./parse.js";

const execFileAsync = promisify(execFile);

const USAGE_ENDPOINT = "https://api.anthropic.com/api/oauth/usage";
const OAUTH_BETA_HEADER = "oauth-2025-04-20";
const KEYCHAIN_SERVICE = "Claude Code-credentials";
const CREDENTIALS_FILE = path.join(process.env.HOME ?? os.homedir(), ".claude", ".credentials.json");
const FETCH_TIMEOUT_MS = 10_000;

export class UsageApiError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UsageApiError";
	}
}

type OauthCredentials = {
	accessToken: string;
	expiresAt: number | null;
};

type ApiLimit = {
	kind?: string;
	percent?: number;
	resets_at?: string;
	scope?: { model?: { display_name?: string | null } | null } | null;
	is_active?: boolean;
};

type ApiWindow = {
	utilization?: number;
	resets_at?: string;
};

function extractOauth(raw: string): OauthCredentials | null {
	try {
		const parsed = JSON.parse(raw) as { claudeAiOauth?: { accessToken?: string; expiresAt?: number } };
		const oauth = parsed.claudeAiOauth ?? (parsed as { accessToken?: string; expiresAt?: number });
		if (typeof oauth.accessToken !== "string" || oauth.accessToken.length === 0) return null;
		return {
			accessToken: oauth.accessToken,
			expiresAt: typeof oauth.expiresAt === "number" ? oauth.expiresAt : null,
		};
	} catch {
		return null;
	}
}

function isFresh(creds: OauthCredentials | null): creds is OauthCredentials {
	if (!creds) return false;
	if (creds.expiresAt === null) return true;
	return creds.expiresAt > Date.now();
}

async function readKeychainCredentials(): Promise<OauthCredentials | null> {
	try {
		// A locked keychain or a permission dialog can hang the command; a hard
		// timeout keeps the probe on its way to the TUI fallback instead.
		const { stdout } = await execFileAsync(
			"/usr/bin/security",
			["find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"],
			{ timeout: 5_000, killSignal: "SIGKILL" },
		);
		return extractOauth(stdout.trim());
	} catch {
		return null;
	}
}

function readFileCredentials(): OauthCredentials | null {
	try {
		return extractOauth(readFileSync(CREDENTIALS_FILE, "utf8"));
	} catch {
		return null;
	}
}

async function resolveAccessToken(): Promise<string> {
	const keychain = await readKeychainCredentials();
	if (isFresh(keychain)) return keychain.accessToken;
	const file = readFileCredentials();
	if (isFresh(file)) return file.accessToken;
	throw new UsageApiError("no fresh OAuth token in Keychain or credentials file");
}

function minutesUntilIso(iso: string | undefined, now: Date): number | null {
	if (typeof iso !== "string") return null;
	const target = Date.parse(iso);
	if (!Number.isFinite(target)) return null;
	return Math.max(0, Math.round((target - now.getTime()) / 60000));
}

function percentOf(value: unknown): number | null {
	if (typeof value !== "number" || !Number.isFinite(value)) return null;
	return Math.max(0, Math.min(100, Math.round(value)));
}

const MAX_LABEL_LENGTH = 12;

function labelOf(value: unknown): string {
	if (typeof value !== "string" || value.trim().length === 0) return "Model";
	return value.trim().slice(0, MAX_LABEL_LENGTH);
}

function pickScopedLimit(limits: ApiLimit[]): ApiLimit | null {
	const scoped = limits.filter((l) => l.kind === "weekly_scoped");
	if (scoped.length === 0) return null;
	return scoped.find((l) => l.is_active === true) ?? scoped[0];
}

export function parseUsageApiResponse(payload: unknown, now: Date = new Date()): Snapshot {
	if (typeof payload !== "object" || payload === null) {
		throw new UsageApiError("usage API payload is not an object");
	}
	const body = payload as { limits?: unknown; five_hour?: ApiWindow | null; seven_day?: ApiWindow | null };

	let sessionPercent: number | null = null;
	let sessionResetMinutes: number | null = null;
	let weeklyPercent: number | null = null;
	let weeklyResetMinutes: number | null = null;
	let fablePercent: number | null = null;
	let fableResetMinutes: number | null = null;
	let fableLabel: string | null = null;

	if (Array.isArray(body.limits)) {
		const limits = body.limits as ApiLimit[];
		const session = limits.find((l) => l.kind === "session") ?? null;
		const weekly = limits.find((l) => l.kind === "weekly_all") ?? null;
		const scoped = pickScopedLimit(limits);

		sessionPercent = percentOf(session?.percent);
		sessionResetMinutes = session ? minutesUntilIso(session.resets_at, now) : null;
		weeklyPercent = percentOf(weekly?.percent);
		weeklyResetMinutes = weekly ? minutesUntilIso(weekly.resets_at, now) : null;
		fablePercent = percentOf(scoped?.percent);
		fableResetMinutes = scoped ? minutesUntilIso(scoped.resets_at, now) : null;
		fableLabel = fablePercent !== null ? labelOf(scoped?.scope?.model?.display_name) : null;
	}

	// Older payload shape (or a partial limits array): top-level windows.
	if (sessionPercent === null && body.five_hour) {
		sessionPercent = percentOf(body.five_hour.utilization);
		sessionResetMinutes = minutesUntilIso(body.five_hour.resets_at, now);
	}
	if (weeklyPercent === null && body.seven_day) {
		weeklyPercent = percentOf(body.seven_day.utilization);
		weeklyResetMinutes = minutesUntilIso(body.seven_day.resets_at, now);
	}

	// The action treats a snapshot without a session percent as unusable, so a
	// session-less payload must fail here and let the TUI fallback take over.
	if (sessionPercent === null) {
		throw new UsageApiError("usage API payload has no session window");
	}

	return {
		sessionPercent,
		sessionResetText: null,
		sessionResetMinutes,
		weeklyPercent,
		weeklyResetText: null,
		weeklyResetMinutes,
		fablePercent,
		fableResetMinutes,
		fableLabel,
		source: "api",
		rawTextPreview: "usage API",
	};
}

export async function fetchUsageSnapshot(now: Date = new Date()): Promise<Snapshot> {
	const accessToken = await resolveAccessToken();
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const response = await fetch(USAGE_ENDPOINT, {
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"anthropic-beta": OAUTH_BETA_HEADER,
				"Content-Type": "application/json",
			},
			signal: controller.signal,
		});
		if (!response.ok) {
			throw new UsageApiError(`usage API returned HTTP ${response.status}`);
		}
		return parseUsageApiResponse(await response.json(), now);
	} finally {
		clearTimeout(timer);
	}
}
