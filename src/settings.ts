export type Settings = {
	fontFamily?: string;
	percentFontSize?: number | string;
	percentFontWeight?: number | string;
	percentX?: number | string;
	percentY?: number | string;
	percentColor?: string;
	countdownFontSize?: number | string;
	countdownFontWeight?: number | string;
	countdownX?: number | string;
	countdownY?: number | string;
	countdownColor?: string;
	barColor?: string;
	bgColor?: string;
	iconSizePercent?: number | string;
	pollSeconds?: number | string;
};

export type ResolvedSettings = {
	fontFamily: string;
	percentFontSize: number;
	percentFontWeight: number;
	percentX: number;
	percentY: number;
	percentColor: string;
	countdownFontSize: number;
	countdownFontWeight: number;
	countdownX: number;
	countdownY: number;
	countdownColor: string;
	barColor: string;
	bgColor: string;
	iconSizePercent: number;
	pollSeconds: number;
};

export const DEFAULTS: ResolvedSettings = {
	fontFamily: "Helvetica, Arial, sans-serif",
	percentFontSize: 28,
	percentFontWeight: 800,
	percentX: 72,
	percentY: 32,
	percentColor: "#ffffff",
	countdownFontSize: 16,
	countdownFontWeight: 700,
	countdownX: 72,
	countdownY: 132,
	countdownColor: "#ffffff",
	barColor: "#d97757",
	bgColor: "#0d0d0d",
	iconSizePercent: 69,
	pollSeconds: 300,
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
		percentFontSize: num(s.percentFontSize, DEFAULTS.percentFontSize),
		percentFontWeight: num(s.percentFontWeight, DEFAULTS.percentFontWeight),
		percentX: num(s.percentX, DEFAULTS.percentX),
		percentY: num(s.percentY, DEFAULTS.percentY),
		percentColor: str(s.percentColor, DEFAULTS.percentColor),
		countdownFontSize: num(s.countdownFontSize, DEFAULTS.countdownFontSize),
		countdownFontWeight: num(s.countdownFontWeight, DEFAULTS.countdownFontWeight),
		countdownX: num(s.countdownX, DEFAULTS.countdownX),
		countdownY: num(s.countdownY, DEFAULTS.countdownY),
		countdownColor: str(s.countdownColor, DEFAULTS.countdownColor),
		barColor: str(s.barColor, DEFAULTS.barColor),
		bgColor: str(s.bgColor, DEFAULTS.bgColor),
		iconSizePercent: num(s.iconSizePercent, DEFAULTS.iconSizePercent),
		pollSeconds: num(s.pollSeconds, DEFAULTS.pollSeconds),
	};
}
