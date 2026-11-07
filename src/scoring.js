// scoring.js — the gmgn-contract-dd rubric as typed code.
//
// Source of truth: ~/workspace/custom-skills/local-gmgn-contract-dd/SKILL.md
// Every function cites the SKILL.md step it implements. The rules encoded:
//   - rates/taxes are DECIMAL FRACTIONS; thresholds are percent -> x100
//     (rug_ratio is the one exception: already 0-1, thresholds in 0-1)
//   - an absent field is UNAVAILABLE, never zero, never a pass
//   - tiers within one field are mutually exclusive: worst matching row only
//   - caps come from Steps 2 / 3 / 5B / 7; the composite takes the LOWEST cap
//   - coverage = executed / (executed + skipped) over the fixed Step 6
//     inventory (23 checks on sol, 25 on EVM); the nine `stat` checks are
//     HELD OUT of both sides when Step 1B finds the block unpopulated
// Input shape: { info, security, kline: [...], rug: {found, rugRatio, ageHours} }
// exactly as gmgn-adapter.js returns them.

export const CHAINS = ["sol", "bsc", "base", "eth", "arbitrum", "hyperevm", "robinhood", "arc", "stable"];
const MEME_EVM = ["bsc", "base", "eth", "robinhood", "arc", "stable"]; // Step 3 LP tightening applies
const LP_SKIP = ["arbitrum", "hyperevm"];                              // Step 3 LP row skipped outright

// ---------- helpers ----------
const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const pct = (v) => { const n = num(v); return n === null || Number.isNaN(n) ? null : n * 100; }; // fraction -> percent
const clamp100 = (n) => Math.max(0, Math.min(100, n));

/** Worst-matching-row tier lookup: rows = [[threshold, deduction], ...] sorted worst-first by caller order. */
function tier(value, rows) {
  if (value === null) return null;
  for (const [cond, ded] of rows) if (cond(value)) return ded;
  return 0;
}

// ---------- Parameters: address validation (before spending a request) ----------
export function validateAddress(chain, address) {
  if (!CHAINS.includes(chain)) return { ok: false, reason: `unsupported chain "${chain}"` };
  if (chain === "sol") {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
      ? { ok: true } : { ok: false, reason: "malformed Solana address (base58, 32-44 chars)" };
  }
  return /^0x[0-9a-fA-F]{40}$/.test(address)
    ? { ok: true } : { ok: false, reason: "malformed EVM address (0x + 40 hex)" };
}

// ---------- Step 1A: is the EVM security block populated? ----------
function evmSecurityPopulated(sec) {
  const absent = (v) => v === null || v === undefined;
  const emptyNum = (v) => v === null || v === undefined || v === "" || v === "0";
  return !(absent(sec?.is_honeypot)
    && absent(sec?.is_open_source) && absent(sec?.is_blacklist) && absent(sec?.is_renounced)
    && emptyNum(sec?.top_10_holder_rate) && emptyNum(sec?.buy_tax) && emptyNum(sec?.sell_tax));
}

// ---------- Step 1B: is the `stat` block populated? (two tests, per token) ----------
const STAT_TEN = ["creator_hold_rate", "top_bundler_trader_percentage", "top70_sniper_hold_rate",
  "top_rat_trader_percentage", "top_entrapment_trader_percentage", "bot_degen_rate",
  "fresh_wallet_rate", "private_vault_hold_rate", "creator_created_count", "top_10_holder_rate"];
export function statPopulated(info) {
  const stat = info?.stat ?? {};
  const infoHolders = num(info?.holder_count) ?? 0;
  const statHolders = num(stat.holder_count);
  if ((statHolders === 0 || statHolders === null) && infoHolders > 0) return false; // test 1
  const allZero = STAT_TEN.every((k) => { const n = num(stat[k]); return n === null || n === 0; });
  return !allZero; // test 2
}

// ---------- check bookkeeping (Step 6 inventory) ----------
// check = { section, field, status: "executed"|"skipped"|"heldout", deduction, note }
function sectionResult(checks) {
  const deduction = checks.filter(c => c.status === "executed").reduce((s, c) => s + (c.deduction || 0), 0);
  const anyData = checks.some(c => c.status === "executed");
  return { score: anyData ? clamp100(100 + deduction) : null, checks };
}
const chk = (section, field, status, deduction = 0, note = "") => ({ section, field, status, deduction, note });

