import {
  calculateEMA, calculateRSI, calculateMACD, calculateStochastic,
  calculateCCI, calculateMFI, calculateBollingerBands, calculateATR,
  calculateADX, calculateOBV, calculateCMF, calculateVWAP,
  calculateVolumeSMA, calculatePivotClassic, calculateFibLevelsForPrice,
  calculateSupertrend, calculateHMA
} from './indicatorMath.js'; // Adjust path for backend

export const BASURI_WEIGHTS = {
  EMA14: 3, EMA26: 6, EMA200: 12,
  RSI: 10,
  MACD_LINE: 9, MACD_SIGNAL: 4, MACD_HIST: 7,
  STOCH_K: 4, STOCH_D: 2,
  CCI: 6,
  MFI: 5,
  BB_UPPER: 4, BB_MIDDLE: 4, BB_LOWER: 4,
  ATR: 3,
  ADX: 8,
  OBV: 7,
  CMF: 6,
  VOL_SPIKE: 5,
  PIVOT_P: 5, PIVOT_R1: 3, PIVOT_S1: 3,
  FIB_0618: 8,
  VWAP: 10,
  FEAR_GREED: 10,
  SUPERTREND: 15,
  HMA: 8
};

export const TOTAL_BASURI_WEIGHT = Object.values(BASURI_WEIGHTS).reduce((a, b) => a + b, 0);

/**
 * Basuri Neural 31 Supreme Core Engine
 * Optimized for Parity between Chart and Bot.
 */
