import { type ResolvedSettings, resolveSettings, type Settings } from "./settings.js";

const CANVAS = 144;

// Brand mark (LobeHub Claude glyph, 24-unit viewBox) painted faintly behind
// the bars so the key reads as "Claude" without needing a text label.
const CLAUDE_PATH = "M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z";
const WATERMARK_SIZE = 132;
const WM_OFFSET = (CANVAS - WATERMARK_SIZE) / 2;
const WM_SCALE = (WATERMARK_SIZE / 24).toFixed(4);

const PAD_X = 8;
const BAR_W = CANVAS - PAD_X * 2;
// Thick pill bars with the label and percent inside the bar itself — no
// separate text lines, so each row can be tall and the type large.
const BAR_H = 42;
const BAR_RX = 12;
const TEXT_PAD = 10;
const TITLE_FONT_SIZE = 25;
// Bars are translucent so the brand watermark stays visible through them.
const TRACK_OPACITY = 0.5;
const FILL_OPACITY = 0.85;

// Vertical origin of each row's bar — tight 4px gaps so the bars fill the key.
const SESSION_OFFSET_Y = 5;
const WEEKLY_OFFSET_Y = 51;
const FABLE_OFFSET_Y = 97;

// Fixed row labels; the Fable row uses a single letter so the title stays
// short even at 100%.
const SESSION_LABEL = "5H";
const WEEKLY_LABEL = "7D";
const FABLE_LABEL = "F";

export type QuotaRow = {
	// null means "not yet fetched" — rendered as an em dash with no fill bar,
	// so a genuine 0% is never confused with missing data.
	percent: number | null;
	countdown: string;
};

export type RenderInput = {
	session: QuotaRow;
	weekly: QuotaRow;
	fable: QuotaRow;
	isActive: boolean;
	settings?: Settings | null;
};

function clampPercent(p: number): number {
	return Math.max(0, Math.min(100, p));
}

function escapeXml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

function row(
	offsetY: number,
	label: string,
	percent: number | null,
	countdown: string,
	barColor: string,
	labelColor: string,
	isActive: boolean,
	s: ResolvedSettings,
): string {
	const hasValue = isActive && percent !== null;
	const clamped = clampPercent(percent ?? 0);
	// Keep tiny fills a full pill (at least 2×radius) so low percents don't
	// collapse into a squashed blob.
	const fillW = clamped > 0 ? Math.max(Math.round((BAR_W * clamped) / 100), BAR_RX * 2) : 0;
	const percentLabel = hasValue ? `${Math.round(clamped)}%` : "—";
	const titleY = offsetY + BAR_H / 2 + TITLE_FONT_SIZE * 0.36;

	const fill =
		hasValue && fillW > 0
			? `<rect x="${PAD_X}" y="${offsetY}" width="${fillW}" height="${BAR_H}" rx="${BAR_RX}" fill="${barColor}" fill-opacity="${FILL_OPACITY}"/>`
			: "";

	// The reset countdown is intentionally not rendered — it may come back as
	// a non-text treatment; the data still flows through `countdown`.
	return `
  <rect x="${PAD_X}" y="${offsetY}" width="${BAR_W}" height="${BAR_H}" rx="${BAR_RX}" fill="${s.trackColor}" fill-opacity="${TRACK_OPACITY}"/>
  ${fill}
  ${outlinedText(PAD_X + TEXT_PAD, titleY, "start", labelColor, label, s)}
  ${outlinedText(CANVAS - PAD_X - TEXT_PAD, titleY, "end", s.percentColor, percentLabel, s)}`;
}

// Text outline via a stroked copy underneath — paint-order/filters are not
// reliably supported by the Stream Deck SVG renderer, double-drawing is.
const OUTLINE_COLOR = "#000000";
const OUTLINE_WIDTH = 4;

function outlinedText(
	x: number,
	y: number,
	anchor: "start" | "end",
	fill: string,
	content: string,
	s: ResolvedSettings,
): string {
	const common = `x="${x}" y="${y.toFixed(1)}" font-family="${s.fontFamily}" font-size="${TITLE_FONT_SIZE}" font-weight="800" text-anchor="${anchor}"`;
	const safe = escapeXml(content);
	return `<text ${common} fill="${OUTLINE_COLOR}" stroke="${OUTLINE_COLOR}" stroke-width="${OUTLINE_WIDTH}" stroke-linejoin="round">${safe}</text>
  <text ${common} fill="${fill}">${safe}</text>`;
}