// ---------- Step 2 + Step 3: contract safety, from 100 ----------
function scoreContract(chain, info, security, candleCount, statOk) {
  const checks = [];
  const caps = [];
  let hardStop = false;
  let honeypotDowngraded = false;
  const isSol = chain === "sol";
  const secPop = isSol ? true : evmSecurityPopulated(security);

  if (isSol) {
    // Step 2 (sol): the two renounced_* booleans are read unconditionally once
    // Step 0 confirmed existence. is_honeypot/is_open_source are null BY DESIGN
    // on Solana = not applicable, never scored, never in the inventory.
    const rm = security?.renounced_mint, rf = security?.renounced_freeze_account;
    checks.push(rm == null ? chk("contract", "renounced_mint", "skipped", 0, "not reported")
      : chk("contract", "renounced_mint", "executed", rm === true ? 0 : -25, "mint authority not renounced — supply can be inflated"));
    checks.push(rf == null ? chk("contract", "renounced_freeze_account", "skipped", 0, "not reported")
      : chk("contract", "renounced_freeze_account", "executed", rf === true ? 0 : -20, "freeze authority not renounced — holders can be frozen and blocked from selling"));
  } else if (secPop) {
    // Step 2 (EVM): only when the security block is populated.
    const hp = security?.is_honeypot;
    if (hp === true) {
      // Step 7 exemption MUST be checked before the hard stop is final.
      if (step7Applies(info, security)) { honeypotDowngraded = true; caps.push({ cap: 59, source: "Step 7: honeypot flag contradicted by real two-sided trading — downgraded to unknown" }); }
      else hardStop = true;
      checks.push(chk("contract", "is_honeypot", "executed", 0, honeypotDowngraded ? "flagged honeypot, downgraded per Step 7" : "HONEYPOT — buyable but not sellable; hard stop"));
    } else if (hp == null) {
      caps.push({ cap: 79, source: "Step 2: is_honeypot missing on a populated security block" });
      checks.push(chk("contract", "is_honeypot", "skipped", 0, "not reported — composite capped at 79"));
    } else checks.push(chk("contract", "is_honeypot", "executed", 0, "not a honeypot"));

    const os = security?.is_open_source;
    if (os == null) { caps.push({ cap: 79, source: "Step 2: is_open_source missing on a populated security block" }); checks.push(chk("contract", "is_open_source", "skipped", 0, "not reported — composite capped at 79")); }
    else checks.push(chk("contract", "is_open_source", "executed", os === false ? -15 : 0, os === false ? "contract not open source — logic cannot be audited" : "open source"));
    const rn = security?.is_renounced;
    checks.push(rn == null ? chk("contract", "is_renounced", "skipped", 0, "not reported")
      : chk("contract", "is_renounced", "executed", rn === false ? -8 : 0, rn === false ? "ownership not renounced" : "ownership renounced"));
    const bl = security?.is_blacklist;
    checks.push(bl == null ? chk("contract", "is_blacklist", "skipped", 0, "not reported")
      : chk("contract", "is_blacklist", "executed", bl === true ? -20 : 0, bl === true ? "blacklist function present — contract can bar an address from trading" : "no blacklist"));
  } else {
    // Unpopulated EVM block: every is_* / renounced_* value is a struct default.
    for (const f of ["is_honeypot", "is_open_source", "is_renounced", "is_blacklist"])
      checks.push(chk("contract", f, "skipped", 0, "security block unpopulated (Step 1A) — struct defaults are not measurements"));
  }

  // Step 3 — tax: max(buy_tax, sell_tax). "0" is a real 0% tax; "" is unavailable.
  const bt = num(security?.buy_tax), st = num(security?.sell_tax);
  const maxTax = bt === null && st === null ? null : Math.max(bt ?? 0, st ?? 0) * 100;
  checks.push(maxTax === null ? chk("contract", "max(buy_tax, sell_tax)", "skipped", 0, "taxes not reported")
    : chk("contract", "max(buy_tax, sell_tax)", "executed",
        tier(maxTax, [[v => v > 10, -25], [v => v > 5, -10]]) ?? 0,
        `max buy/sell tax ${maxTax.toFixed(1)}%`));

  // Step 3 — LP locked-or-burned (chain-dependent, see SKILL.md field traps).
  const locked = security?.lock_summary?.is_locked;
  if (LP_SKIP.includes(chain)) {
    checks.push(chk("contract", "lock_summary.is_locked", "skipped", 0, `LP row skipped on ${chain} — unlocked DEX liquidity is the normal state of this chain's largest assets`));
  } else if (locked === null || locked === undefined) {
    checks.push(chk("contract", "lock_summary.is_locked", "skipped", 0, "lock summary not reported"));
  } else if (isSol) {
    const burn = security?.burn_status;
    if (burn === "" || burn == null) checks.push(chk("contract", "lock_summary.is_locked + burn_status", "skipped", 0, "burn_status not reported on sol — row unavailable"));
    else {
      const bad = locked === false && burn !== "burn";
      checks.push(chk("contract", "lock_summary.is_locked + burn_status", "executed", bad ? -12 : 0, bad ? "LP neither locked nor burned" : "LP locked or burned"));
    }
  } else if (MEME_EVM.includes(chain)) {
    // burn_status never arrives on EVM: decide on the lock half alone, and cap.
    if (locked === false) caps.push({ cap: 79, source: "Step 3: LP not locked on a meme-native EVM chain" });
    checks.push(chk("contract", "lock_summary.is_locked", "executed", locked === false ? -12 : 0, locked === false ? "LP not locked" : "LP locked"));
  }

  // Step 3 — liquidity: info.liquidity vs pool.liquidity, take the non-zero one.
  const liqInfo = num(info?.liquidity), liqPool = num(info?.pool?.liquidity);
  let liq = liqInfo && liqInfo !== 0 ? liqInfo : liqPool;
  if (liq === 0) { // both read 0: resolve with 24h volume before scoring
    const vol = num(info?.price?.volume_24h);
    liq = vol === 0 ? 0 : null; // 0 + 0 volume = genuine dead pool; 0 + volume = unavailable
  }
  checks.push(liq === null ? chk("contract", "liquidity", "skipped", 0, "liquidity reads 0 while 24h volume is non-zero — not a measurement")
    : chk("contract", "liquidity", "executed", tier(liq, [[v => v < 10000, -15], [v => v < 50000, -6]]) ?? 0, `liquidity $${liq.toLocaleString("en-US")}`));

  // Step 3 — pool shrink ratio. initial_liquidity 0/absent = cannot compute.
  const init = num(info?.pool?.initial_liquidity);
  const shrink = init && liq !== null ? liq / init : null;
  checks.push(shrink === null ? chk("contract", "pool.liquidity / pool.initial_liquidity", "skipped", 0, "opening depth not supplied for this pool")
    : chk("contract", "pool.liquidity / pool.initial_liquidity", "executed", shrink < 0.5 ? -10 : 0, shrink < 0.5 ? `pool shrank to ${(shrink * 100).toFixed(1)}% of its opening depth` : "pool has not shrunk below half its opening depth"));

  // Step 3 — creator_created_count (lives in `stat`; Step 1B gates it).
  const ccc = statOk ? num(info?.stat?.creator_created_count) : null;
  checks.push(!statOk ? chk("contract", "stat.creator_created_count", "heldout", 0, "stat block unpopulated — held out with the other eight stat checks")
    : ccc === null ? chk("contract", "stat.creator_created_count", "skipped", 0, "not reported")
    : chk("contract", "stat.creator_created_count", "executed",
        tier(ccc, [[v => v >= 500, -18], [v => v >= 200, -14], [v => v >= 50, -10], [v => v >= 10, -6], [v => v >= 3, -3]]) ?? 0,
        `deployer has launched ${ccc} tokens`));

  // Step 3 — shared logo. Flat -6, no top tier (copiers copy bluechips too).
  const dup = num(info?.image_dup_count);
  checks.push(dup === null ? chk("contract", "info.image_dup_count", "skipped", 0, "not reported")
    : chk("contract", "info.image_dup_count", "executed", dup > 0 ? -6 : 0, dup > 0 ? `logo shared with ${dup} other token(s)` : "logo not shared"));

  // Step 3 — candle count: a bounded deduction for unverifiability, NOT a rug claim.
  checks.push(chk("contract", "len(kline.list)", "executed",
    candleCount < 8 ? -12 : candleCount < 24 ? -6 : 0,
    `${candleCount} candles of price history`));

  const r = sectionResult(checks);
  return { ...r, caps, hardStop };
}

