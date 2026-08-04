import { test } from "node:test";
import assert from "node:assert/strict";

import { MIN_POLL_SECONDS, resolveSettings } from "../src/settings.ts";

test("the default poll interval stays within the usage endpoint's budget", () => {
	// Act
	const resolved = resolveSettings({});

	// Assert
	assert.equal(resolved.pollSeconds, MIN_POLL_SECONDS);
	assert.equal(MIN_POLL_SECONDS, 300);
});

test("a poll interval below the floor is clamped up", () => {
	// Act — the value a v0.5.x profile would carry over.
	const resolved = resolveSettings({ pollSeconds: 60 });

	// Assert
	assert.equal(resolved.pollSeconds, MIN_POLL_SECONDS);
});

test("a poll interval above the floor is kept as configured", () => {
	// Act
	const resolved = resolveSettings({ pollSeconds: "900" });

	// Assert
	assert.equal(resolved.pollSeconds, 900);
});
