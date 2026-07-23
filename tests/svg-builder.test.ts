import { test } from "node:test";
import assert from "node:assert/strict";

import { buildSvg } from "../src/svg-builder.ts";

function decode(dataUri: string): string {
	return Buffer.from(dataUri.split(",")[1], "base64").toString("utf8");
}

const FULL_INPUT = {
	session: { percent: 50, countdown: "2h 30m" },
	weekly: { percent: 68, countdown: "3d 2h" },
	fable: { percent: 13, countdown: "6d 11h" },
	isActive: true,
};

test("buildSvg renders 5H, 7D and F rows with percents and countdowns", () => {
	// Act
	const svg = decode(buildSvg(FULL_INPUT));

	// Assert: label and percent render as separate positioned text elements.
	assert.ok(svg.includes(">5H</text>"));
	assert.ok(svg.includes(">7D</text>"));
	assert.ok(svg.includes(">F</text>"));
	assert.match(svg, />50%</);
	assert.match(svg, />68%</);
	assert.match(svg, />13%</);
	// The reset countdown is intentionally hidden in this design.
	assert.doesNotMatch(svg, /2h 30m/);
});

test("buildSvg paints the Claude watermark faintly behind the bars", () => {
	// Act
	const svg = decode(buildSvg(FULL_INPUT));

	// Assert: the brand path is present, wrapped in a low default opacity group,
	// and the bars are translucent so it ghosts through them.
	assert.match(svg, /M4\.709 15\.955/);
	assert.match(svg, /opacity="0\.15"/);
	assert.match(svg, /fill-opacity="0\.5"/);
	// It must sit before the first row text so bars/text draw on top of it.
	assert.ok(svg.indexOf("M4.709 15.955") < svg.indexOf(">5H</text>"));
});

test("buildSvg hides the F fill bar when no scoped limit exists", () => {
	// Arrange: no fable data (non-Max plan or API fallback to TUI probe).
	const svg = decode(
		buildSvg({
			...FULL_INPUT,
			fable: { percent: null, countdown: "—" },
		}),
	);

	// Assert: row renders as em dash and draws no fill bar.
	assert.match(svg, />—</);
	// bg + 3 tracks + session fill + weekly fill = 6 rects (no fable fill)
	assert.equal((svg.match(/<rect/g) || []).length, 6);
});

test("buildSvg shows weekly as em dash when only session is available", () => {
	// Arrange: session fetched, weekly window missing (null) — must not read as 0%.
	const svg = decode(
		buildSvg({
			session: { percent: 40, countdown: "3h 0m" },
			weekly: { percent: null, countdown: "—" },
			fable: { percent: null, countdown: "—" },
			isActive: true,
		}),
	);

	// Assert
	assert.match(svg, />40%</); // session rendered
	assert.match(svg, />—</); // weekly rendered as em dash, not a fill bar
	assert.doesNotMatch(svg, />0%</); // never a fake zero
	// weekly/fable fill bars must NOT be drawn: bg + 3 tracks + session fill = 5 rects
	assert.equal((svg.match(/<rect/g) || []).length, 5);
});

test("buildSvg shows em dash for percent when inactive", () => {
	// Act
	const svg = decode(
		buildSvg({
			session: { percent: 0, countdown: "—" },
			weekly: { percent: 0, countdown: "—" },
			fable: { percent: 0, countdown: "—" },
			isActive: false,
		}),
	);

	// Assert (check text nodes, not attribute values like width="160%")
	assert.match(svg, />—</);
	assert.doesNotMatch(svg, />\d+%</);
});

test("buildSvg clamps percent between 0 and 100", () => {
	// Act
	const svg = decode(
		buildSvg({
			session: { percent: 150, countdown: "0m" },
			weekly: { percent: -10, countdown: "—" },
			fable: { percent: 13, countdown: "6d 11h" },
			isActive: true,
		}),
	);

	// Assert
	assert.match(svg, />100%</);
	assert.match(svg, />0%</);
});

test("buildSvg escapes user settings so quotes and ampersands cannot break the SVG", () => {
	// Arrange: a font name and color with XML-hostile characters (PI free text).
	const svg = decode(
		buildSvg({
			...FULL_INPUT,
			settings: { fontFamily: 'Rock & "Roll"' },
		}),
	);

	// Assert: escaped, and the raw attribute-breaking form is absent.
	assert.match(svg, /Rock &amp; &quot;Roll&quot;/);
	assert.doesNotMatch(svg, /Rock & "Roll"/);
});