// ---------- Step 7: tokenized-equity honeypot false positive ----------
// Fires only on EVIDENCE: privileges must be present AND empty (null = not
// reported = gate stays shut), taxes must be present and zero.
function step7Applies(info, security) {
  const p = info?.price ?? {};
  const sells = num(p.sells_24h), sellVol = num(p.sell_volume_24h), buyVol = num(p.buy_volume_24h);
  const priv = security?.privileges;
  const privOk = Array.isArray(priv) ? priv.length === 0 : (priv && typeof priv === "object" && Object.keys(priv).length === 0);
  const bt = num(security?.buy_tax), st = num(security?.sell_tax);
  if (sells === null || sellVol === null || buyVol === null || buyVol === 0) return false;
  if (!(sells > 500 && sellVol > 100000)) return false;
  const ratio = sellVol / buyVol;
  if (ratio < 0.3 || ratio > 3.0) return false;
  if (bt === null || st === null || bt !== 0 || st !== 0) return false;
  return privOk === true;
}

// ---------- Step 4: holder structure, from 100 ----------
// (implementation: scoreHoldersWithSecurity / scoreHoldersInner below scoreToken,
//  because the top-10 rate falls back between the security and stat blocks.)

// ---------- Step 5: price action, from 100 (needs >= 8 candles) ----------
function scorePrice(info, candles) {
  const checks = [];
  if (!candles || candles.length < 8) return { score: null, checks, dropped: true }; // section dropped whole
  const W = candles.slice(-Math.min(96, candles.length)); // window defined once
  const O = W.map(c => num(c.open)), C = W.map(c => num(c.close)), H = W.map(c => num(c.high)), V = W.map(c => num(c.volume));

  const maxH = Math.max(...H.filter(v => v !== null));
  const dd = maxH > 0 && C[C.length - 1] !== null ? (1 - C[C.length - 1] / maxH) * 100 : null;
  checks.push(dd === null ? chk("price", "drawdown = 1 - C[-1]/max(H)", "skipped", 0, "window high is zero — measurement unavailable")
    : chk("price", "drawdown = 1 - C[-1]/max(H)", "executed", tier(dd, [[v => v > 70, -30], [v => v > 50, -18], [v => v > 30, -8]]) ?? 0, `price is ${dd.toFixed(1)}% below the window high`));

  let worst = null;
  for (let i = 0; i < W.length; i++) {
    if (O[i] === null || O[i] === 0 || C[i] === null) continue; // a zero-open candle never manufactures a deduction
    const r = (C[i] - O[i]) / O[i] * 100;
    if (worst === null || r < worst) worst = r;
  }
  checks.push(worst === null ? chk("price", "worst single candle (C-O)/O", "skipped", 0, "no scorable candle")
    : chk("price", "worst single candle (C-O)/O", "executed", tier(worst, [[v => v < -50, -14], [v => v < -30, -7]]) ?? 0, `worst single candle ${worst.toFixed(1)}%`));

  const pNow = num(info?.price?.price), p24 = num(info?.price?.price_24h);
  const ratio24 = pNow !== null && p24 !== null && p24 !== 0 ? pNow / p24 : null;
  checks.push(ratio24 === null ? chk("price", "info.price.price / info.price.price_24h", "skipped", 0, "24h-ago price not reported")
    : chk("price", "info.price.price / info.price.price_24h", "executed", ratio24 < 0.5 ? -10 : 0, ratio24 < 0.5 ? "price has more than halved in 24h" : "price has not halved in 24h"));

  let volRatio = null;
  if (W.length >= 40) {
    const mean = (a) => a.reduce((s, v) => s + (v ?? 0), 0) / a.length;
    const earlier = mean(V.slice(-40, -20));
    if (earlier > 0) volRatio = mean(V.slice(-20)) / earlier;
  }
  checks.push(volRatio === null ? chk("price", "vol_ratio = mean(V[-20:]) / mean(V[-40:-20])", "skipped", 0, "needs 40 candles with non-zero earlier volume")
    : chk("price", "vol_ratio = mean(V[-20:]) / mean(V[-40:-20])", "executed", volRatio < 0.20 ? -18 : 0, `recent volume is ${(volRatio * 100).toFixed(1)}% of the earlier window (only a collapse below 20% deducts)`));

  return { ...sectionResult(checks), dropped: false, windowCandles: W.length };
}

