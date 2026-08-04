import { test } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_BACKOFF_MS, RateLimitGate } from "../src/backoff.ts";

const T0 = 1_000_000;

test("a fresh gate is open", () => {
	// Arrange
	const gate = new RateLimitGate();

	// Act / Assert
	assert.equal(gate.isOpen(T0), true);
	assert.equal(gate.remainingMs(T0), 0);
});

test("close() holds the gate shut for the default backoff when no retry-after is given", () => {
	// Arrange
	const gate = new RateLimitGate();

	// Act
	gate.close(null, T0);

	// Assert
	assert.equal(gate.isOpen(T0), false);
	assert.equal(gate.remainingMs(T0), DEFAULT_BACKOFF_MS);
	assert.equal(gate.isOpen(T0 + DEFAULT_BACKOFF_MS - 1), false);
	assert.equal(gate.isOpen(T0 + DEFAULT_BACKOFF_MS), true);
});

test("close() honors a usable retry-after over the default backoff", () => {
	// Arrange
	const gate = new RateLimitGate();

	// Act
	gate.close(90_000, T0);

	// Assert
	assert.equal(gate.remainingMs(T0), 90_000);
	assert.equal(gate.isOpen(T0 + 90_000), true);
});

test("close() never shortens a pause that is already longer", () => {
	// Arrange — a long pause is already running.
	const gate = new RateLimitGate();
	gate.close(600_000, T0);

	// Act — the endpoint then answers with a much smaller hint.
	gate.close(30_000, T0 + 1_000);

	// Assert
	assert.equal(gate.remainingMs(T0 + 1_000), 599_000);
});

test("open() lifts the pause immediately after a successful call", () => {
	// Arrange
	const gate = new RateLimitGate();
	gate.close(null, T0);

	// Act
	gate.open();

	// Assert
	assert.equal(gate.isOpen(T0), true);
	assert.equal(gate.remainingMs(T0), 0);
});

test("claimColdProbe hands out exactly one probe per pause", () => {
	// Arrange
	const gate = new RateLimitGate();
	gate.close(null, T0);

	// Act / Assert — a key with nothing to show gets one, the next poll does not.
	assert.equal(gate.claimColdProbe(), true);
	assert.equal(gate.claimColdProbe(), false);
	assert.equal(gate.claimColdProbe(), false);
});

test("a later pause hands out a fresh cold probe", () => {
	// Arrange — one pause is spent and has since elapsed.
	const gate = new RateLimitGate();
	gate.close(null, T0);
	gate.claimColdProbe();

	// Act — the endpoint rate limits again after the first pause ended.
	const later = T0 + DEFAULT_BACKOFF_MS + 1;
	gate.close(null, later);

	// Assert
	assert.equal(gate.claimColdProbe(), true);
});

test("extending an active pause does not hand out another cold probe", () => {
	// Arrange
	const gate = new RateLimitGate();
	gate.close(null, T0);
	gate.claimColdProbe();

	// Act — a second 429 lands while the pause is still running.
	gate.close(null, T0 + 60_000);

	// Assert — still the same pause, so the allowance stays spent.
	assert.equal(gate.claimColdProbe(), false);
});

test("open() restores the cold probe allowance", () => {
	// Arrange
	const gate = new RateLimitGate();
	gate.close(null, T0);
	gate.claimColdProbe();

	// Act
	gate.open();
	gate.close(null, T0 + 1_000);

	// Assert
	assert.equal(gate.claimColdProbe(), true);
});

test("a custom default backoff is used when retry-after is absent", () => {
	// Arrange
	const gate = new RateLimitGate(120_000);

	// Act
	gate.close(null, T0);

	// Assert
	assert.equal(gate.remainingMs(T0), 120_000);
});