function watermark(s: ResolvedSettings): string {
	return `
  <g opacity="${s.watermarkOpacity}">
    <path d="${CLAUDE_PATH}" fill="${s.watermarkColor}" transform="translate(${WM_OFFSET} ${WM_OFFSET}) scale(${WM_SCALE})"/>
  </g>`;
}

function svgInner(input: RenderInput, s: ResolvedSettings): string {
	return `
  <rect width="${CANVAS}" height="${CANVAS}" fill="${s.bgColor}"/>
  ${watermark(s)}
  ${row(SESSION_OFFSET_Y, SESSION_LABEL, input.session.percent, input.session.countdown, s.sessionColor, s.sessionLabelColor, input.isActive, s)}
  ${row(WEEKLY_OFFSET_Y, WEEKLY_LABEL, input.weekly.percent, input.weekly.countdown, s.weeklyColor, s.weeklyLabelColor, input.isActive, s)}
  ${row(FABLE_OFFSET_Y, FABLE_LABEL, input.fable.percent, input.fable.countdown, s.fableColor, s.fableLabelColor, input.isActive, s)}`;
}

// User-provided colors and font family are interpolated into SVG attribute
// values, so a stray quote or ampersand (e.g. a font named Rock & "Roll")
// would produce invalid XML and a broken key image. Escape them defensively.
function sanitizeSettings(s: ResolvedSettings): ResolvedSettings {
	return {
		...s,
		fontFamily: escapeXml(s.fontFamily),
		bgColor: escapeXml(s.bgColor),
		trackColor: escapeXml(s.trackColor),
		sessionColor: escapeXml(s.sessionColor),
		weeklyColor: escapeXml(s.weeklyColor),
		fableColor: escapeXml(s.fableColor),
		sessionLabelColor: escapeXml(s.sessionLabelColor),
		weeklyLabelColor: escapeXml(s.weeklyLabelColor),
		fableLabelColor: escapeXml(s.fableLabelColor),
		percentColor: escapeXml(s.percentColor),
		resetColor: escapeXml(s.resetColor),
		watermarkColor: escapeXml(s.watermarkColor),
	};
}

function wrap(inner: string): string {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">${inner}</svg>`;
	return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export function buildSvg(input: RenderInput): string {
	const resolved = sanitizeSettings(resolveSettings(input.settings));
	return wrap(svgInner(input, resolved));
}

const SPINNER_RADIUS = 20;
const SPINNER_CIRCUMFERENCE = 2 * Math.PI * SPINNER_RADIUS;
const SPINNER_DASH = SPINNER_CIRCUMFERENCE * 0.28;

const EMPTY_ROW: QuotaRow = { percent: null, countdown: "—" };

export function buildLoadingSvg(input: RenderInput | null, angle = 0): string {
	const resolved = sanitizeSettings(resolveSettings(input?.settings));
	const base = svgInner(
		input ?? { session: EMPTY_ROW, weekly: EMPTY_ROW, fable: EMPTY_ROW, isActive: false },
		resolved,
	);
	const dasharray = `${SPINNER_DASH.toFixed(2)} ${(SPINNER_CIRCUMFERENCE - SPINNER_DASH).toFixed(2)}`;
	const overlay = `
  <rect width="${CANVAS}" height="${CANVAS}" fill="#000000" fill-opacity="0.72"/>
  <g transform="translate(${CANVAS / 2}, ${CANVAS / 2 - 8})">
    <circle r="${SPINNER_RADIUS}" fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="3"/>
    <circle r="${SPINNER_RADIUS}" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-dasharray="${dasharray}" transform="rotate(${angle - 90})"/>
  </g>
  <text x="${CANVAS / 2}" y="${CANVAS - 14}" font-family="${resolved.fontFamily}" font-size="11" font-weight="700" fill="#ffffff" fill-opacity="0.92" text-anchor="middle" letter-spacing="2">UPDATING</text>`;
	return wrap(base + overlay);
}

export function buildErrorSvg(message: string): string {
	const safe = escapeXml(message.length > 16 ? `${message.slice(0, 14)}…` : message);
	const inner = `
  <rect width="${CANVAS}" height="${CANVAS}" fill="#3a1414"/>
  <text x="${CANVAS / 2}" y="60" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="800" fill="#ffb4b4" text-anchor="middle">ERR</text>
  <text x="${CANVAS / 2}" y="92" font-family="Helvetica, Arial, sans-serif" font-size="11" font-weight="600" fill="#ffd9d9" text-anchor="middle">${safe}</text>`;
	return wrap(inner);
}
