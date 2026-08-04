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
	private coldProbeSpent = false;
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
		// Only a genuinely new pause refreshes the cold-probe allowance;
		// extending a running one must not hand out a second probe.
		if (this.isOpen(now)) this.coldProbeSpent = false;
		const waitMs = retryAfterMs !== null && retryAfterMs > 0 ? retryAfterMs : this.defaultBackoffMs;
		this.closedUntil = Math.max(this.closedUntil, now + waitMs);
	}

	/** Lifts the pause — call after a request succeeds. */
	open(): void {
		this.closedUntil = 0;
		this.coldProbeSpent = false;
	}

	/**
	 * Claims the single fallback probe allowed while paused, for a key that has
	 * nothing to display yet. Latched because the fallback launches `claude`,
	 * which spends from the very budget the pause is waiting on — without this
	 * a probe that keeps failing would relaunch it on every poll and rebuild the
	 * loop the pause exists to break. Returns false once it is spent.
	 */
	claimColdProbe(): boolean {
		if (this.coldProbeSpent) return false;
		this.coldProbeSpent = true;
		return true;
	}
}
