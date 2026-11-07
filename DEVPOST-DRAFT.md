# Devpost submission — DRAFT (do not submit from this file)

Prepared 2026-10-30 for the **MLH Solana Hackathon, Nov 6–8, 2026**.
Submission deadlines (from the README): **initial Sun Nov 8, 10:00 AM ET ·
final Sun Nov 8, 11:45 AM ET.**
Fields below are copy-paste ready except the ones marked **[FILL AT SUBMISSION]**.
Every claim in the drafted text is true of the repo as of 2026-10-30 — if the
build changes during the event, update the draft before pasting.

---

## Project name

```
Token DD Agent
```

## Tagline (short description shown under the name)

```
Paste a Solana contract address, get a 0–100 due-diligence score — every deduction names the on-chain field behind it, and GMGN's rug label caps the result.
```

## Track

```
Agentic Payments & AI
```

## Description

```markdown
## Inspiration

Thousands of new Solana tokens launch every day, and the standard
due-diligence process is reading a chart and trusting a vibe. Agents that
trade or pay autonomously need something better than a vibe: a fixed,
auditable check that runs *before* money moves, and that can show exactly
why it reached its verdict. Token DD Agent is that check.

## What it does

Paste a Solana contract address and the agent returns a scored 0–100
due-diligence report in three sections:

- **Contract safety** — can you sell it back? Mint/freeze authority,
  honeypot flags, LP lock, taxes.
- **Holder structure** — who holds it: top-10 concentration, bundlers,
  snipers, entrapment-tagged traders, whether the creator still holds.
- **Price action** — where the price sits in its own candle history:
  drawdown from the window high, worst single candle, volume shape.

Two rules keep the score honest. Every deduction names the exact on-chain
field it was read from — no unexplained penalties. And the composite is
**capped by GMGN's own rug label**: a label of 0.30–0.50 caps the score at
79; 0.50 or higher caps it at 59, regardless of how clean the sections look.

Worked examples, scored live through the app on 2026-10-30:

- **FLUKE** — sections 88 / 78 / 63, but rug label 0.338 → **79.0,
  "buyable with conditions."**
- **$OV** — sections 70 / 68 / 56 (≈66.5 weighted), but rug label 0.94 →
  **59.0, "not advised."** The cap, not the average, is the verdict.

The agent is read-only: no wallet, no keys, no trading, no custody. Fields
GMGN doesn't return are reported as missing and the check is skipped —
never silently passed. If the address is a wallet rather than a token
contract, the agent says so instead of scoring it.

## How we built it

A zero-dependency Node.js app (`node:http` only — no framework, no build
step). `src/scoring.js` encodes the rubric as typed code: existence and
block-population tests, tiered deductions (worst row per field), the
0.45 / 0.35 / 0.20 weighted composite, the rug-label caps, a fixed 23-check
coverage inventory that drives the confidence label, verdict bands, and a
derived profile clause. `src/gmgn-adapter.js` is the only file that talks
to GMGN (via `gmgn-cli`); it gates on `gmgn-cli config --check`, paces its
calls sequentially with rate-limit backoff, and builds the missing-field
inventory for every report. Reports render server-side from one template;
token-controlled strings (names, symbols) are HTML-escaped because they
are attacker-controlled.

## Challenges we ran into

- **Rate limits:** GMGN's plan rate-limits parallel bursts (HTTP 429).
  The adapter's first design fired its calls in parallel and tripped the
  limiter; the shipped design runs them sequentially with backoff that
  honors the API's own reset time.
- **A score is only as honest as its gaps.** When GMGN doesn't publish a
  field, the tempting move is to treat it as a pass. The rubric instead
  skips the check, says so, and lowers the coverage/confidence — and
  missing key security fields cap the composite outright.
- **The rug label lives in a different shape of data.** It has no
  per-address lookup — it only appears on listing rows — so the adapter
  scans the listings for the token's row, and "listed with no label" is
  kept distinct from "not listed."

## Accomplishments that we're proud of

- End-to-end live scoring verified before the event: two real tokens
  scored through the real server, with the caps firing exactly as the
  rubric specifies (79.0 and 59.0 above).
- The report a judge sees is fully reproducible: same rubric, same
  fields, same caps, on every token — and the worked-examples gallery
  keeps the 2026-10-30 snapshots next to a clearly-labeled fictional
  SAMPLE so the template can be reviewed offline.

## What we learned

A single number is only useful if it can defend itself. The features
that made this score trustworthy weren't more data — they were the caps,
the field citations, and the missing-field inventory: the parts that say
"here is what we could not check."

## What's next for Token DD Agent

- Flip live mode to the default report flow and add a short per-address
  cache.
- Shell-filtered listing scan for the rug label (the in-process scan is
  fine for a demo; the trenches payload is ~740 KB).
- Itemize the price section's checks when the section is dropped for
  too few candles (currently counted as skipped — a flagged TODO in
  `src/scoring.js`).
- Expose the scorer as a callable endpoint other agents can hit as a
  pre-trade gate before executing a payment or swap.

## Built during the event vs. pre-existing — stated honestly

The **scoring rubric pre-exists**: it is the author's production
`gmgn-contract-dd` due-diligence rubric, in use before this hackathon,
encoded here as code. Built for this event: the web app (landing,
report renderer, worked-examples gallery), the live GMGN adapter wiring
(gated, paced, missing-field inventory), and the demo. Live end-to-end
verification on real tokens was completed on 2026-10-30.
```

## Built with

```
Node.js (zero-dependency, node:http) · JavaScript (ES modules) · GMGN API via gmgn-cli · Solana
```

## Try it out — links

- Live demo: **[FILL AT SUBMISSION — the deployed URL; deploy is gated on Sneaks]**
- Code repository: **[FILL AT SUBMISSION — no public repo exists yet as of 2026-10-30]**
- Demo video: **[FILL AT SUBMISSION — after recording DEMO-SCRIPT.md, ≤ 2 min]**
- Worked examples (ships with the app): `/examples` on the deployed host —
  FLUKE 79.0 and $OV 59.0 as captured 2026-10-30, plus the fictional SAMPLE.

## Team

**[FILL AT SUBMISSION — list exactly who Devpost should credit.]**
(Draft prepared for Sneaks / Halfmoon Studio; no team members are named
anywhere in the repo, so none are claimed here.)

## Thumbnail / gallery assets available in the repo

- `public/index.html` — landing page (screenshot for the gallery).
- `public/examples.html` — worked-examples gallery page.
- `demo-report.html` — the watermarked SAMPLE report, safe to show anywhere.

## Submission-day checklist (Nov 8)

- [ ] Deploy the app (README checklist item 4) and put the URL above.
- [ ] Record the demo from `DEMO-SCRIPT.md`; upload; put the link above.
- [ ] Re-check every number in the description against a fresh live run —
  if a score changed, update the draft, don't paste stale figures.
- [ ] Initial submission by **10:00 AM ET**; final by **11:45 AM ET**.
