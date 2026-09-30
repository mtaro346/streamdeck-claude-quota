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

test("a custom default backoff is used when retry-after is absent", () => {
	// Arrange
	const gate = new RateLimitGate(120_000);

	// Act
	gate.close(null, T0);

	// Assert
	assert.equal(gate.remainingMs(T0), 120_000);
});
