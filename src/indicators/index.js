import { TrendIndicator } from './trend.js';
import { OscillatorIndicator } from './oscillators.js';
import { VolatilityIndicator } from './volatility.js';
import { VolumeIndicator } from './volume.js';
import { FibonacciIndicator } from './fibonacci.js';
import * as MathUtils from '../utils/indicatorMath.js';
import { calculateBasuri } from '../utils/basuriCore.js';

export const IndicatorRegistry = {
    calculateFromHistory: (history, sentimentScore = 0) => {
        if (!history || history.length < 200) return {};
        
        const last = history[history.length - 1];
        const close = parseFloat(last.close);
        const high = parseFloat(last.high);
        const low = parseFloat(last.low);
        const volume = parseFloat(last.volume || 0);

        // -- CALCULATIONS --
        const ema9 = MathUtils.calculateEMA(history, 9).pop()?.value;
        const ema20 = MathUtils.calculateEMA(history, 20).pop()?.value;
        const ema50 = MathUtils.calculateEMA(history, 50).pop()?.value;
        const ema100 = MathUtils.calculateEMA(history, 100).pop()?.value;
        const ema200 = MathUtils.calculateEMA(history, 200).pop()?.value;

        const sma9 = MathUtils.calculateSMA(history, 9).pop()?.value;
        const sma20 = MathUtils.calculateSMA(history, 20).pop()?.value;
        const sma50 = MathUtils.calculateSMA(history, 50).pop()?.value;
        const sma100 = MathUtils.calculateSMA(history, 100).pop()?.value;
        const sma200 = MathUtils.calculateSMA(history, 200).pop()?.value;

        const rsi = MathUtils.calculateRSI(history, 14).pop()?.value;
        const macd = MathUtils.calculateMACD(history);
        const adxData = MathUtils.calculateADX(history, 14).pop();
        const stoch = MathUtils.calculateStochastic(history);
        const atr = MathUtils.calculateATR(history, 14).pop()?.value;
        
        const bb = MathUtils.calculateBollingerBands(history, 20, 2).pop();
        const donchian = MathUtils.calculateDonchianChannels(history, 20).pop();
        const supertrend = MathUtils.calculateSupertrend(history).pop();
        const psar = MathUtils.calculatePSAR(history).pop()?.value;
        
        const williamsR = MathUtils.calculateWilliamsR(history, 14).pop()?.value;
        
        const pivotsClassic = MathUtils.calculatePivotClassic(history);
        const pivotsFib = MathUtils.calculatePivotFib(history);
        
        const obv = MathUtils.calculateOBV(history).pop()?.value;
        const volSma = MathUtils.calculateVolumeSMA(history, 20).pop()?.value;
        
        const gcs = MathUtils.calculateGCS(history);
        const emaCrosses = MathUtils.calculateEMACrosses(history);
        const utBot = MathUtils.calculateUTBot(history, 2, 1);
        const chand = MathUtils.calculateChandelierExit(history, 22, 3);
        const basuri = calculateBasuri(history, sentimentScore);

        const indicators = {
            close, high, low, volume,
            EMA9: ema9, EMA20: ema20, EMA50: ema50, EMA100: ema100, EMA200: ema200,
            SMA9: sma9, SMA20: sma20, SMA50: sma50, SMA100: sma100, SMA200: sma200,
            RSI: rsi,
            'MACD.macd': macd.macdLine.pop()?.value,
            'MACD.signal': macd.signalLine.pop()?.value,
            'MACD.hist': macd.histogram.pop()?.value,
            ADX: adxData?.adx || 0, 'ADX.diP': adxData?.diP || 0, 'ADX.diN': adxData?.diN || 0,
            STOCH_K: stoch.k.pop()?.value, STOCH_D: stoch.d.pop()?.value,
            WILLIAMS_R: williamsR,
            ATR: atr,
            'BB.upper': bb?.upper, 'BB.lower': bb?.lower, 'BB.basis': bb?.basis,
            'DONCHIAN.upper': donchian?.upper, 'DONCHIAN.lower': donchian?.lower, 'DONCHIAN.middle': donchian?.middle,
            SUPERTREND: supertrend?.value, 'SUPERTREND.trend': supertrend?.trend,
            PSAR: psar,
            'PIVOT.pp': pivotsClassic?.pp, 
            'PIVOT.r1': pivotsClassic?.r1, 'PIVOT.r2': pivotsClassic?.r2, 'PIVOT.r3': pivotsClassic?.r3,
            'PIVOT.s1': pivotsClassic?.s1, 'PIVOT.s2': pivotsClassic?.s2, 'PIVOT.s3': pivotsClassic?.s3,
            OBV: obv,
            'volume.SMA20': volSma,

            
            markers: [...emaCrosses, ...gcs.markers, ...utBot.markers, ...chand.markers, ...basuri.markers],
            gcs_stats: gcs.lastStats,
            basuri_stats: basuri.lastStats
        };

        return indicators;
    },

    analyzeAll: (ind) => {
        const trend = TrendIndicator.analyze(ind);
        const osc = OscillatorIndicator.analyze(ind);
        const vol = VolatilityIndicator.analyze(ind);
        const vlm = VolumeIndicator.analyze(ind);
        const fib = FibonacciIndicator.analyze(ind);

        const breakdown = { trend_score: trend.score, momentum_score: osc.score, volatility_score: vol.score, volume_score: vlm.score, fibonacci_score: fib.score };
        const allSignals = [...trend.signals, ...osc.signals, ...vol.signals, ...vlm.signals, ...fib.signals];
        const allPenalties = [...trend.penalties, ...osc.penalties, ...vol.penalties, ...vlm.penalties];

        if (ind.markers && ind.markers.length > 0) {
            const last = ind.markers[ind.markers.length - 1];
            if (last.type.includes('BULLISH') || last.type.includes('BUY')) {
                trend.score += 15; allSignals.push(`HIGH PROXIMITY SIGNAL: ${last.text}`);
            } else {
                trend.score -= 15; allPenalties.push(`HIGH PROXIMITY WARNING: ${last.text}`);
            }
        }

        let totalBonus = trend.score + osc.score + vol.score + vlm.score + fib.score;
        const finalScore = Math.max(0, Math.min(100, 50 + totalBonus));

        return { finalScore, breakdown, signals: allSignals, penalties: allPenalties, trendState: TrendIndicator.getTrendState(ind), markers: ind.markers, gcs: ind.gcs_stats };
    }
};

export { TrendIndicator, OscillatorIndicator, VolatilityIndicator, VolumeIndicator, FibonacciIndicator };


