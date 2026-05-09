import { FibonacciIndicator } from '../indicators/fibonacci.js';

/**
 * Fibonacci Analysis Service
 * Acts as a wrapper and coordinator for Fibonacci-based technical analysis.
 * Logic is delegated to modular technical indicators for production-grade reliability.
 */
export class FibonacciService {
  /**
   * Run full Fibonacci Analysis Flow
   * Now delegated to modular technical indicators for pinpoint debugging.
   */
  static runAnalysis(indicators) {
      const analysis = FibonacciIndicator.analyze(indicators);
      if (!analysis.levels) return null;

      return {
          trend: analysis.trend,
          levels: analysis.levels,
          score: analysis.score,
          signals: analysis.signals,
          position: analysis.position,
          is_golden_zone: analysis.score >= 10
      };
  }

  // --- LEGACY / UTILITY HELPERS ---
  
  /**
   * Determine trend direction for Fibonacci drawing.
   */
  static detectTrendForFibonacci(close, swingHigh, swingLow, ema50, ema200) {
    const midpoint = (swingHigh + swingLow) / 2;
    return { 
        trend: close >= midpoint ? "uptrend" : "downtrend", 
        reason: close >= midpoint ? "Price above midpoint" : "Price below midpoint" 
    };
  }

  /**
   * Calculate Fibonacci retracement and extension levels.
   */
  static computeFibonacciLevels(swingHigh, swingLow, trend) {
    const diff = swingHigh - swingLow;
    const retracement = {};
    const ratios = [0.0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
    
    for (const ratio of ratios) {
      const price = trend === "uptrend" ? swingHigh - ratio * diff : swingLow + ratio * diff;
      retracement[ratio.toString()] = Number(price.toFixed(2));
    }
    return {
      swing_high: Number(swingHigh.toFixed(2)),
      swing_low: Number(swingLow.toFixed(2)),
      trend: trend,
      retracement_levels: retracement
    };
  }
}