export function calculateBasuri(d, sentimentScore = 0, lastOnly = false) {
  if (d.length < 200) return { markers: [], lastStats: null };

  const weights = BASURI_WEIGHTS;
  const totalWeight = TOTAL_BASURI_WEIGHT;

  // --- PRE-CALCULATE ALL INDICATORS ---
  const e14Map = new Map(calculateEMA(d, 14).map(x => [x.time, x.value]));
  const e26Map = new Map(calculateEMA(d, 26).map(x => [x.time, x.value]));
  const e200Map = new Map(calculateEMA(d, 200).map(x => [x.time, x.value]));
  const rMap = new Map(calculateRSI(d, 14).map(x => [x.time, x.value]));
  const macd = calculateMACD(d);
  const mlMap = new Map(macd.macdLine.map(x => [x.time, x.value]));
  const msMap = new Map(macd.signalLine.map(x => [x.time, x.value]));
  const mhMap = new Map(macd.histogram.map(x => [x.time, x.value]));
  const stoch = calculateStochastic(d);
  const skMap = new Map(stoch.k.map(x => [x.time, x.value]));
  const sdMap = new Map(stoch.d.map(x => [x.time, x.value]));
  const cMap = new Map(calculateCCI(d, 20).map(x => [x.time, x.value]));
  const mfMap = new Map(calculateMFI(d, 14).map(x => [x.time, x.value]));
  const bbMap = new Map(calculateBollingerBands(d, 20, 2).map(x => [x.time, x]));
  const atMap = new Map(calculateATR(d, 14).map(x => [x.time, x.value]));
  const axMap = new Map(calculateADX(d, 14).map(x => [x.time, x]));
  const obMap = new Map(calculateOBV(d).map(x => [x.time, x.value]));
  const cmMap = new Map(calculateCMF(d, 20).map(x => [x.time, x.value]));
  const vwMap = new Map(calculateVWAP(d).map(x => [x.time, x.value]));
  const vsMap = new Map(calculateVolumeSMA(d, 20).map(x => [x.time, x.value]));
  const stMap = new Map(calculateSupertrend(d, 10, 3).map(x => [x.time, x]));
  const hmaMap = new Map(calculateHMA(d, 9).map(x => [x.time, x.value]));

  const getConsensusAt = (idx) => {
    const ct = d[idx].time, close = d[idx].close, vol = d[idx].volume;
    const prevClose = d[idx - 1]?.close || close;
    let b = 0, s = 0;
    const list = [];

    const add = (name, stance, weight, val = '--') => {
      if (stance === 'BUY') b += weight;
      else if (stance === 'SELL') s += weight;
      list.push({ name, stat: stance, weight, val });
    };

    const e14 = e14Map.get(ct); if (e14) add('EMA 14', close > e14 ? 'BUY' : 'SELL', weights.EMA14, e14.toFixed(2));
    const e26 = e26Map.get(ct); if (e26) add('EMA 26', close > e26 ? 'BUY' : 'SELL', weights.EMA26, e26.toFixed(2));
    const e200 = e200Map.get(ct); if (e200) add('EMA 200', close > e200 ? 'BUY' : 'SELL', weights.EMA200, e200.toFixed(2));
    const r = rMap.get(ct) || 50; add('RSI 14', r < 30 ? 'BUY' : r > 70 ? 'SELL' : 'NEUTRAL', weights.RSI, r.toFixed(1));
    const ml = mlMap.get(ct), ms = msMap.get(ct), mh = mhMap.get(ct);
    if (ml !== undefined && ms !== undefined) {
      add('MACD Line', ml > ms ? 'BUY' : 'SELL', weights.MACD_LINE, ml.toFixed(4));
      add('MACD Signal', ml > ms ? 'BUY' : 'SELL', weights.MACD_SIGNAL, ms.toFixed(4));
      add('MACD Hist', mh > 0 ? 'BUY' : 'SELL', weights.MACD_HIST, mh.toFixed(4));
    }
    const sk = skMap.get(ct), sd = sdMap.get(ct);
    if (sk !== undefined && sd !== undefined) {
      add('Stoch K', sk < 20 ? 'BUY' : sk > 80 ? 'SELL' : 'NEUTRAL', weights.STOCH_K, sk.toFixed(1));
      add('Stoch D', sd < 20 ? 'BUY' : sd > 80 ? 'SELL' : 'NEUTRAL', weights.STOCH_D, sd.toFixed(1));
    }
    const cc = cMap.get(ct); if (cc !== undefined) add('CCI 20', cc < -100 ? 'BUY' : cc > 100 ? 'SELL' : 'NEUTRAL', weights.CCI, cc.toFixed(1));
    const mfi = mfMap.get(ct); if (mfi !== undefined) add('MFI 14', mfi < 20 ? 'BUY' : mfi > 80 ? 'SELL' : 'NEUTRAL', weights.MFI, mfi.toFixed(1));
    const bb = bbMap.get(ct);
    if (bb) {
      add('BB Upper', close > bb.upper ? 'SELL' : 'NEUTRAL', weights.BB_UPPER, bb.upper.toFixed(2));
      add('BB Basis', close > bb.basis ? 'BUY' : 'SELL', weights.BB_MIDDLE, bb.basis.toFixed(2));
      add('BB Lower', close < bb.lower ? 'BUY' : 'NEUTRAL', weights.BB_LOWER, bb.lower.toFixed(2));
    }
    const atr = atMap.get(ct);
    if (atr) add('ATR Volatility', 'NEUTRAL', weights.ATR, atr.toFixed(2));
    const ax = axMap.get(ct);
    if (ax) add('ADX Trend', ax.adx > 25 ? (ax.diP > ax.diN ? 'BUY' : 'SELL') : 'NEUTRAL', weights.ADX, ax.adx.toFixed(1));
    const obv = obMap.get(ct), prevObv = obMap.get(d[idx - 1]?.time) || 0;
    if (obv !== undefined) add('OBV Flow', obv > prevObv ? 'BUY' : 'SELL', weights.OBV, obv.toFixed(0));
    const cm = cmMap.get(ct); if (cm !== undefined) add('CMF Flow', cm > 0.05 ? 'BUY' : cm < -0.05 ? 'SELL' : 'NEUTRAL', weights.CMF, cm.toFixed(3));
    const vs = vsMap.get(ct) || 1; 
    const vStance = (vol > vs * 2) ? (close > prevClose ? 'BUY' : 'SELL') : 'NEUTRAL';
    add('Volume Spike', vStance, weights.VOL_SPIKE, (vol / vs).toFixed(1) + 'x');
    const vwap = vwMap.get(ct); if (vwap) add('VWAP', close > vwap ? 'BUY' : 'SELL', weights.VWAP, vwap.toFixed(2));

    const p = calculatePivotClassic(d.slice(0, idx + 1));
    if (p) {
      add('Pivot Point', close > p.pp ? 'BUY' : 'SELL', weights.PIVOT_P, p.pp.toFixed(2));
      add('Pivot R1', close > p.r1 ? 'SELL' : 'NEUTRAL', weights.PIVOT_R1, p.r1.toFixed(2));
      add('Pivot S1', close < p.s1 ? 'BUY' : 'NEUTRAL', weights.PIVOT_S1, p.s1.toFixed(2));
    }
    const hma = hmaMap.get(ct); if (hma) add('HMA 9', close > hma ? 'BUY' : 'SELL', weights.HMA || 8, hma.toFixed(2));
    const st = stMap.get(ct);
    if (st) add('Supertrend', st.trend === 1 ? 'BUY' : 'SELL', weights.SUPERTREND, st.value.toFixed(2));

    add('Neural Sentiment', sentimentScore > 0.1 ? 'BUY' : sentimentScore < -0.1 ? 'SELL' : 'NEUTRAL', weights.FEAR_GREED, (sentimentScore * 100).toFixed(0) + '%');

    const bPct = (b / totalWeight) * 100, sPct = (s / totalWeight) * 100, ratingAll = (b - s) / totalWeight;
    const summary = bPct > 50 ? 'STRONG BUY' : sPct > 50 ? 'STRONG SELL' : bPct > 45 ? 'BUY' : sPct > 45 ? 'SELL' : 'NEUTRAL';
    return { bPct, sPct, ratingAll, summary, list };
  };

  const markers = [];
  let lastStats = null;

  if (lastOnly) {
    const final = getConsensusAt(d.length - 1);
    lastStats = {
      totalBuy: final.bPct.toFixed(1),
      totalSell: final.sPct.toFixed(1),
      ratingAll: final.ratingAll,
      summary: final.summary,
      scoreDetail: `Neural Consensus: ${final.bPct.toFixed(1)}% Bullish / ${final.sPct.toFixed(1)}% Bearish`,
      list: final.list.sort((a, b) => b.weight - a.weight)
    };
  } else {
    let position = 0;
    for (let i = 200; i < d.length; i++) {
      const stats = getConsensusAt(i);
      if (stats.bPct > 45 && position !== 1) {
        markers.push({ time: d[i].time, position: 'belowBar', color: '#00D4FF', shape: 'arrowUp', text: `BASURI BUY (${stats.bPct.toFixed(0)}%)`, type: 'BASURI_BUY' });
        position = 1;
      } else if (stats.sPct > 45 && position !== -1) {
        markers.push({ time: d[i].time, position: 'aboveBar', color: '#FF00FF', shape: 'arrowDown', text: `BASURI SELL (${stats.sPct.toFixed(0)}%)`, type: 'BASURI_SELL' });
        position = -1;
      } else if (stats.bPct < 45 && stats.sPct < 45) {
        position = 0;
      }
      if (i === d.length - 1) {
        lastStats = {
          totalBuy: stats.bPct.toFixed(1),
          totalSell: stats.sPct.toFixed(1),
          ratingAll: stats.ratingAll,
          summary: stats.summary,
          scoreDetail: `Neural Consensus: ${stats.bPct.toFixed(1)}% Bullish / ${stats.sPct.toFixed(1)}% Bearish`,
          list: stats.list.sort((a, b) => b.weight - a.weight)
        };
      }
    }
  }

  return { markers, lastStats };
}
