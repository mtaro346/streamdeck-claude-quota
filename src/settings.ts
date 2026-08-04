// `/api/oauth/usage` is rate limited per account (~30 requests an hour) and the
// budget is shared with the Claude Code CLI and any other usage widget, so the
// poll interval carries a hard floor rather than a UI-only minimum.
export const MIN_POLL_SECONDS = 300;

export type Settings = {
	fontFamily?: string;
	bgColor?: string;
	trackColor?: string;
	sessionColor?: string;
	weeklyColor?: string;
	fableColor?: string;
	sessionLabelColor?: string;
	weeklyLabelColor?: string;
	fableLabelColor?: string;
	/** @deprecated single title color, superseded by the per-row label colors. */
	labelColor?: string;
	percentColor?: string;
	resetColor?: string;
	watermarkColor?: string;
	watermarkOpacity?: number | string;
	pollSeconds?: number | string;
	/** @deprecated v0.4.x keys. Kept only as fallbacks so upgrading users don't silently lose their color customizations. */
	barColor?: string;
	/** @deprecated v0.4.x key, superseded by resetColor. */
	countdownColor?: string;
};

export type ResolvedSettings = {
	fontFamily: string;
	bgColor: string;
	trackColor: string;
	sessionColor: string;
	weeklyColor: string;
	fableColor: string;
	sessionLabelColor: string;
	weeklyLabelColor: string;
	fableLabelColor: string;
	percentColor: string;
	resetColor: string;
	watermarkColor: string;
	watermarkOpacity: number;
	pollSeconds: number;
};

export const DEFAULTS: ResolvedSettings = {
	fontFamily: "Helvetica, Arial, sans-serif",
	bgColor: "#0d0d0d",
	trackColor: "#2a2622",
	sessionColor: "#d97757",
	weeklyColor: "#e0a34e",
	fableColor: "#a78bfa",
	// Pale tints of each bar color — distinct from the white percent and
	// readable on both the dark track and the colored fill.
	sessionLabelColor: "#ffc9a8",
	weeklyLabelColor: "#ffdf9e",
	fableLabelColor: "#d9c8ff",
	percentColor: "#ffffff",
	// White (slightly dimmed at render time) — the countdown now sits on top of
	// the colored fills, where the old warm gray sank into the amber bar.
	resetColor: "#ffffff",
	watermarkColor: "#ffffff",
	// Strong enough to ghost through the translucent bars.
	watermarkOpacity: 0.15,
	pollSeconds: MIN_POLL_SECONDS,
};

function num(value: unknown, fallback: number): number {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "") {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return fallback;
}

function str(value: unknown, fallback: string): string {
	if (typeof value === "string" && value.trim() !== "") return value;
	return fallback;
}

export function resolveSettings(input: Settings | undefined | null): ResolvedSettings {
	const s = input ?? {};
	return {
		fontFamily: str(s.fontFamily, DEFAULTS.fontFamily),
		bgColor: str(s.bgColor, DEFAULTS.bgColor),
		trackColor: str(s.trackColor, DEFAULTS.trackColor),
		// sessionColor falls back to the deprecated v0.4.x barColor so existing customizations survive upgrade.
		sessionColor: str(s.sessionColor, str(s.barColor, DEFAULTS.sessionColor)),
		weeklyColor: str(s.weeklyColor, DEFAULTS.weeklyColor),
		fableColor: str(s.fableColor, DEFAULTS.fableColor),
		sessionLabelColor: str(s.sessionLabelColor, DEFAULTS.sessionLabelColor),
		weeklyLabelColor: str(s.weeklyLabelColor, DEFAULTS.weeklyLabelColor),
		fableLabelColor: str(s.fableLabelColor, DEFAULTS.fableLabelColor),
		percentColor: str(s.percentColor, DEFAULTS.percentColor),
		resetColor: str(s.resetColor, str(s.countdownColor, DEFAULTS.resetColor)),
		watermarkColor: str(s.watermarkColor, DEFAULTS.watermarkColor),
		watermarkOpacity: num(s.watermarkOpacity, DEFAULTS.watermarkOpacity),
		// Clamped here so every caller — and any profile saved by an older
		// version — lands inside the endpoint's budget.
		pollSeconds: Math.max(MIN_POLL_SECONDS, num(s.pollSeconds, DEFAULTS.pollSeconds)),
	};
}
