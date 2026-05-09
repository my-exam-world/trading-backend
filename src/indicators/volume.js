/**
 * Volume Analysis Module
 * Handles Relative Volume (RVOL) and Volume SMA crossovers.
 */

export class VolumeIndicator {
    /**
     * Scores volume participation strength.
     */
    static analyze(ind) {
        const volume = ind['volume'];
        const volumeAvg = ind['volume.SMA20'];

        let score = 0;
        const signals = [];
        const penalties = [];

        // 1. Relative Volume (Standard RVOL calculation)
        if (volume && volumeAvg && volumeAvg > 0) {
            const ratio = volume / volumeAvg;
            if (ratio >= 2.0) {
                score += 15;
                signals.push(`Extreme Volume Spike (${ratio.toFixed(1)}x vs Avg)`);
            } else if (ratio >= 1.5) {
                score += 10;
                signals.push(`High Relative Volume (${ratio.toFixed(1)}x)`);
            } else if (ratio >= 1.1) {
                score += 5;
                signals.push("Modest Volume Confirmation");
            } else if (ratio < 0.7) {
                score -= 5;
                penalties.push("Low Relative Volume (Anemic Participation)");
            }
        }

        return { score, signals, penalties };
    }
}
