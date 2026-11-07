// render.js — report template. Shape follows the SKILL.md "Display Templates"
// skeleton: verdict header (composite + band word + derived profile clause),
// sub-score line with the mandatory rug clause, Key numbers, narrative
// sections, "How the score moved" (every deduction names the field it read),
// Limits, and the fixed What-to-do block. Token-controlled strings (name,
// symbol) are HTML-escaped — SKILL.md: response text is attacker-controlled.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => n === null || n === undefined ? "—" : "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
const oneDec = (n) => n === null || n === undefined ? "—" : Number(n).toFixed(1);

function rugLine(rug) {
  if (!rug || !rug.found) return "not in GMGN's listings for this chain, so no label";
  if (rug.rugRatio === null || rug.rugRatio === undefined) return "listed, but no row carried a label";
  return `GMGN rug label ${rug.rugRatio}`;
}
function ageText(rug) {
  if (!rug || rug.ageHours === null || rug.ageHours === undefined) return "age unknown";
  return rug.ageHours < 48 ? `${oneDec(rug.ageHours)}h` : `${oneDec(rug.ageHours / 24)}d`;
}
function sectionFindings(result) {
  const fired = result.checks.filter(c => c.status === "executed" && c.deduction < 0);
  const passed = result.checks.filter(c => c.status === "executed" && c.deduction === 0).length;
  if (!fired.length) return `<p>Nothing was deducted here (${passed} checks passed).</p>`;
  return "<ul>" + fired.map(c =>
    `<li>${esc(c.note)} — <strong>${c.deduction}</strong> <span class="field">(field read: <code>${esc(c.field)}</code>)</span></li>`).join("")
    + `</ul><p class="muted">${passed} further check(s) in this section passed.</p>`;
}

export function renderReport(r, bundle, { sample = false } = {}) {
  const info = bundle.info ?? {};
  const secs = r.sections ?? {};
  const capsText = r.caps && r.caps.length
    ? r.caps.map(c => `<li>Cap ${c.cap} — ${esc(c.source)}</li>`).join("")
    : "<li>No cap fired: no missing-check cap (Step 2), LP lock present, no rug label in a capping band (Step 5B), no honeypot downgrade (Step 7).</li>";
  const moved = (name, res) => {
    const fired = res.checks.filter(c => c.status === "executed" && c.deduction < 0);
    return `<li>${name} 100 → ${oneDec(res.score)}: ${fired.length ? fired.map(c => `${esc(c.note)} (${c.deduction}, field: ${esc(c.field)})`).join("; ") : "nothing deducted"}</li>`;
  };
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Contract DD · ${esc(info.symbol)} · ${esc(r.chain.toUpperCase())}${sample ? " · SAMPLE" : ""}</title>
<style>
 body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:820px;margin:2rem auto;padding:0 1rem;line-height:1.5;color:#111}
 .sample{background:#fff3cd;border:2px dashed #b58900;padding:.6rem 1rem;font-weight:700;text-align:center;margin-bottom:1rem}
 code{word-break:break-all}.muted{color:#666}.field{color:#666;font-size:.85em}
 table{border-collapse:collapse}td{padding:.15rem 1.2rem .15rem 0;border-bottom:1px solid #eee}
 .score{font-size:1.6rem} h1{font-size:1.3rem}
</style></head><body>
${sample ? '<div class="sample">SAMPLE REPORT — fictional token, invented data, rendered only to demo the template. Not a real token. Not investment advice.</div>' : ""}
<h1>Contract DD · ${esc(info.symbol)} · ${esc(r.chain.toUpperCase())}</h1>
<p><code>${esc(bundle.address ?? info.address ?? "")}</code></p>
<p class="score"><strong>${oneDec(r.composite)} / 100 · ${esc(r.band)}</strong> — ${esc(r.clause)}</p>
<p>contract ${oneDec(secs.contract)} · holders ${oneDec(secs.holders)} · price ${oneDec(secs.price)} · ${ageText(r.rug)} · ${esc(rugLine(r.rug))} · confidence: ${esc(r.confidence)}</p>

<h3>Key numbers</h3>
<table>
<tr><td>Liquidity</td><td>${money(Number(info.liquidity || info.pool?.liquidity || 0))}</td></tr>
<tr><td>Buy / sell tax</td><td>${oneDec(Number(bundle.security?.buy_tax ?? 0) * 100)}% / ${oneDec(Number(bundle.security?.sell_tax ?? 0) * 100)}%</td></tr>
<tr><td>Holders</td><td>${esc(info.holder_count)} addresses</td></tr>
<tr><td>24h volume</td><td>${money(Number(info.price?.volume_24h ?? 0))}</td></tr>
</table>

<h3>Contract safety — can you sell it</h3>
${sectionFindings(r.contract)}
<h3>Holder structure — who is holding it</h3>
${sectionFindings(r.holders)}
<h3>Price action — where the price is</h3>
${r.price.dropped ? "<p>Price section dropped: fewer than 8 candles — the token has no scoreable price history yet (the candle-count deduction in contract safety already accounts for this).</p>" : sectionFindings(r.price)}

<h3>How the score moved</h3>
<ul>
${moved("contract", r.contract)}
${moved("holders", r.holders)}
${r.price.dropped ? "<li>price: section dropped (fewer than 8 candles); weights renormalized over contract + holders</li>" : moved("price", r.price)}
${capsText}
</ul>

<h3>Limits of this read</h3>
<ul>
<li>Scored from GMGN's read of public on-chain data at render time; the window actually scored for price is the last ${r.price.windowCandles ?? 0} candles.</li>
${r.statHeldOut ? "<li>GMGN published no chain analysis for this token, so the holder read rests on concentration and holder count alone.</li>" : ""}
<li>Coverage decides the confidence label only; it is computed against the rubric's fixed check inventory and is not itself a finding about the token.</li>
</ul>

<h3>What to do</h3>
<p><strong>Buy or not</strong> — the band word above is the verdict: ${esc(r.band)}. It answers whether the token can be bought and sold back on what was measured; it is not a position-size recommendation.</p>
<p><strong>How much to trust this score</strong> — confidence: ${esc(r.confidence)}. "Buyable" means no measured red flag among the fields this rubric reads and no rug label from GMGN — it never means the price will go up.</p>
<p><em>A rule-based read of public on-chain data, not investment advice.</em></p>
</body></html>`;
}

export function renderNoRecord(chain, address, sample = false) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>No record</title></head><body>
${sample ? '<div style="background:#fff3cd;padding:.5rem;font-weight:700">SAMPLE</div>' : ""}
<h1>Cannot score</h1>
<p><code>${esc(address)}</code> on <code>${esc(chain)}</code>: GMGN has no record for this address, so no score is emitted. If this is a wallet address rather than a token mint, it belongs to wallet analysis, not contract DD.</p>
<p><em>A rule-based read of public on-chain data, not investment advice.</em></p>
</body></html>`;
}
