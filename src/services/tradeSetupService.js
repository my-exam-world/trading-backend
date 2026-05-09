export class TradeSetupService {
  /**
   * Translates Layer B (Trade Setup Engine) from Python to JavaScript.
   * Calculates precise Entry, Stop-Loss, and Target points.
   */
  static computeTradeSetup(indicators) {
    const close = indicators['close'];
    const atr = indicators['ATR'];
    const ema20 = indicators['EMA20'];
    const ema50 = indicators['EMA50'];
    const ema200 = indicators['EMA200'];

    if (!close || !atr || atr <= 0) {
      return null;
    }

    // Support & Resistance Levels candidates
    const supportCandidates = [];
    const resistanceCandidates = [];

    // Pivot points (Using new PIVOT. keys)
    for (let i = 1; i <= 3; i++) {
        const sVal = indicators[`PIVOT.s${i}`];
        const rVal = indicators[`PIVOT.r${i}`];
        const pp = indicators[`PIVOT.pp`];
        if (sVal && sVal < close) supportCandidates.push(sVal);
        if (rVal && rVal > close) resistanceCandidates.push(rVal);
        if (pp) {
            if (pp < close) supportCandidates.push(pp);
            else resistanceCandidates.push(pp);
        }
    }

    // EMAs as dynamic S/R (9, 20, 50, 100, 200)
    for (const p of [9, 20, 50, 100, 200]) {
      const emaVal = indicators[`EMA${p}`];
      if (emaVal) {
        if (emaVal < close) supportCandidates.push(emaVal);
        else if (emaVal > close) resistanceCandidates.push(emaVal);
      }
    }

    // BB bands & Donchian
    const bbLower = indicators['BB.lower'];
    const bbUpper = indicators['BB.upper'];
    const donUpper = indicators['DONCHIAN.upper'];
    const donLower = indicators['DONCHIAN.lower'];
    if (bbLower && bbLower < close) supportCandidates.push(bbLower);
    if (bbUpper && bbUpper > close) resistanceCandidates.push(bbUpper);
    if (donUpper && donUpper > close) resistanceCandidates.push(donUpper);
    if (donLower && donLower < close) supportCandidates.push(donLower);

    // Parabolic SAR & Supertrend
    const psar = indicators['PSAR'];
    const st = indicators['SUPERTREND'];
    if (psar && psar < close) supportCandidates.push(psar);
    if (st && st < close) supportCandidates.push(st);

    // Deduplicate and sort (descending for supports, ascending for resistances)
    const safeRound = (val) => Number(val.toFixed(2));
    
    let supports = [...new Set(supportCandidates.filter(s => s != null).map(safeRound))]
                    .sort((a, b) => b - a).slice(0, 3);
                    
    let resistances = [...new Set(resistanceCandidates.filter(r => r != null).map(safeRound))]
                      .sort((a, b) => a - b).slice(0, 3);

    // Entry points
    let breakoutEntry = donUpper ? safeRound(donUpper) : (resistances.length > 0 ? resistances[0] : null);
    let pullbackEntry = supports.length > 0 ? supports[0] : null;

    const setupTypes = [];
    if (breakoutEntry && close > indicators['EMA20']) setupTypes.push("Breakout");
    if (pullbackEntry && close < indicators['EMA20']) setupTypes.push("Pullback");

    // Stop-Loss: Tighter of (Nearest Support - 1.0 * ATR)
    let stopLoss = supports.length > 0 ? safeRound(supports[0] - 0.5 * atr) : safeRound(close - 1.5 * atr);

    // Validate Stop Loss (min 0.5% buffer)
    let stopPct = ((close - stopLoss) / close) * 100;
    if (stopPct < 0.5) {
      stopLoss = safeRound(close - 1.0 * atr);
      stopPct = ((close - stopLoss) / close) * 100;
    }

    // Targets
    const target1 = resistances.length >= 1 ? resistances[0] : safeRound(close + 1.5 * atr);
    const target2 = resistances.length >= 2 ? resistances[1] : safeRound(close + 3.0 * atr);

    // Risk Reward
    const risk = close - stopLoss;
    const rr1 = risk > 0 ? safeRound((target1 - close) / risk) : 0;
    const rr2 = risk > 0 ? safeRound((target2 - close) / risk) : 0;

    let rrQuality = "Weak";
    if (rr2 >= 2.5) rrQuality = "Elite";
    else if (rr2 >= 2.0) rrQuality = "Strong";
    else if (rr2 >= 1.5) rrQuality = "Good";

    return {
      setup_types: setupTypes,
      entry_points: { breakout_entry: breakoutEntry, pullback_entry: pullbackEntry },
      stop_loss: stopLoss,
      stop_distance_pct: safeRound(stopPct),
      targets: { target_1: target1, target_2: target2 },
      risk_reward: { to_target_1: rr1, to_target_2: rr2, quality: rrQuality },
      supports,
      resistances,
    };

  }
}
