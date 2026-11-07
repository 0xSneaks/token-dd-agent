// gmgn-adapter.js — the ONLY file that talks to GMGN.
//
// LIVE since 2026-10-30. Every function shells out to `gmgn-cli` exactly as
// the gmgn-contract-dd skill prescribes (SKILL.md "Sub-commands"): three
// read-only calls, plus the Step 5B listing scan for GMGN's own rug label,
// plus Step 0's conditional wallet probe. No private key is ever involved;
// all commands are on the CLI's API-key-only auth path. swap / order /
// cooking commands are NEVER called from here.
//
// Environment (measured on this VM, 2026-10-30):
// - The CLI resolves via GMGN_CLI, else ~/.npm-global/bin/gmgn-cli.
// - GMGN_API_KEY comes from the process env when set; otherwise it is read
//   (never printed, never logged) from the env file at GMGN_ENV_FILE, default
//   ~/workspace/muse-maestro/.env — the same file the working gmgn-cli setup
//   on this VM uses. Only the one key line is parsed out of that file.
// - Egress on this VM goes through a TLS-intercepting proxy: the child
//   process inherits https_proxy + NODE_EXTRA_CA_CERTS from our own env.
//   Without them the CLI fails with raw SSL errors, so they are passed
//   through untouched.
//
// Rate limit (measured 2026-10-30): the account plan 429s on parallel
// bursts — three simultaneous calls tripped RATE_LIMIT_EXCEEDED twice.
// So the scoring calls run SEQUENTIALLY with ~1.2s spacing, and a 429 is
// retried after the reset window the API itself reports (~31s), at most
// twice per call. A call that still fails surfaces as { ok:false } and the
// report flow says "cannot score" — it never invents data.
//
// Field mapping: the CLI's --raw response shapes were verified field by
// field against scoring.js's expectations (info.stat.*, info.price.*,
// info.pool.*, security.renounced_*, security.lock_summary.is_locked,
// kline.list[] of string OHLCV) on live FLUKE / $OV reads, 2026-10-30.
// The objects pass through UNCHANGED. What this file adds on top is an
// explicit missing-field inventory (bundle.missingFields): every field the
// rubric reads that GMGN did not return is named. Absent fields are never
// defaulted — scoring.js already treats them as skipped/unavailable; the
// inventory exists so the report (and a human) can see exactly what is
// UNVERIFIED instead of guessing.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const run = promisify(execFile);

const CLI = process.env.GMGN_CLI
  || (existsSync(join(homedir(), ".npm-global/bin/gmgn-cli"))
    ? join(homedir(), ".npm-global/bin/gmgn-cli")
    : "gmgn-cli");

const ENV_FILE = process.env.GMGN_ENV_FILE || join(homedir(), "workspace/muse-maestro/.env");

