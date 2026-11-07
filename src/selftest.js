// selftest.js — scores the fictional SAMPLE bundle and asserts the rubric
// behaves as designed. Run: npm run selftest
import { scoreToken, validateAddress } from "./scoring.js";
import { SAMPLE_BUNDLE, SAMPLE_ADDRESS } from "./sample-data.js";

const bundle = { ...SAMPLE_BUNDLE, address: SAMPLE_ADDRESS, chain: "sol" };
const r = scoreToken("sol", bundle);
console.log(JSON.stringify({
  composite: r.composite, band: r.band, clause: r.clause, confidence: r.confidence,
  sections: r.sections, caps: r.caps, inventoryCheck: r.inventoryCheck,
}, null, 2));

const fails = [];
if (validateAddress("sol", SAMPLE_ADDRESS).ok !== true) fails.push("sample address should validate");
if (validateAddress("sol", "not-an-address").ok !== false) fails.push("garbage address should not validate");
if (!(r.composite >= 60 && r.composite < 80)) fails.push(`expected composite in the 60s, got ${r.composite}`);
if (r.band !== "buyable with conditions") fails.push(`expected band "buyable with conditions", got "${r.band}"`);
if (r.clause !== "contract is fine, the float is controlled") fails.push(`expected holders clause, got "${r.clause}"`);
if (r.inventoryCheck.total !== r.inventoryCheck.inventory) fails.push(`inventory mismatch: ${JSON.stringify(r.inventoryCheck)}`);
const norecord = scoreToken("sol", { info: { symbol: "" }, security: {}, kline: [], rug: null });
if (norecord.verdict !== "no-record") fails.push("empty info.symbol must yield no-record");

if (fails.length) { console.error("SELFTEST FAIL:\n- " + fails.join("\n- ")); process.exit(1); }
console.log("SELFTEST PASS");