// ---------- Step 6: combine ----------
// NOTE: scoreHolders takes security as 3rd arg for the top-10 fallback; wired in scoreToken below.
export function scoreToken(chain, bundle) {
  const { info, security, kline, rug } = bundle;

  // Step 0 — existence is decided by info.symbol ONLY (security.address and
  // info.address are echoed for unknown addresses and prove nothing).
  if (!info || !info.symbol) {
    return { verdict: "no-record", chain, note: "GMGN has no record for this address (info.symbol is empty). Score nothing. If the caller's wallet probe shows activity, this is a wallet — hand off to wallet analysis." };
  }

  const statOk = statPopulated(info);
  const contract = scoreContract(chain, info, security, kline?.length ?? 0, statOk);
  const holders = scoreHoldersWithSecurity(info, security, statOk);
  const price = scorePrice(info, kline ?? []);

  // Step 2 hard stop (Step 7 already consulted inside scoreContract).
  if (contract.hardStop) {
    return { verdict: "scored", chain, symbol: info.symbol, composite: 0, band: "do not buy",
      clause: "the problem is in the contract itself", confidence: "evidence sufficient",
      sections: { contract: contract.score, holders: holders.score, price: price.score },
      caps: [{ cap: 0, source: "Step 2: is_honeypot === true (hard stop; Step 7 exemption did not apply)" }],
      contract, holders, price, statHeldOut: !statOk, rug: rug ?? null };
  }

  // Weights 0.45 / 0.35 / 0.20, renormalized over sections that returned data.
  const parts = [["contract", contract.score, 0.45], ["holders", holders.score, 0.35], ["price", price.score, 0.20]]
    .filter(([, s]) => s !== null);
  if (parts.length === 0) return { verdict: "cannot-score", chain, symbol: info.symbol, note: "No section returned any data." };
  const wSum = parts.reduce((s, [, , w]) => s + w, 0);
  let composite = parts.reduce((s, [, sc, w]) => s + sc * (w / wSum), 0);

  // Step 5B cap (rug_ratio is 0-1; NOT routed through the percent rule).
  const caps = [...contract.caps];
  if (rug && rug.rugRatio !== null && rug.rugRatio !== undefined) {
    if (rug.rugRatio >= 0.50) caps.push({ cap: 59, source: `Step 5B: GMGN rug label ${rug.rugRatio} >= 0.50` });
    else if (rug.rugRatio >= 0.30) caps.push({ cap: 79, source: `Step 5B: GMGN rug label ${rug.rugRatio} in 0.30-0.50` });
  }
  if (caps.length) composite = Math.min(composite, Math.min(...caps.map(c => c.cap)));
  composite = clamp100(Math.round(composite * 10) / 10);

  // Coverage against the fixed inventory: 23 (sol) / 25 (EVM).
  const all = [...contract.checks, ...holders.checks, ...price.checks];
  const executed = all.filter(c => c.status === "executed").length;
  const skipped = all.filter(c => c.status === "skipped").length;
  const heldOut = all.filter(c => c.status === "heldout").length;
  const inventory = chain === "sol" ? 23 : 25;
  // TODO(hackathon): when the price section is dropped (<8 candles) its 4 checks
  // are not itemized above — count them skipped here so executed+skipped+heldOut
  // reconciles to the inventory exactly, as Step 6 requires.
  const skippedAdj = skipped + (price.dropped ? 4 : 0);
  const coverage = (executed + skippedAdj) === 0 ? 0 : executed / (executed + skippedAdj);
  const confidence = coverage >= 0.80 ? "evidence sufficient" : coverage >= 0.50 ? "coverage low — score is indicative only" : "insufficient evidence — score cannot support a conclusion";

  // Grade: band word from the composite; profile clause derived from section scores.
  const band = composite >= 80 ? "buyable" : composite >= 60 ? "buyable with conditions" : composite >= 40 ? "not advised" : "do not buy";
  const under = ["contract", "holders", "price"].filter(n => ({ contract: contract.score, holders: holders.score, price: price.score })[n] !== null && ({ contract: contract.score, holders: holders.score, price: price.score })[n] < 60);
  let clause;
  if (under.length >= 2) clause = "the problem is on more than one side";
  else if (under.length === 1 && under[0] === "holders") clause = "contract is fine, the float is controlled";
  else if (under.length === 1 && under[0] === "price") clause = "contract is fine, the price structure has broken";
  else if (under.length === 1) clause = "the problem is in the contract itself";
  else if (contract.score !== null && contract.score < 80) clause = "no clear problem, but the contract side is thin";
  else clause = "nothing standing in the way on any of the three sides";

  return { verdict: "scored", chain, symbol: info.symbol, composite, band, clause, confidence,
    coverage: Math.round(coverage * 1000) / 10, inventoryCheck: { executed, skipped: skippedAdj, heldOut, total: executed + skippedAdj + heldOut, inventory },
    sections: { contract: contract.score, holders: holders.score, price: price.score },
    caps, contract, holders, price, statHeldOut: !statOk, rug: rug ?? null };
}

