import { RateLimitGate } from "./backoff.js";
import { fetchUsageSnapshot, type Snapshot, UsageApiRateLimitError } from "./usage-api.js";

export type { Snapshot } from "./usage-api.js";
export { formatCountdown } from "./format.js";

// Raised instead of fetching while the usage endpoint is rate limited. Callers
// keep showing their last snapshot; the pause is expected, not a failure.
export class UsageApiPausedError extends Error {
	constructor(public readonly remainingMs: number) {
		super(`usage API paused for ${Math.ceil(remainingMs / 60_000)}m after a rate limit`);
		this.name = "UsageApiPausedError";
	}
}

const rateLimitGate = new RateLimitGate();

// The usage API is the only source. There is deliberately no fallback that
// launches `claude` to scrape `/usage`: every launch spends Claude-side budget
// while the user is doing nothing. An expired token simply waits until the
// user's next Claude Code session refreshes it.
export async function probe(): Promise<Snapshot> {
	const pausedMs = rateLimitGate.remainingMs();
	if (pausedMs > 0) throw new UsageApiPausedError(pausedMs);
	try {
		const snapshot = await fetchUsageSnapshot();
		rateLimitGate.open();
		return snapshot;
	} catch (err) {
		if (!(err instanceof UsageApiRateLimitError)) throw err;
		rateLimitGate.close(err.retryAfterMs);
		throw new UsageApiPausedError(rateLimitGate.remainingMs());
	}
}
