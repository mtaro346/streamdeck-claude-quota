import { test } from "node:test";
import assert from "node:assert/strict";

import { formatCountdown } from "../src/format.ts";

test("formatCountdown returns em dash for null", () => {
	assert.equal(formatCountdown(null), "—");
});

test("formatCountdown returns 0m at or below zero", () => {
	assert.equal(formatCountdown(0), "0m");
	assert.equal(formatCountdown(-5), "0m");
});

test("formatCountdown shows minutes only under an hour", () => {
	assert.equal(formatCountdown(12), "12m");
	assert.equal(formatCountdown(59), "59m");
});

test("formatCountdown shows hours and minutes under a day (session window)", () => {
	assert.equal(formatCountdown(60), "1h 0m");
	assert.equal(formatCountdown(200), "3h 20m");
	assert.equal(formatCountdown(23 * 60 + 59), "23h 59m");
});

test("formatCountdown shows days and hours for multi-day weekly window", () => {
	assert.equal(formatCountdown(24 * 60), "1d 0h");
	assert.equal(formatCountdown(6 * 24 * 60 + 3 * 60), "6d 3h");
	assert.equal(formatCountdown(7 * 24 * 60), "7d 0h");
});