// scoreHolders reads top_10 from security first, then stat (Step 4 note).
function scoreHoldersWithSecurity(info, security, statOk) {
  const patched = { ...info, security_top10: undefined };
  // security.top_10_holder_rate is the primary source per the measured note in
  // Step 4 ("security ... can be 0 while stat carries the real value").
  const secT10 = pct(security?.top_10_holder_rate);
  const statT10 = pct(info?.stat?.top_10_holder_rate);
  const t10 = (secT10 && secT10 !== 0) ? secT10 : (statT10 && statT10 !== 0) ? statT10 : null;
  const r = scoreHoldersInner(patched, statOk, t10);
  return r;
}
function scoreHoldersInner(info, statOk, t10) {
  const checks = [];
  const stat = info?.stat ?? {};
  checks.push(t10 === null ? chk("holders", "top_10_holder_rate", "skipped", 0, "top-10 concentration not reported (0% concentration does not exist)")
    : chk("holders", "top_10_holder_rate", "executed", tier(t10, [[v => v > 50, -25], [v => v > 30, -14], [v => v > 20, -6]]) ?? 0, `top ten holders hold ${t10.toFixed(1)}%`));
  const hc = num(info?.holder_count);
  checks.push(hc === null || hc === 0 ? chk("holders", "info.holder_count", "skipped", 0, "holder count not reported")
    : chk("holders", "info.holder_count", "executed", tier(hc, [[v => v < 200, -12], [v => v < 500, -5]]) ?? 0, `${hc} holders`));
  const rows = [
    ["stat.creator_hold_rate", "creator_hold_rate", [[v => v > 5, -20], [v => v > 2, -10]], "of the supply is still held by the creator"],
    ["stat.top_bundler_trader_percentage", "top_bundler_trader_percentage", [[v => v > 30, -20], [v => v > 15, -10], [v => v > 5, -4]], "of the analysed traders are bundlers"],
    ["stat.top70_sniper_hold_rate", "top70_sniper_hold_rate", [[v => v > 15, -15], [v => v > 5, -6]], "of the supply sits in top-70 sniper wallets"],
    ["stat.top_rat_trader_percentage", "top_rat_trader_percentage", [[v => v > 5, -12], [v => v > 1, -5]], "of the analysed traders are tagged rat (insider) traders"],
    ["stat.top_entrapment_trader_percentage", "top_entrapment_trader_percentage", [[v => v > 50, -22], [v => v > 20, -16], [v => v > 5, -10]], "of the analysed traders are tagged as entrapment"],
    ["stat.bot_degen_rate", "bot_degen_rate", [[v => v > 70, -12], [v => v > 50, -6]], "of the analysed traders are bot degens"],
    ["stat.fresh_wallet_rate", "fresh_wallet_rate", [[v => v > 50, -8]], "of holders are fresh wallets"],
    ["stat.private_vault_hold_rate", "private_vault_hold_rate", [[v => v > 5, -8]], "of the supply sits in private vaults"],
  ];
  for (const [field, key, tiers, label] of rows) {
    if (!statOk) { checks.push(chk("holders", field, "heldout", 0, "stat block unpopulated — held out of coverage entirely")); continue; }
    const v = pct(stat[key]);
    checks.push(v === null ? chk("holders", field, "skipped", 0, "not reported")
      : chk("holders", field, "executed", tier(v, tiers) ?? 0, `${v.toFixed(1)}% ${label}`));
  }
  return sectionResult(checks);
}
