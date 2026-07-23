// Pure parsing logic for `claude /usage` terminal output.
// No Stream Deck dependencies so it can be unit-tested directly.

export type Snapshot = {
	sessionPercent: number | null;
	sessionResetText: string | null;
	sessionResetMinutes: number | null;
	weeklyPercent: number | null;
	weeklyResetText: string | null;
	weeklyResetMinutes: number | null;
	// Model-scoped weekly window (e.g. the dedicated Fable bar on Max plans).
	// Only the usage API provides these; the TUI fallback leaves them null.
	fablePercent: number | null;
	fableResetMinutes: number | null;
	fableLabel: string | null;
	// Which prober produced this snapshot. An API-sourced null fable is
	// authoritative ("no scoped limit"); a TUI-sourced null just means the
	// source can't see it — the action carries the last API value briefly.
	source: "api" | "tui";
	rawTextPreview: string;
};

const PREVIEW_LENGTH = 600;
const BLOCK_TAIL_LENGTH = 400;

export function cleanAnsi(input: string): string {
	let s = input;
	// Cursor forward (relative): ESC[<n>C → n spaces
	s = s.replace(/\x1b\[(\d+)C/g, (_, n) => " ".repeat(parseInt(n, 10)));
	// Cursor horizontal absolute: ESC[<n>G → single space.
	// Claude Code >= 2.1.x renders words with absolute column moves
	// ("Esc\x1b[7Gto\x1b[10Gcancel"), so dropping these without a
	// separator would collapse words ("Currentsession").
	s = s.replace(/\x1b\[\d*G/g, " ");
	// Remaining CSI sequences (incl. private modes like ESC[<u)
	s = s.replace(/\x1b\[[<?>=!;0-9]*[a-zA-Z]/g, "");
	s = s.replace(/\x1b[<>=DM78]/g, "");
	// Charset selection: ESC(B etc.
	s = s.replace(/\x1b\([AB0]/g, "");
	// OSC sequences
	s = s.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "");
	s = s.replace(/[\x00-\x08\x0b-\x1f]/g, "");
	return s;
}

const ResetWeekly = /Resets\s+([A-Z][a-z]{2})\s+(\d{1,2})\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;
const ResetSessionToday = /Resets\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;
const PercentUsed = /(\d{1,3})%\s*used/;

type ParsedBlock = { percent: number | null; resetText: string | null; resetMinutes: number | null };

export function parseSession(blockText: string, now: Date = new Date()): ParsedBlock {
	const pctMatch = blockText.match(PercentUsed);
	const percent = pctMatch ? parseInt(pctMatch[1], 10) : null;

	const resetMatch = blockText.match(ResetSessionToday);
	if (!resetMatch) return { percent, resetText: null, resetMinutes: null };

	const hour = parseInt(resetMatch[1], 10);
	const minute = resetMatch[2] ? parseInt(resetMatch[2], 10) : 0;
	const ampm = resetMatch[3].toLowerCase();
	let h24 = hour % 12;
	if (ampm === "pm") h24 += 12;

	const target = new Date(now);
	target.setHours(h24, minute, 0, 0);
	if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);

	const minutes = Math.max(0, Math.round((target.getTime() - now.getTime()) / 60000));
	const resetText = `${hour}:${minute.toString().padStart(2, "0")}${ampm}`;
	return { percent, resetText, resetMinutes: minutes };
}

export function parseWeekly(blockText: string, now: Date = new Date()): ParsedBlock {
	const pctMatch = blockText.match(PercentUsed);
	const percent = pctMatch ? parseInt(pctMatch[1], 10) : null;

	const resetMatch = blockText.match(ResetWeekly);
	if (!resetMatch) return { percent, resetText: null, resetMinutes: null };

	const monthStr = resetMatch[1];
	const day = parseInt(resetMatch[2], 10);
	const hour = parseInt(resetMatch[3], 10);
	const minute = resetMatch[4] ? parseInt(resetMatch[4], 10) : 0;
	const ampm = resetMatch[5].toLowerCase();
	let h24 = hour % 12;
	if (ampm === "pm") h24 += 12;

	const months: Record<string, number> = {
		Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
		Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
	};
	const monthIdx = months[monthStr];
	if (monthIdx === undefined) return { percent, resetText: null, resetMinutes: null };

	let target = new Date(now.getFullYear(), monthIdx, day, h24, minute, 0, 0);
	if (target.getTime() < now.getTime() - 7 * 86400 * 1000) {
		target = new Date(now.getFullYear() + 1, monthIdx, day, h24, minute, 0, 0);
	}
	const minutes = Math.max(0, Math.round((target.getTime() - now.getTime()) / 60000));
	const resetText = `${monthStr} ${day} ${hour}${minute > 0 ? `:${minute.toString().padStart(2, "0")}` : ""}${ampm}`;
	return { percent, resetText, resetMinutes: minutes };
}

export function extractBlock(cleaned: string, header: RegExp): string | null {
	const match = cleaned.match(header);
	if (!match || match.index === undefined) return null;
	const start = match.index + match[0].length;
	return cleaned.slice(start, start + BLOCK_TAIL_LENGTH);
}

const SessionHeader = /Current\s+session(?!\w)/;
const WeeklyHeader = /Current\s+week\s*\(all\s+models\)/;

export function parseUsageOutput(raw: string, now: Date = new Date()): Snapshot {
	const cleaned = cleanAnsi(raw);

	const sessionBlock = extractBlock(cleaned, SessionHeader);
	const weeklyBlock = extractBlock(cleaned, WeeklyHeader);

	const empty: ParsedBlock = { percent: null, resetText: null, resetMinutes: null };
	const session = sessionBlock ? parseSession(sessionBlock, now) : empty;
	const weekly = weeklyBlock ? parseWeekly(weeklyBlock, now) : empty;

	return {
		sessionPercent: session.percent,
		sessionResetText: session.resetText,
		sessionResetMinutes: session.resetMinutes,
		weeklyPercent: weekly.percent,
		weeklyResetText: weekly.resetText,
		weeklyResetMinutes: weekly.resetMinutes,
		fablePercent: null,
		fableResetMinutes: null,
		fableLabel: null,
		source: "tui",
		rawTextPreview: cleaned.slice(0, PREVIEW_LENGTH),
	};
}

// A torn frame can yield a percent without its reset time, or the session
// block before the weekly block has rendered; both count as incomplete so the
// probe can retry for a settled frame with every window populated.
export function isCompleteSnapshot(snapshot: Snapshot): boolean {
	return (
		snapshot.sessionPercent !== null &&
		snapshot.sessionResetMinutes !== null &&
		snapshot.weeklyPercent !== null &&
		snapshot.weeklyResetMinutes !== null
	);
}


// Chooses the best snapshot to display when neither attempt was fully complete.
// Prefers the freshest attempt that has a session percent, favoring one that
// also captured the weekly window. Returns null only when neither has a session.
export function pickUsableSnapshot(first: Snapshot | null, second: Snapshot | null): Snapshot | null {
	const usable = [second, first].filter(
		(s): s is Snapshot => s !== null && s.sessionPercent !== null,
	);
	return usable.find((s) => s.weeklyPercent !== null) ?? usable[0] ?? null;
}
