export class TradeQualityService {
  /**
   * Translates Layer C (Trade Quality Engine) from Python to JavaScript.
   * Scores the trade setup quality out of 100.
   */
  static computeTradeQuality(indicators, stockScore, tradeSetup, sentimentScore = 0) {
    if (!tradeSetup) return null;

    const close = indicators['close'];
    const ema20 = indicators['EMA20'];
    const ema50 = indicators['EMA50'];
    const ema200 = indicators['EMA200'];
    const adx = indicators['ADX'];
    const volume = indicators['volume'];
    const volAvg = indicators['volume.SMA20'];

    let total = 0;
    const breakdown = {};
    const notes = [];

    // 1. Structure Quality (30 pts)
    let structPts = 0;
    if (ema20 && ema50 && ema200 && close) {
      if (close > ema20 && ema20 > ema50 && ema50 > ema200) {
        structPts += 15;
        notes.push("Clean uptrend structure");
      } else if (close > ema50) {
        structPts += 8;
      }
    }
    
    if (adx && adx > 25) {
      structPts += 10;
    } else if (adx && adx > 20) {
      structPts += 5;
    }

    const resistances = tradeSetup.resistances || [];
    if (resistances.length > 0 && close) {
      const distToR1 = ((resistances[0] - close) / close) * 100;
      if (distToR1 > 3) {
        structPts += 5;
        notes.push(`Room to run (${distToR1.toFixed(1)}% to R1)`);
      } else if (distToR1 < 1) {
        notes.push(`Resistance very close (${distToR1.toFixed(1)}%)`);
      }
    }
    
    breakdown.structure_quality = Math.min(30, structPts);
    total += breakdown.structure_quality;

    // 2. Risk/Reward (30 pts)
    let rrPts = 0;
    const rr2 = tradeSetup.risk_reward?.to_target_2;
    if (rr2 !== null && rr2 !== undefined) {
      if (rr2 >= 3.0) {
        rrPts = 30;
        notes.push("Excellent Risk/Reward (>= 3:1)");
      } else if (rr2 >= 2.0) {
        rrPts = 20;
        notes.push("Good Risk/Reward (>= 2:1)");
      } else if (rr2 >= 1.5) {
        rrPts = 10;
        notes.push("Borderline Risk/Reward");
      } else {
        notes.push("Poor Risk/Reward — Skip setup");
      }
    }
    breakdown.risk_reward = rrPts;
    total += rrPts;

    // 3. News / Sentiment Alignment (10 pts)
    let sentimentPts = 0;
    if (sentimentScore > 0.2) {
      sentimentPts = 10;
      notes.push("Strongly backed by social sentiment");
    } else if (sentimentScore > 0.05) {
      sentimentPts = 5;
    } else if (sentimentScore < -0.2) {
      sentimentPts = -10;
      notes.push("WARNING: Trading against extreme negative sentiment");
    }
    breakdown.sentiment_alignment = sentimentPts;
    total += sentimentPts;

    // 4. Volume Confirmation (20 pts)
    let volPts = 0;
    if (volume && volAvg && volAvg > 0) {
      const ratio = volume / volAvg;
      if (ratio >= 1.5) {
        volPts = 20;
        notes.push(`Strong volume participation (${ratio.toFixed(1)}x)`);
      } else if (ratio >= 1.2) {
        volPts = 14;
      } else if (ratio >= 1.0) {
        volPts = 8;
      }
    }
    breakdown.volume_confirmation = volPts;
    total += volPts;

    // 5. Stop Placement (10 pts)
    let stopPts = 0;
    const stopPct = tradeSetup.stop_distance_pct;
    if (stopPct !== null && stopPct !== undefined) {
      if (stopPct >= 1.5 && stopPct <= 5.0) {
        stopPts = 10;
        notes.push(`Logical stop at ${stopPct.toFixed(1)}% below`);
      } else if (stopPct >= 0.5 && stopPct < 1.5) {
        stopPts = 5;
        notes.push("Stop might be too tight");
      } else if (stopPct > 5.0 && stopPct <= 8.0) {
        stopPts = 5;
        notes.push("Wide stop — reduce position size");
      } else {
        notes.push("Stop placement problematic");
      }
    }
    breakdown.stop_quality = stopPts;
    total += stopPts;

    // 6. Liquidity (10 pts)
    let liqPts = 0;
    if (volAvg) {
      if (volAvg >= 500000) liqPts = 10;
      else if (volAvg >= 100000) liqPts = 7;
      else if (volAvg >= 50000) liqPts = 4;
      else notes.push("Low liquidity — harder to enter/exit");
    }
    breakdown.liquidity = liqPts;
    total += liqPts;

    // Final calculations
    total = Math.max(0, Math.min(100, total));

    let quality = "Avoid Execution";
    if (total >= 80) quality = "High Quality Setup";
    else if (total >= 65) quality = "Tradable";
    else if (total >= 50) quality = "Weak Setup";

    return {
      trade_quality_score: total,
      quality: quality,
      breakdown: breakdown,
      notes: notes,
    };
  }
}
