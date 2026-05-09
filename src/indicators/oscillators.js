/**
 * Oscillator Analysis Module
 * Handles RSI Zones, MACD Crossovers, and ADX Trend Strength.
 */

export class OscillatorIndicator {
    /**
     * Scores the oscillators for bullish/bearish momentum.
     */
    static analyze(ind) {
        const rsi = ind['RSI'];
        const macdLine = ind['MACD.macd'];
        const macdSignal = ind['MACD.signal'];
        const adx = ind['ADX'];
        const diP = ind['ADX.diP'];
        const diN = ind['ADX.diN'];
        const stochK = ind['STOCH_K'];
        const stochD = ind['STOCH_D'];
        const williamsR = ind['WILLIAMS_R'];

        let score = 0;
        const signals = [];
        const penalties = [];

        // 1. RSI Zone Logic
        if (rsi) {
            if (rsi >= 55 && rsi <= 70) { score += 10; signals.push(`Bullish RSI Momentum (${rsi.toFixed(1)})`); }
            else if (rsi > 70 && rsi < 78) { score += 5; signals.push("RSI Extended Bullish"); }
            else if (rsi > 78) { score -= 5; penalties.push("RSI Overbought (>78) - Caution"); }
            else if (rsi < 45) { score -= 5; penalties.push("RSI Weakness (<45)"); }
        }

        // 2. MACD Crossover Analysis
        if (macdLine !== undefined && macdSignal !== undefined) {
            if (macdLine > macdSignal) { score += 10; signals.push("MACD Bullish Crossover"); }
            else { score -= 5; penalties.push("MACD Bearish Crossover"); }
        }

        // 3. ADX & DMI Confirmation
        if (adx) {
            if (adx >= 25) {
                if (diP > diN) { score += 10; signals.push(`Strong Bullish Trend (ADX: ${adx.toFixed(1)}, DI+ > DI-)`); }
                else { score -= 10; penalties.push(`Strong Bearish Trend (ADX: ${adx.toFixed(1)}, DI- > DI+)`); }
            } else if (adx >= 20) {
                score += 5; signals.push("Moderate Trend Strength");
            }
        }

        // 4. Stochastic & Williams %R (Momentum Extremes)
        if (stochK !== undefined && stochD !== undefined) {
            if (stochK > stochD && stochK < 20) { score += 10; signals.push("Stochastic Bullish Hook in Oversold Zone"); }
            else if (stochK < stochD && stochK > 80) { score -= 10; penalties.push("Stochastic Bearish Crossover in Overbought Zone"); }
        }
        
        if (williamsR !== undefined) {
            if (williamsR < -80) { signals.push("Williams %R Oversold"); }
            else if (williamsR > -20) { penalties.push("Williams %R Overbought"); }
        }

        return { score, signals, penalties };
    }

}
