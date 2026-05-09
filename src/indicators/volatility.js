/**
 * Volatility Analysis Module
 * Handles Bollinger Band Width (BBW) and ATR-based risk profiling.
 */

export class VolatilityIndicator {
    /**
     * Scores volatility and breakout potential.
     */
    static analyze(ind) {
        const close = ind['close'];
        const bbUpper = ind['BB.upper'];
        const bbLower = ind['BB.lower'];
        const sma20 = ind['SMA20'];
        const atr = ind['ATR'];

        let score = 0;
        const signals = [];
        const penalties = [];

        // 1. Bollinger Band Width (Squeeze Analysis)
        if (bbUpper && bbLower && sma20) {
            const bbw = (bbUpper - bbLower) / sma20;
            if (bbw < 0.05) {
                score += 10;
                signals.push("Volatility Squeeze (BBW < 0.05) - Potential Breakout");
            } else if (bbw > 0.20) {
                penalties.push("High Volatility (Overextended BBW)");
            }
        }

        // 3. Donchian Channel Breakouts
        const donchianUpper = ind['DONCHIAN.upper'];
        const donchianLower = ind['DONCHIAN.lower'];
        if (close && donchianUpper && donchianLower) {
            if (close >= donchianUpper) {
                score += 15;
                signals.push("Donchian Upper Breakout (20-period High)");
            } else if (close <= donchianLower) {
                score -= 15;
                penalties.push("Donchian Lower Breakdown (20-period Low)");
            }
        }

        return { score, signals, penalties };
    }

}
