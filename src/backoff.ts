// A pause that survives across polls.
//
// `/api/oauth/usage` is rate limited per account, and the budget is shared with
// every other reader of it — the Claude Code CLI fetches the same endpoint on
// launch, as does any other usage widget. So a 429 means the budget is already
// spent, and the only useful response is to stop asking for a while rather than
// to retry through another path. Pure state so it can be unit-tested directly.

/** Long enough for the hourly budget to refill, short enough to feel live. */
export const DEFAULT_BACKOFF_MS = 10 * 60_000;

export class RateLimitGate {
	private closedUntil = 0;
	// Written out rather than declared as a constructor parameter property —
	// the tests load this module through Node's strip-only TypeScript mode,
	// which rejects that syntax.
	private readonly defaultBackoffMs: number;

	constructor(defaultBackoffMs: number = DEFAULT_BACKOFF_MS) {
		this.defaultBackoffMs = defaultBackoffMs;
	}

	isOpen(now: number = Date.now()): boolean {
		return now >= this.closedUntil;
	}

	remainingMs(now: number = Date.now()): number {
		return Math.max(0, this.closedUntil - now);
	}

	/**
	 * Pauses requests. A usable `retry-after` wins over the default, but never
	 * shortens a longer pause already in flight — the endpoint has been observed
	 * answering with hints far below its actual recovery time.
	 */
	close(retryAfterMs: number | null, now: number = Date.now()): void {
		const waitMs = retryAfterMs !== null && retryAfterMs > 0 ? retryAfterMs : this.defaultBackoffMs;
		this.closedUntil = Math.max(this.closedUntil, now + waitMs);
	}

	/** Lifts the pause — call after a request succeeds. */
	open(): void {
		this.closedUntil = 0;
	}
}
