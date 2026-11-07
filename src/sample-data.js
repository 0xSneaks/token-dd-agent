// sample-data.js — CLEARLY FICTIONAL sample token, used ONLY to eyeball the
// report template end-to-end. This is NOT real chain data, NOT a real token,
// and the address is invented. Every rendered page built from this data is
// watermarked SAMPLE. The values were chosen to exercise real rubric rows:
// freeze authority not renounced (-20), thin liquidity (-6), a mid-size
// creator history (-6), shared logo (-6), holder concentration (-6),
// creator still holding (-10), bundlers (-10), entrapment traders (-16),
// a -38% drawdown (-8). Expected composite ~64.9 -> "buyable with conditions".

// Fictional base58 address (validates under the sol regex; resolves to nothing).
export const SAMPLE_ADDRESS = "DDagentSAMPLE11111111111111111111111111111";

// Deterministic candle series: 100 x 15m candles, a run-up then a slide so the
// last close sits ~38% under the window high. All values are strings, exactly
// as gmgn-cli returns them (SKILL.md Step 5: every kline field is a string).
function buildCandles() {
  const list = [];
  let price = 0.00010;
  const t0 = 1793000000000;
  for (let i = 0; i < 100; i++) {
    const drift = i < 55 ? 1.012 : 0.9885;                    // rise, then bleed
    const wobble = 1 + Math.sin(i * 1.7) * 0.004;
    const open = price;
    const close = price * drift * wobble;
    const high = Math.max(open, close) * 1.004;
    const low = Math.min(open, close) * 0.996;
    const volume = i < 60 ? 9000 - i * 60 : 5400 - (i - 60) * 40; // fading, not collapsed
    list.push({ time: t0 + i * 900000, open: String(open), close: String(close), high: String(high), low: String(low), volume: String(Math.max(volume, 800)) });
    price = close;
  }
  return list;
}

const candles = buildCandles();
const lastClose = Number(candles[candles.length - 1].close);

export const SAMPLE_BUNDLE = {
  info: {
    address: SAMPLE_ADDRESS,
    symbol: "SAMPLEPUP",
    name: "SamplePup (FICTIONAL — demo data only)",
    holder_count: 342,
    liquidity: "18420",
    image_dup_count: 1,
    price: {
      price: String(lastClose),
      price_24h: String(lastClose / 2),       // ratio 2.0 — halving row does not fire
      volume_24h: "96140", buy_volume_24h: "51200", sell_volume_24h: "44940",
      buys_24h: 812, sells_24h: 655,
    },
    pool: { liquidity: "18420", initial_liquidity: "0", exchange: "sample-amm" },
    stat: {
      holder_count: 342,
      top_10_holder_rate: "0.284",
      creator_hold_rate: "0.031",
      top_bundler_trader_percentage: "0.187",
      top70_sniper_hold_rate: "0.042",
      top_rat_trader_percentage: "0.008",
      top_entrapment_trader_percentage: "0.23",
      bot_degen_rate: "0.44",
      fresh_wallet_rate: "0.31",
      private_vault_hold_rate: "0.01",
      creator_created_count: 47,
    },
    dev: { creator_address: "SampleDeployer1111111111111111111111111111", twitter_name_change_history: [], twitter_del_post_token_count: 0 },
  },
  security: {
    address: SAMPLE_ADDRESS,
    renounced_mint: true,
    renounced_freeze_account: false,           // -> Step 2 (sol): -20
    buy_tax: "0", sell_tax: "0",
    burn_status: "burn",
    lock_summary: { is_locked: true },
    top_10_holder_rate: "0.284",
  },
  kline: candles,
  rug: { found: false, rugRatio: null, ageHours: null, source: null }, // "not in GMGN's listings"
};
