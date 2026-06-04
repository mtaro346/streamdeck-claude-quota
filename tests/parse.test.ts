import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { cleanAnsi, parseUsageOutput } from "../src/parse.ts";

// Real `claude /usage` capture from Claude Code 2.1.162 (2026-06-04).
// CC >= 2.1.x renders text with absolute column moves (ESC[<n>G) instead of
// spaces / relative moves, which broke the previous parser.
const FIXTURE = new URL("./fixtures/usage-cc-2.1.162.raw", import.meta.url);
const raw = readFileSync(FIXTURE, "utf8");

// Fixture was captured at 2026-06-04 ~17:00 JST; session reset 7:30pm same day.
const CAPTURED_AT = new Date("2026-06-04T17:00:00+09:00");

test("cleanAnsi keeps words separated when ESC[nG column moves are used", () => {
	// Arrange
	const input = "Esc\x1b[7Gto\x1b[10Gcancel";

	// Act
	const cleaned = cleanAnsi(input);

	// Assert
	assert.match(cleaned, /Esc\s+to\s+cancel/);
});

test("cleanAnsi still expands relative cursor moves (ESC[nC) to spaces", () => {
	// Arrange
	const input = "11%\x1b[2Cused";

	// Act
	const cleaned = cleanAnsi(input);

	// Assert
	assert.equal(cleaned, "11%  used");
});

test("parseUsageOutput extracts session usage from CC 2.1.162 capture", () => {
	// Act
	const snapshot = parseUsageOutput(raw, CAPTURED_AT);

	// Assert
	assert.equal(snapshot.sessionPercent, 11);
	assert.equal(snapshot.sessionResetText, "7:30pm");
	// 17:00 → 19:30 = 150 minutes
	assert.equal(snapshot.sessionResetMinutes, 150);
});

test("parseUsageOutput extracts weekly usage from CC 2.1.162 capture", () => {
	// Act
	const snapshot = parseUsageOutput(raw, CAPTURED_AT);

	// Assert
	assert.equal(snapshot.weeklyPercent, 10);
	assert.equal(snapshot.weeklyResetText, "Jun 11 10am");
	// 2026-06-04 17:00 JST → 2026-06-11 10:00 JST = 6d 17h = 9660 minutes
	assert.equal(snapshot.weeklyResetMinutes, 9660);
});

test("parseUsageOutput returns nulls when usage panel is absent", () => {
	// Arrange
	const promptOnly = "\x1b[37mOpus 4.8 (1M context)\x1b[39m │ ~/projects";

	// Act
	const snapshot = parseUsageOutput(promptOnly, CAPTURED_AT);

	// Assert
	assert.equal(snapshot.sessionPercent, null);
	assert.equal(snapshot.weeklyPercent, null);
});
