import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { parseRetryAfterMs, parseUsageApiResponse } from "../src/usage-api.ts";

// Real /api/oauth/usage capture from 2026-07-23 (Claude Max, Fable 5 account).
const FIXTURE = new URL("./fixtures/usage-api-2026-07-23.json", import.meta.url);
const payload = JSON.parse(readFileSync(FIXTURE, "utf8"));

// Captured at 2026-07-23 22:35 JST = 13:35 UTC.
const CAPTURED_AT = new Date("2026-07-23T13:35:00Z");

test("parseUsageApiResponse extracts session window from limits array", () => {
	// Act
	const snapshot = parseUsageApiResponse(payload, CAPTURED_AT);

	// Assert
	assert.equal(snapshot.sessionPercent, 12);
	// 13:35:00 → 17:19:59 = 3h 45m ≈ 225 minutes
	assert.equal(snapshot.sessionResetMinutes, 225);
});

test("parseUsageApiResponse extracts weekly (all models) window", () => {
	// Act
	const snapshot = parseUsageApiResponse(payload, CAPTURED_AT);

	// Assert
	assert.equal(snapshot.weeklyPercent, 10);
	// 2026-07-23 13:35 → 2026-07-30 00:59:59 = 6d 11h 25m ≈ 9325 minutes
	assert.equal(snapshot.weeklyResetMinutes, 9325);
});

test("parseUsageApiResponse extracts the model-scoped (Fable) weekly window", () => {
	// Act
	const snapshot = parseUsageApiResponse(payload, CAPTURED_AT);

	// Assert
	assert.equal(snapshot.fablePercent, 13);
	assert.equal(snapshot.fableLabel, "Fable");
	assert.equal(snapshot.fableResetMinutes, 9325);
});

test("parseUsageApiResponse leaves fable null when no scoped limit exists", () => {
	// Arrange
	const withoutScoped = {
		...payload,
		limits: payload.limits.filter((l: { kind: string }) => l.kind !== "weekly_scoped"),
	};

	// Act
	const snapshot = parseUsageApiResponse(withoutScoped, CAPTURED_AT);

	// Assert
	assert.equal(snapshot.fablePercent, null);
	assert.equal(snapshot.fableLabel, null);
	assert.equal(snapshot.sessionPercent, 12);
});

test("parseUsageApiResponse falls back to five_hour/seven_day when limits is missing", () => {
	// Arrange
	const legacy = { five_hour: payload.five_hour, seven_day: payload.seven_day };

	// Act
	const snapshot = parseUsageApiResponse(legacy, CAPTURED_AT);

	// Assert
	assert.equal(snapshot.sessionPercent, 12);
	assert.equal(snapshot.weeklyPercent, 10);
	assert.equal(snapshot.fablePercent, null);
});

test("parseUsageApiResponse throws on a payload without any usage windows", () => {
	// Assert
	assert.throws(() => parseUsageApiResponse({}, CAPTURED_AT));
	assert.throws(() => parseUsageApiResponse(null, CAPTURED_AT));
	assert.throws(() => parseUsageApiResponse("nope", CAPTURED_AT));
});

test("parseUsageApiResponse throws when the session window is missing", () => {
	// Arrange: weekly-only payload — the action can't render without a session
	// percent, so this must fail over to the TUI probe instead of half-succeeding.
	const weeklyOnly = { seven_day: payload.seven_day };

	// Assert
	assert.throws(() => parseUsageApiResponse(weeklyOnly, CAPTURED_AT));
});

test("parseUsageApiResponse sanitizes a non-string scoped label", () => {
	// Arrange: display_name comes from an external API — a number must not
	// leak into the renderer (toUpperCase would throw).
	const numericLabel = {
		...payload,
		limits: payload.limits.map((l: { kind: string }) =>
			l.kind === "weekly_scoped"
				? { ...l, scope: { model: { display_name: 42 } } }
				: l,
		),
	};

	// Act
	const snapshot = parseUsageApiResponse(numericLabel, CAPTURED_AT);

	// Assert
	assert.equal(snapshot.fableLabel, "Model");
	assert.equal(snapshot.fablePercent, 13);
});

test("parseUsageApiResponse clamps past reset times to zero minutes", () => {
	// Arrange: captured "after" the session window already reset.
	const later = new Date("2026-07-23T18:00:00Z");

	// Act
	const snapshot = parseUsageApiResponse(payload, later);

	// Assert
	assert.equal(snapshot.sessionResetMinutes, 0);
});

test("parseUsageApiResponse prefers an active scoped limit over inactive ones", () => {
	// Arrange: two scoped rows; only the Fable one is active.
	const twoScoped = {
		...payload,
		limits: [
			...payload.limits.filter((l: { kind: string }) => l.kind !== "weekly_scoped"),
			{
				kind: "weekly_scoped",
				group: "weekly",
				percent: 55,
				resets_at: "2026-07-30T00:59:59+00:00",
				scope: { model: { display_name: "Opus" } },
				is_active: false,
			},
			{
				kind: "weekly_scoped",
				group: "weekly",
				percent: 13,
				resets_at: "2026-07-30T00:59:59+00:00",
				scope: { model: { display_name: "Fable" } },
				is_active: true,
			},
		],
	};

	// Act
	const snapshot = parseUsageApiResponse(twoScoped, CAPTURED_AT);

	// Assert
	assert.equal(snapshot.fablePercent, 13);
	assert.equal(snapshot.fableLabel, "Fable");
});

test("parseRetryAfterMs converts a seconds header to milliseconds", () => {
	// Act / Assert
	assert.equal(parseRetryAfterMs("120"), 120_000);
	assert.equal(parseRetryAfterMs(" 45 "), 45_000);
});

test("parseRetryAfterMs treats the endpoint's `retry-after: 0` as no guidance", () => {
	// The live endpoint answers 429 with `retry-after: 0`, which would otherwise
	// mean "retry immediately" and defeat the pause entirely.

	// Act / Assert
	assert.equal(parseRetryAfterMs("0"), null);
	assert.equal(parseRetryAfterMs("-5"), null);
});

test("parseRetryAfterMs returns null for a missing or unparsable header", () => {
	// Act / Assert
	assert.equal(parseRetryAfterMs(null), null);
	assert.equal(parseRetryAfterMs(""), null);
	// An HTTP-date form is valid per RFC but unused here; fall back to the default.
	assert.equal(parseRetryAfterMs("Tue, 04 Aug 2026 08:00:00 GMT"), null);
});
