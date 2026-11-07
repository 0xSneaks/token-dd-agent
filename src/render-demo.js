// render-demo.js — renders demo-report.html from the SAMPLE bundle.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scoreToken } from "./scoring.js";
import { renderReport } from "./render.js";
import { SAMPLE_BUNDLE, SAMPLE_ADDRESS } from "./sample-data.js";

const bundle = { ...SAMPLE_BUNDLE, address: SAMPLE_ADDRESS, chain: "sol" };
const r = scoreToken("sol", bundle);
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "demo-report.html");
writeFileSync(out, renderReport(r, bundle, { sample: true }));
console.log(`wrote ${out} — composite ${r.composite}, band "${r.band}"`);
