#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ccusage = path.join(ROOT, "node_modules", ".bin", "ccusage");
const out = execFileSync(ccusage, ["blocks", "--active", "--json", "--token-limit", "max", "--offline"]).toString();
const data = JSON.parse(out);
const block = data.blocks?.[0];

if (!block?.isActive) {
	console.error("No active block");
	process.exit(1);
}

const percent = block.tokenLimitStatus?.percentUsed ?? 0;
const resetMs = new Date(block.endTime).getTime() - Date.now();
const minutes = Math.max(0, Math.round(resetMs / 60000));
const h = Math.floor(minutes / 60);
const m = minutes % 60;
const countdown = h > 0 ? `${h}h ${m}m` : `${m}m`;

const CANVAS = 144;
const fillH = Math.round((CANVAS * Math.max(0, Math.min(100, percent))) / 100);
const fillY = CANVAS - fillH;

const png = readFileSync(path.join(ROOT, "com.asuka.claude-quota.sdPlugin/imgs/claude.png")).toString("base64");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
  <defs>
    <filter id="iconShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="0" stdDeviation="2.5" flood-color="#000000" flood-opacity="0.85"/>
    </filter>
    <filter id="textShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#000000" flood-opacity="0.98"/>
    </filter>
  </defs>
  <rect width="${CANVAS}" height="${CANVAS}" fill="#0d0d0d"/>
  <rect x="0" y="${fillY}" width="${CANVAS}" height="${fillH}" fill="#d97757"/>
  <image href="data:image/png;base64,${png}" x="27" y="27" width="90" height="90" filter="url(#iconShadow)" opacity="0.95"/>
  <text x="72" y="34" font-family="Helvetica, Arial, sans-serif" font-size="30" font-weight="800" fill="#ffffff" text-anchor="middle" filter="url(#textShadow)">${Math.round(percent)}%</text>
  <text x="72" y="132" font-family="Helvetica, Arial, sans-serif" font-size="15" font-weight="700" fill="#ffffff" text-anchor="middle" filter="url(#textShadow)">${countdown}</text>
</svg>`;

writeFileSync("/tmp/claude-quota-preview.svg", svg);
console.log(`percent=${percent.toFixed(2)}% countdown=${countdown}`);
console.log("/tmp/claude-quota-preview.svg");
