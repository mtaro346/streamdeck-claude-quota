// Pure formatting helpers. No Stream Deck dependencies so they can be
// unit-tested directly with `node --test`.

// Formats a "time remaining" countdown from minutes.
// - session windows stay under a day → "3h 20m" / "12m"
// - weekly windows can span days → "6d 3h"
export function formatCountdown(minutes: number | null): string {
	if (minutes === null) return "—";
	if (minutes <= 0) return "0m";
	const totalHours = Math.floor(minutes / 60);
	const days = Math.floor(totalHours / 24);
	const hours = totalHours % 24;
	const mins = minutes % 60;
	if (days > 0) return `${days}d ${hours}h`;
	if (totalHours > 0) return `${totalHours}h ${mins}m`;
	return `${mins}m`;
}
