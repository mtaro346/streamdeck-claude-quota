#!/usr/bin/env node
// Renders sample tiles straight from the real svg-builder so the preview
// always matches production output. Run with:
//   npm run preview
// (which adds --import ./scripts/register-ts.mjs so the svg-builder's
//  ".js" imports resolve to their ".ts" sources under type-stripping).
import { writeFileSync } from "node:fs";

import { buildLoadingSvg, buildSvg } from "../src/svg-builder.ts";

function decode(dataUri) {
	const b64 = dataUri.split(",")[1];
	return Buffer.from(b64, "base64").toString("utf8");
}

const samples = [
	["low", buildSvg({ session: { percent: 12, countdown: "4h 50m" }, weekly: { percent: 34, countdown: "5d 8h" }, fable: { percent: 13, countdown: "6d 11h" }, isActive: true })],
	["mid", buildSvg({ session: { percent: 50, countdown: "2h 30m" }, weekly: { percent: 68, countdown: "3d 2h" }, fable: { percent: 45, countdown: "3d 2h" }, isActive: true })],
	["high", buildSvg({ session: { percent: 95, countdown: "12m" }, weekly: { percent: 88, countdown: "18h 0m" }, fable: { percent: 91, countdown: "18h 0m" }, isActive: true })],
	["nofable", buildSvg({ session: { percent: 50, countdown: "2h 30m" }, weekly: { percent: 68, countdown: "3d 2h" }, fable: { percent: null, countdown: "—" }, isActive: true })],
	["idle", buildSvg({ session: { percent: 0, countdown: "—" }, weekly: { percent: 0, countdown: "—" }, fable: { percent: 0, countdown: "—" }, isActive: false })],
	["loading", buildLoadingSvg({ session: { percent: 50, countdown: "2h 30m" }, weekly: { percent: 68, countdown: "3d 2h" }, fable: { percent: 45, countdown: "3d 2h" }, isActive: true }, 120)],
];

for (const [name, uri] of samples) {
	const p = `/tmp/cq-${name}.svg`;
	writeFileSync(p, decode(uri));
	console.log(p);
}
