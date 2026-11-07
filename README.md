# Token DD Agent

Paste a Solana contract address, get a scored **0–100 due-diligence report** —
contract safety, holder structure, price action. Every deduction names the
on-chain field it was read from; the composite is capped by GMGN's own rug
label. Read-only: no wallet, no trading, no custody.

Built for the **MLH Solana Hackathon, Nov 6–8, 2026** (track: Agentic Payments
& AI). The scoring rubric is not invented here — it is the production
`gmgn-contract-dd` rubric (composite score, tiered deductions, caps, coverage
inventory, confidence labels) encoded as typed code in `src/scoring.js`, with
each function citing the SKILL.md step it implements.

## Status: SCAFFOLD (Oct 30–Nov 2 weekend)

Done now:
- Full rubric in code: Steps 0–8 — existence check (`info.symbol` only),
  block-population tests (1A/1B/1C), chain-mode contract rules, tiered
  deductions (worst-row-per-field), holder structure, price action over the
  defined candle window, rug-label caps, weighted composite (0.45/0.35/0.20,
  renormalized), coverage → confidence, verdict bands + derived profile clause.
- Landing page + `/report` route + report template mirroring the skill's
  display skeleton (verdict header, sub-scores with the mandatory rug clause,
  Key numbers, per-section findings, "How the score moved", Limits, What to do).
- One demo report from **clearly fictional SAMPLE data** (`demo-report.html`,
  watermarked) so the template can be eyeballed end-to-end.
- Worked-examples gallery (`/examples`, `public/examples.html`): the two real
  2026-10-30 live reports — FLUKE 79.0 (capped, rug label 0.338) and $OV 59.0
  (capped, rug label 0.94) — with their top findings, next to the fictional
  SAMPLE, each labeled for what it is.
- Demo script (`DEMO-SCRIPT.md`): a 90-second cut — hook, paste-a-CA flow,
  score anatomy, the cap story on both worked examples, close. (The brief
  allows ≤ 2 min; the script is written to 90 s.)
- `src/gmgn-adapter.js`: the only file that talks to GMGN. **Live wiring
  DONE 2026-10-30**: command lines and response shapes verified field by
  field against live reads; `gmgn-cli config --check` gate runs before
  scoring; the three scoring calls run sequentially with 429 backoff (the
  account plan rate-limits parallel bursts — measured); every rubric field
  GMGN does not return is named in `bundle.missingFields` (absent = the
  check is skipped, never a pass). Live mode stays opt-in via `?live=1`;
  SAMPLE remains the offline default. Verified end-to-end 2026-10-30:
  FLUKE → 79.0 (Step 5B cap, rug label 0.338), $OV → 59.0 (rug label 0.94).

Not done (the hackathon build):
- Optional: live mode as the default `/report` flow, per-address caching,
  and the shell-filtered Step 5B listing scan (in-process scan is fine for
  a demo; production must filter in the shell — the trenches payload is
  ~740 KB).
- The price section's 4 checks are counted as skipped when the section is
  dropped (< 8 candles) rather than itemized — flagged TODO in scoring.js.
- Recording the demo video (script is written — `DEMO-SCRIPT.md`) and
  deploying; both happen at the event (deploy is gated on Sneaks).

## Run it locally

```sh
cd ~/workspace/mlh-dd-agent
npm start            # http://localhost:8734  (PORT env overrides)
npm run selftest     # scores the SAMPLE bundle, asserts band/clause/inventory
npm run demo         # regenerates demo-report.html
```

- Landing: `GET /`
- Worked-examples gallery: `GET /examples`
- Sample report: `GET /report?demo=1`
- Report (live attempt): `GET /report?address=<mint>&chain=sol&live=1`
  — without `live=1`, the route explains the wiring state and links the sample.

## Nov 6–8 build checklist

1. **Live GMGN wiring** — ✅ DONE 2026-10-30 (adapter live behind `?live=1`,
   `config --check` gate in, sequential paced calls + 429 backoff,
   missing-field inventory; end-to-end verified on FLUKE and $OV).
   Remaining polish, optional: flip `/report` default to live, shell-filtered
   trenches/trending scan for `rug_ratio` + token age, 60s per-address cache.
2. **Gallery** — ✅ DONE 2026-10-30: pre-rendered worked examples at
   `/examples` from the real 2026-10-30 reads (FLUKE 79.0 capped /
   $OV 59.0 rug-labelled, top findings + cap arithmetic, capture date on
   each card), plus the fictional SAMPLE card, clearly labeled.
3. **Demo** — script ✅ DONE 2026-10-30 (`DEMO-SCRIPT.md`, 90-second cut):
   paste CA → score lands → expand one deduction → "here is the field it
   came from" → the cap story → close. Recording still to do at the event
   (≤ 2 min limit).
4. **Deploy** — pick host at the event (any Node host; zero deps keeps this
   trivial). No secrets in the repo: the GMGN API key stays in `gmgn-cli`
   config on the host, never in code or env files committed here.
5. **Devpost** — track: Agentic Payments & AI; fields to prepare: project name,
   one-line pitch, how it works (rubric provenance + caps story), what was
   built during the event vs reused (the rubric pre-exists — say so honestly),
   demo video link, repo link. **Fields drafted 2026-10-30 in
   `DEVPOST-DRAFT.md`** (copy-paste ready; links/team fill at submission).
   Submission itself NOT done — gated on Sneaks. Initial submission Sun
   Nov 8, 10:00 AM ET; final 11:45 AM ET.

## Honesty notes

- The scaffold never presents sample data as real: the demo bundle is
  fictional, its address is invented, and every page rendered from it is
  watermarked SAMPLE.
- "Buyable" in this rubric means *nothing measured stops you buying and
  selling back* — it is a transactability/rug-exposure read, never a price
  forecast. Every report carries the not-investment-advice line.
