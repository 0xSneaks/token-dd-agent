// server.js — zero-dependency HTTP server (node:http only).
// Routes:
//   GET /                              landing page (public/index.html)
//   GET /examples                      worked-examples gallery (public/examples.html)
//   GET /report?address=<mint>&chain=sol
//        - demo=1 (or the sample address) -> SAMPLE bundle, watermarked
//        - live=1 -> gmgn-adapter live calls (wired; CLI failures surface as
//          "cannot score", never as invented data)
//        - otherwise -> explains the live opt-in and links the sample
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateAddress, scoreToken } from "./scoring.js";
import { renderReport, renderNoRecord } from "./render.js";
import { SAMPLE_BUNDLE, SAMPLE_ADDRESS } from "./sample-data.js";
import { fetchTokenBundle, fetchRugLabel, probeWallet } from "./gmgn-adapter.js";

const here = dirname(fileURLToPath(import.meta.url));
const landing = readFileSync(join(here, "..", "public", "index.html"), "utf8");
const examples = readFileSync(join(here, "..", "public", "examples.html"), "utf8");
const PORT = Number(process.env.PORT || 8734);

const send = (res, code, body) => { res.writeHead(code, { "content-type": "text/html; charset=utf-8" }); res.end(body); };
const page = (title, inner) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body>${inner}</body></html>`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/") return send(res, 200, landing);
  if (url.pathname === "/examples") return send(res, 200, examples);
  if (url.pathname !== "/report") return send(res, 404, page("404", "<h1>Not found</h1>"));

  const chain = (url.searchParams.get("chain") || "sol").toLowerCase();
  const demo = url.searchParams.get("demo") === "1";
  const live = url.searchParams.get("live") === "1";
  const address = demo ? SAMPLE_ADDRESS : (url.searchParams.get("address") || "").trim();

  const v = validateAddress(chain, address);
  if (!v.ok) return send(res, 400, page("Bad address", `<h1>That address is malformed</h1><p>${v.reason}. Nothing was queried.</p>`));

  if (demo || address === SAMPLE_ADDRESS) {
    const bundle = { ...SAMPLE_BUNDLE, address: SAMPLE_ADDRESS, chain };
    const r = scoreToken(chain, bundle);
    return send(res, 200, renderReport(r, bundle, { sample: true }));
  }

  if (!live) {
    return send(res, 200, page("Live scoring is opt-in",
      `<h1>Live scoring is wired — it's opt-in per request</h1>
       <p>The live GMGN adapter is connected. Append <code>&amp;live=1</code> to this URL to score this address from live chain data.</p>
       <p>Or first: <a href="/examples">the worked-examples gallery</a> (two real reports captured 2026-10-30, plus the fictional sample), or <a href="/report?demo=1">the SAMPLE report</a> on fictional data.</p>`));
  }

  // Live path (read-only). Any failure -> cannot score, never fake data.
  const bundle = await fetchTokenBundle(chain, address);
  if (!bundle.ok) return send(res, 502, page("Data source unavailable", `<h1>Cannot score right now</h1><p>The GMGN data source did not answer (${bundle.error}). No score was emitted.</p>`));
  if (!bundle.info?.symbol) {
    const probe = await probeWallet(chain, address);
    if (probe.ok && probe.isWallet) return send(res, 200, page("That's a wallet", `<h1>That's a wallet, not a token contract</h1><p><code>${address}</code> has trading activity but no token record — contract DD does not score wallets.</p>`));
    return send(res, 200, renderNoRecord(chain, address));
  }
  const rug = await fetchRugLabel(chain, address);
  const full = { ...bundle, rug, address, chain };
  const r = scoreToken(chain, full);
  return send(res, 200, renderReport(r, full, { sample: false }));
});

// Local run: `node src/server.js` listens as before. On Vercel the server is
// exported as the function handler instead (api/index.js).
if (!process.env.VERCEL) {
  server.listen(PORT, () => console.log(`mlh-dd-agent listening on http://localhost:${PORT}`));
}
export default server;