/** Child env: our env + GMGN_API_KEY (from env, else parsed from ENV_FILE). */
function childEnv() {
  const env = { ...process.env };
  if (!env.GMGN_API_KEY) {
    try {
      const text = readFileSync(ENV_FILE, "utf8");
      const m = text.match(/^GMGN_API_KEY=(.+)$/m);
      if (m) env.GMGN_API_KEY = m[1].trim().replace(/^["']|["']$/g, "");
    } catch { /* no env file: the CLI's own config may still carry a key */ }
  }
  return env;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class RateLimited extends Error {
  constructor(retryAfterSec) { super("GMGN rate limit (HTTP 429)"); this.retryAfterSec = retryAfterSec; }
}

/** One raw CLI call. Throws RateLimited on 429, Error otherwise. */
async function gmgnOnce(args) {
  try {
    const { stdout } = await run(CLI, args, {
      env: childEnv(), timeout: 60_000, maxBuffer: 32 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  } catch (err) {
    const msg = String(err.stderr || err.message || err);
    if (msg.includes("429") || msg.includes("RATE_LIMIT")) {
      const m = msg.match(/~(\d+)s remaining/);
      throw new RateLimited(m ? Number(m[1]) : 35);
    }
    throw new Error(msg.split("\n").filter(Boolean).slice(0, 2).join(" ") || "gmgn-cli failed");
  }
}

/** CLI call with 429 backoff: wait out the reported reset, retry twice. */
async function gmgn(args) {
  for (let attempt = 0; ; attempt++) {
    try { return await gmgnOnce(args); }
    catch (err) {
      if (err instanceof RateLimited && attempt < 2) {
        await sleep(Math.min(err.retryAfterSec + 3, 100) * 1000);
        continue;
      }
      throw err;
    }
  }
}

/** Skill preamble: `gmgn-cli config --check` must exit 0 before scoring. */
let configOk = null;
export async function checkConfig() {
  if (configOk !== null) return configOk;
  try {
    await run(CLI, ["config", "--check"], { env: childEnv(), timeout: 30_000 });
    configOk = true;
  } catch { configOk = false; }
  return configOk;
}

// ---------- missing-field inventory ----------
// Every field scoring.js reads, checked against the live bundle. A field is
// "missing" when it is absent, null, or "" — the rubric then marks that
// check skipped; it is NEVER read as zero or as a pass.
const absent = (v) => v === null || v === undefined || v === "";
function inventory(chain, info, security, candles) {
  const missing = [];
  const need = (obj, path, label) => {
    const v = path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
    if (absent(v)) missing.push(label);
  };
  for (const f of ["symbol", "holder_count", "liquidity", "image_dup_count"]) need(info, f, `info.${f}`);
  for (const f of ["price", "price_24h", "volume_24h", "buy_volume_24h", "sell_volume_24h", "buys_24h", "sells_24h"])
    need(info?.price, f, `info.price.${f}`);
  for (const f of ["liquidity", "initial_liquidity"]) need(info?.pool, f, `info.pool.${f}`);
  need(info?.stat, "holder_count", "info.stat.holder_count");
  for (const f of ["creator_hold_rate", "top_bundler_trader_percentage", "top70_sniper_hold_rate",
    "top_rat_trader_percentage", "top_entrapment_trader_percentage", "bot_degen_rate",
    "fresh_wallet_rate", "private_vault_hold_rate", "creator_created_count", "top_10_holder_rate"])
    need(info?.stat, f, `info.stat.${f}`);
  if (chain === "sol") {
    for (const f of ["renounced_mint", "renounced_freeze_account", "buy_tax", "sell_tax", "burn_status", "top_10_holder_rate"])
      need(security, f, `security.${f}`);
    need(security?.lock_summary, "is_locked", "security.lock_summary.is_locked");
  } else {
    for (const f of ["is_honeypot", "is_open_source", "is_blacklist", "is_renounced", "buy_tax", "sell_tax", "top_10_holder_rate"])
      need(security, f, `security.${f}`);
    need(security?.lock_summary, "is_locked", "security.lock_summary.is_locked");
  }
  if (!candles || candles.length === 0) missing.push("kline.list (0 candles — price section unavailable)");
  else if (candles.length < 8) missing.push(`kline.list (only ${candles.length} candles — price section dropped)`);
  return missing;
}

/** Step 0-5 inputs: the three scoring calls, sequential + paced (see header). */
export async function fetchTokenBundle(chain, address) {
  if (!(await checkConfig())) {
    return { ok: false, error: "gmgn-cli config --check failed — no usable GMGN API key configured" };
  }
  try {
    const info = await gmgn(["token", "info", "--chain", chain, "--address", address, "--raw"]);
    await sleep(1200);
    const security = await gmgn(["token", "security", "--chain", chain, "--address", address, "--raw"]);
    await sleep(1200);
    const kline = await gmgn(["market", "kline", "--chain", chain, "--address", address, "--resolution", "15m", "--raw"]);
    const candles = kline?.list ?? [];
    return { ok: true, info, security, kline: candles, missingFields: inventory(chain, info, security, candles) };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

/** Step 0 conditional probe — only when info.symbol is empty. Never feeds a threshold. */
export async function probeWallet(chain, address) {
  try {
    const stats = await gmgn(["portfolio", "stats", "--chain", chain, "--wallet", address, "--period", "30d", "--raw"]);
    const isWallet = (Number(stats?.buy) || 0) + (Number(stats?.sell) || 0) > 0
      || Number(stats?.pnl_stat?.token_num) > 0;
    return { ok: true, isWallet };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

/**
 * Step 5B — rug_ratio has NO address lookup; it only exists on listing rows.
 * The scan below reads the parsed payloads in-process (payloads measured
 * ~740 KB; maxBuffer above is sized for them). A matched row WITHOUT the
 * rug_ratio key is NOT a zero — keep scanning. When no row carries the
 * label, rugRatio stays null and the composite simply takes no 5B cap;
 * "not listed / not labelled" is reported as-is, never as a pass.
 * Returns { found, rugRatio|null, ageHours|null, source }.
 */
export async function fetchRugLabel(chain, address) {
  const a = address.toLowerCase();
  try {
    const trenches = await gmgn(["market", "trenches", "--chain", chain, "--raw"]);
    let ageHours = null;
    for (const bucket of ["completed", "near_completion", "new_creation"]) {
      for (const r of trenches?.[bucket] ?? []) {
        if (String(r.address).toLowerCase() === a) {
          if (ageHours === null && r.created_timestamp) {
            ageHours = (Date.now() / 1000 - Number(r.created_timestamp)) / 3600;
          }
          if (r.rug_ratio != null) return { found: true, rugRatio: Number(r.rug_ratio), ageHours, source: `trenches/${bucket}` };
        }
      }
    }
    await sleep(1200);
    const trending = await gmgn(["market", "trending", "--chain", chain, "--interval", "24h", "--limit", "100", "--raw"]);
    for (const r of trending?.data?.rank ?? []) {
      if (String(r.address).toLowerCase() === a) {
        if (ageHours === null && r.open_timestamp) {
          ageHours = (Date.now() / 1000 - Number(r.open_timestamp)) / 3600;
        }
        if (r.rug_ratio != null) return { found: true, rugRatio: Number(r.rug_ratio), ageHours, source: "trending" };
        return { found: true, rugRatio: null, ageHours, source: "trending" }; // listed, no label
      }
    }
    return { found: ageHours !== null, rugRatio: null, ageHours, source: null };
  } catch (err) {
    return { found: false, rugRatio: null, ageHours: null, source: null, error: String(err.message || err) };
  }
}
