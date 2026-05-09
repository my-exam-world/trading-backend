/**
 * Fibonacci Analysis Module
 * Handles Retracement levels, extension zones, and golden pocket detection.
 */

export class FibonacciIndicator {
    static FIB_RETRACEMENT_RATIOS = [0.0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];

    /**
     * Conducts a full Fibonacci analysis pass.
     */
    static analyze(ind) {
        const close = ind['close'];
        const high = ind['high'];
        const low = ind['low'];

        if (!close || !high || !low) return { score: 0, signals: [], levels: null, position: null };

        // 1. Determine Bias
        const midpoint = (high + low) / 2;
        const trend = close >= midpoint ? "uptrend" : "downtrend";

        // 2. Calculate Levels
        const diff = high - low;
        const levels = {};
        for (const ratio of this.FIB_RETRACEMENT_RATIOS) {
            const price = trend === "uptrend" ? high - ratio * diff : low + ratio * diff;
            levels[ratio.toString()] = Number(price.toFixed(2));
        }

        // 3. Analyze Position
        const sortedLevels = Object.entries(levels)
            .map(([ratio, price]) => ({ ratio, price }))
            .sort((a, b) => a.price - b.price);

        let currentZone = "Neutral Zone";
        
        if (close > sortedLevels[sortedLevels.length - 1].price) {
            currentZone = "Bullish Breakout (Above 0% Fib)";
        } else if (close < sortedLevels[0].price) {
            currentZone = "Extreme Oversold (Below 100% Fib)";
        } else {
            for (let i = 0; i < sortedLevels.length - 1; i++) {
                const lo = sortedLevels[i];
                const hi = sortedLevels[i + 1];
                if (close >= lo.price && close <= hi.price) {
                    currentZone = `Consolidating between ${lo.ratio} and ${hi.ratio}`;
                    break;
                }
            }
        }

        // 4. Key Zones (Golden Pocket)
        let keyZone = null;
        const f618 = levels["0.618"];
        const f786 = levels["0.786"];
        if (f618 && f786) {
           const goldenLo = Math.min(f618, f786);
           const goldenHi = Math.max(f618, f786);
           if (close >= goldenLo && close <= goldenHi) keyZone = "Golden Pocket Detected (0.618-0.786)";
        }

        let score = keyZone ? 20 : 0;
        const signals = keyZone ? ["Golden Pocket Test (Institutional Interest)"] : [];

        return { 
            score, 
            signals, 
            trend,
            levels,
            position: {
                current_zone: currentZone,
                key_zone: keyZone
            }
        };
    }
}
