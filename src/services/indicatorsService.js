import { IndicatorRegistry } from '../indicators/index.js';

export class IndicatorsService {
  /**
   * Translates the 100-point Stock Scoring logic from Python to JavaScript.
   * Now modularized for production-grade scale.
   */
  static computeStockScore(indicators) {
    const analysis = IndicatorRegistry.analyzeAll(indicators);

    let grade = "Avoid";
    if (analysis.finalScore >= 85) grade = "Elite";
    else if (analysis.finalScore >= 70) grade = "Strong";
    else if (analysis.finalScore >= 55) grade = "Watchlist";

    return {
      score: analysis.finalScore,
      grade,
      trend_state: analysis.trendState,
      signals: analysis.signals,
      penalties: analysis.penalties,
      breakdown: analysis.breakdown,
      markers: analysis.markers,
      gcs_stats: analysis.gcs
    };

  }
}
