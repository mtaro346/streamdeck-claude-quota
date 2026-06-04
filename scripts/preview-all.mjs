#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const png = readFileSync(path.join(ROOT, "com.asuka.claude-quota.sdPlugin/imgs/claude.png")).toString("base64");

const CANVAS = 144;
const ICON_SIZE = 84;
const ICON_X = (CANVAS - ICON_SIZE) / 2;
const ICON_Y = (CANVAS - ICON_SIZE) / 2;
const MEDALLION_R = 50;
const COLOR_BG = "#0d0d0d";
const COLOR_BAR = "#d97757";
const COLOR_MED = "#0d0d0d";
const COLOR_RING = "#ffffff";

const DEFS = `<defs>
  <filter id="textShadow" x="-30%" y="-30%" width="160%" height="160%">
    <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#000000" flood-opacity="0.95"/>
  </filter>
</defs>`;

function inner(percent, countdown, isActive) {
  const clamped = Math.max(0, Math.min(100, percent));
  const fillH = Math.round((CANVAS * clamped) / 100);
  const fillY = CANVAS - fillH;
  const label = `${Math.round(clamped)}%`;
  const cd = isActive ? countdown : "idle";
  return `
  <rect width="${CANVAS}" height="${CANVAS}" fill="${COLOR_BG}"/>
  <rect x="0" y="${fillY}" width="${CANVAS}" height="${fillH}" fill="${COLOR_BAR}"/>
  <circle cx="72" cy="72" r="${MEDALLION_R}" fill="${COLOR_MED}" fill-opacity="0.92" stroke="${COLOR_RING}" stroke-opacity="0.18" stroke-width="1"/>
  <image href="data:image/png;base64,${png}" x="${ICON_X}" y="${ICON_Y}" width="${ICON_SIZE}" height="${ICON_SIZE}"/>
  <text x="72" y="32" font-family="Helvetica, Arial, sans-serif" font-size="28" font-weight="800" fill="#ffffff" text-anchor="middle" filter="url(#textShadow)">${label}</text>
  <text x="72" y="132" font-family="Helvetica, Arial, sans-serif" font-size="14" font-weight="700" fill="#ffffff" text-anchor="middle" filter="url(#textShadow)">${cd}</text>`;
}

function loadingOverlay() {
  return `
  <rect width="${CANVAS}" height="${CANVAS}" fill="#000000" fill-opacity="0.7"/>
  <g transform="translate(72, 72)">
    <circle r="22" fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="3"/>
    <circle r="22" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-dasharray="35 200" transform="rotate(-90)"/>
  </g>
  <text x="72" y="${CANVAS - 18}" font-family="Helvetica, Arial, sans-serif" font-size="11" font-weight="700" fill="#ffffff" fill-opacity="0.92" text-anchor="middle" letter-spacing="2">UPDATING</text>`;
}

function build(percent, countdown, opts = {}) {
  const body = inner(percent, countdown, true) + (opts.loading ? loadingOverlay() : "");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">${DEFS}${body}</svg>`;
}

const samples = [
  ["10", build(10, "4h 50m")],
  ["50", build(50, "2h 30m")],
  ["95", build(95, "12m")],
  ["50-loading", build(50, "2h 30m", { loading: true })],
];

for (const [name, svg] of samples) {
  writeFileSync(`/tmp/preview-${name}.svg`, svg);
  console.log(`/tmp/preview-${name}.svg`);
}
