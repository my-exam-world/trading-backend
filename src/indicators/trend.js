/**
 * Trend Analysis Indicator Module
 * Focused on EMA Alignment, Long-term structure, and PSAR.
 */

export class TrendIndicator {
    /**
     * Scores the trend strength based on EMA stack and price position.
     * @param {Object} ind - Indicators map from scanner
     */
    static analyze(ind) {
        const close = ind['close'];
        const ema9 = ind['EMA9'];
        const ema20 = ind['EMA20'];
        const ema50 = ind['EMA50'];
        const ema100 = ind['EMA100'];
        const ema200 = ind['EMA200'];
        const psar = ind['PSAR'];
        const supertrendDir = ind['SUPERTREND.trend'];

        let score = 0;
        const signals = [];
        const penalties = [];

        // 1. EMA Stack Analysis (Standard Trend Hierarchy)
        if (close && ema9 && ema20 && ema50 && ema100 && ema200) {
            if (close > ema9 && ema9 > ema20 && ema20 > ema50 && ema50 > ema100 && ema100 > ema200) {
                score += 20;
                signals.push("Full Bullish EMA Stack (9 > 20 > 50 > 100 > 200)");
            } else if (close > ema50 && ema50 > ema200) {
                score += 10;
                signals.push("Mid-term Bullish Trend");
            }
        }

        // 2. Multi-Period Bias
        if (close && ema200) {
            if (close < ema200) {
                score -= 10;
                penalties.push("Price below EMA200 (Long-term Bearish Bias)");
            }
        }

        // 3. Parabolic SAR Confirmation
        if (psar && close) {
            if (close > psar) {
                score += 5;
                signals.push("PSAR confirmation: Bullish");
            } else {
                score -= 5;
                penalties.push("PSAR Bearish");
            }
        }

        // 4. Supertrend Confirmation
        if (supertrendDir !== undefined) {
            if (supertrendDir === 1) {
                score += 10;
                signals.push("Supertrend Bullish");
            } else {
                score -= 10;
                penalties.push("Supertrend Bearish");
            }
        }

        return { score, signals, penalties };
    }



    /**
     * Determines the current trend state name.
     */
    static getTrendState(ind) {
        const { close, EMA9, EMA20, EMA50, EMA100, EMA200 } = ind;
        if (!close || !EMA200) return "Unknown";

        if (close > EMA9 && EMA9 > EMA20 && EMA20 > EMA50 && EMA50 > EMA100 && EMA100 > EMA200) return "Strong Uptrend";
        if (close > EMA200) return "Uptrend";
        if (close < EMA9 && EMA9 < EMA20 && EMA20 < EMA50 && EMA50 < EMA100 && EMA100 < EMA200) return "Strong Downtrend";
        return "Weak/Transitioning";
    }

}
