/**
 * High-Precision Indicator Math Utility (Total Parity Edition)
 * Ported from and for frontend/src/utils/indicators to ensure 100% parity.
 * Aligned with TradingView Pine Script v5 standards.
 */

// --- UTILITIES ---
import { BASURI_WEIGHTS, TOTAL_BASURI_WEIGHT } from './basuriWeights.js';

/**
 * Simple Moving Average (SMA)
 */
export function calculateSMA(d, p) {
  if (!d || isNaN(p) || d.length < p) return [];
  const res = [];
  for (let i = p - 1; i < d.length; i++) {
    const slice = d.slice(i - p + 1, i + 1);
    const avg = slice.reduce((s, x) => s + (x.close || x.value || 0), 0) / p;
    res.push({ time: d[i].time, value: avg });
  }
  return res;
}

/**
 * Exponential Moving Average (EMA)
 * High-Precision Seeding: Uses SMA(p) for the first valid EMA value.
 */
export function calculateEMA(d, p) {
  if (!d || isNaN(p) || d.length < p) return [];
  const k = 2 / (p + 1);
  let sum = 0;
  for (let i = 0; i < p; i++) sum += (d[i].close || d[i].value || 0);
  let ema = sum / p;
  const res = [{ time: d[p - 1].time, value: ema }];
  for (let i = p; i < d.length; i++) {
    const val = (d[i].close || d[i].value || 0);
    ema = (val - ema) * k + ema;
    res.push({ time: d[i].time, value: ema });
  }
  return res;
}

/**
 * Wilder's Moving Average (RMA)
 */
export function calculateRMA(d, p) {
  if (!d || isNaN(p) || d.length < p) return [];
  let sum = 0;
  for (let i = 0; i < p; i++) sum += (d[i].close || d[i].value || 0);
  let rma = sum / p;
  const res = [{ time: d[p - 1].time, value: rma }];
  for (let i = p; i < d.length; i++) {
    const val = (d[i].close || d[i].value || 0);
    rma = (rma * (p - 1) + val) / p;
    res.push({ time: d[i].time, value: rma });
  }
  return res;
}

// --- TREND ---

/**
 * Supertrend
 */
export function calculateSupertrend(d, p = 10, mult = 3) {
  const atrData = calculateATR(d, p);
  const atrMap = new Map(atrData.map(x => [x.time, x.value]));
  const res = [];
  let prevUpperBand = null;
  let prevLowerBand = null;
  let prevSupertrend = null;

  for (let i = 0; i < d.length; i++) {
    const time = d[i].time;
    const atr = atrMap.get(time);
    if (atr === undefined) continue;

    const hl2 = (d[i].high + d[i].low) / 2;
    const basicUpperBand = hl2 + mult * atr;
    const basicLowerBand = hl2 - mult * atr;
    const prevClose = d[i - 1]?.close;

    const upperBand = prevUpperBand === null || basicUpperBand < prevUpperBand || prevClose > prevUpperBand
      ? basicUpperBand
      : prevUpperBand;
    const lowerBand = prevLowerBand === null || basicLowerBand > prevLowerBand || prevClose < prevLowerBand
      ? basicLowerBand
      : prevLowerBand;

    let trend = -1;
    if (prevSupertrend !== null) {
      if (prevSupertrend === prevUpperBand) {
        trend = d[i].close > upperBand ? 1 : -1;
      } else {
        trend = d[i].close < lowerBand ? -1 : 1;
      }
    }

    const supertrend = trend === 1 ? lowerBand : upperBand;
    res.push({ time, value: supertrend, trend });

    prevUpperBand = upperBand;
    prevLowerBand = lowerBand;
    prevSupertrend = supertrend;
  }
  return res;
}

/**
 * Parabolic SAR (PSAR)
 */
export function calculatePSAR(d, step = 0.02, maxStep = 0.2) {
  if (d.length < 2) return [];
  const res = [];
  let isUp = true, sar = d[0].low, ep = d[0].high, af = step;

  for (let i = 1; i < d.length; i++) {
    let prevSar = sar;
    sar = prevSar + af * (ep - prevSar);
    if (isUp) {
      if (d[i].low < sar) {
        isUp = false; sar = ep; ep = d[i].low; af = step;
      } else {
        if (d[i].high > ep) { ep = d[i].high; af = Math.min(af + step, maxStep); }
        sar = Math.min(sar, d[i - 1].low, i > 1 ? d[i - 2].low : d[i - 1].low);
      }
    } else {
      if (d[i].high > sar) {
        isUp = true; sar = ep; ep = d[i].high; af = step;
      } else {
        if (d[i].low < ep) { ep = d[i].low; af = Math.min(af + step, maxStep); }
        sar = Math.max(sar, d[i - 1].high, i > 1 ? d[i - 2].high : d[i - 1].high);
      }
    }
    res.push({ time: d[i].time, value: sar });
  }
  return res;
}

/**
 * Average Directional Index (ADX)
 */
export function calculateADX(d, p = 14) {
  if (!d || d.length < p * 2) return [];
  const dmPos = [], dmNeg = [], tr = [];
  for (let i = 1; i < d.length; i++) {
    const highDiff = d[i].high - d[i - 1].high, lowDiff = d[i - 1].low - d[i].low;
    dmPos.push({ time: d[i].time, value: highDiff > lowDiff && highDiff > 0 ? highDiff : 0 });
    dmNeg.push({ time: d[i].time, value: lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0 });
    tr.push({ time: d[i].time, value: Math.max(d[i].high - d[i].low, Math.abs(d[i].high - d[i - 1].close), Math.abs(d[i].low - d[i - 1].close)) });
  }
  const sTR = calculateRMA(tr, p), sDP = calculateRMA(dmPos, p), sDN = calculateRMA(dmNeg, p);
  const dx = [];
  const sDPMap = new Map(sDP.map(x => [x.time, x.value])), sDNMap = new Map(sDN.map(x => [x.time, x.value]));
  for (const t of sTR) {
    const diP = 100 * (sDPMap.get(t.time) / (t.value || 1)), diN = 100 * (sDNMap.get(t.time) / (t.value || 1));
    const val = 100 * Math.abs(diP - diN) / (diP + diN || 1);
    dx.push({ time: t.time, value: val, diP, diN });
  }
  const adxValues = calculateRMA(dx, p); // TradingView uses RMA for ADX smoothing
  return adxValues.map(v => {
    const orig = dx.find(x => x.time === v.time);
    return { time: v.time, adx: v.value, diP: orig.diP, diN: orig.diN };
  });
}

// --- VOLATILITY ---

/**
 * Bollinger Bands
 */
export function calculateBollingerBands(d, p = 20, s = 2) {
  const sma = calculateSMA(d, p);
  return sma.map(v => {
    const slice = d.filter(x => x.time <= v.time).slice(-p).map(x => x.close);
    const sd = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - v.value, 2), 0) / p);
    return { time: v.time, basis: v.value, upper: v.value + s * sd, lower: v.value - s * sd };
  });
}

/**
 * Donchian Channels
 */
export function calculateDonchianChannels(d, p = 20) {
  if (d.length < p) return [];
  const res = [];
  for (let i = p - 1; i < d.length; i++) {
    const slice = d.slice(i - p + 1, i + 1);
    const max = Math.max(...slice.map(x => x.high)), min = Math.min(...slice.map(x => x.low));
    res.push({ time: d[i].time, upper: max, lower: min, middle: (max + min) / 2 });
  }
  return res;
}

/**
 * Average True Range (ATR)
 */
export function calculateATR(d, p = 14) {
  if (!d || d.length < 2) return [];
  const tr = d.slice(1).map((c, i) => ({ time: c.time, value: Math.max(c.high - c.low, Math.abs(c.high - d[i].close), Math.abs(c.low - d[i].close)) }));
  return calculateRMA(tr, p);
}

// --- OSCILLATORS ---

/**
 * RSI
 */
export function calculateRSI(d, p = 14) {
  if (!d || d.length <= p) return [];
  let g = [], l = [];
  for (let i = 1; i < d.length; i++) {
    const diff = d[i].close - d[i - 1].close;
    g.push({ time: d[i].time, value: diff > 0 ? diff : 0 });
    l.push({ time: d[i].time, value: diff < 0 ? -diff : 0 });
  }
  const avgG = calculateRMA(g, p), avgL = calculateRMA(l, p);
  const lMap = new Map(avgL.map(x => [x.time, x.value]));
  return avgG.map(gVal => {
    const lVal = lMap.get(gVal.time);
    const rs = lVal === 0 ? 100 : gVal.value / (lVal || 1);
    return { time: gVal.time, value: 100 - (100 / (1 + rs)) };
  });
}

/**
 * MACD
 */
export function calculateMACD(d, f = 12, s = 26, sig = 9) {
  const eF = calculateEMA(d, f), eS = calculateEMA(d, s);
  const eSMap = new Map(eS.map(x => [x.time, x.value]));
  const line = eF.map(fast => {
    const slow = eSMap.get(fast.time);
    return slow !== undefined ? { time: fast.time, value: fast.value - slow } : null;
  }).filter(x => x);
  const signal = calculateEMA(line, sig);
  const sigMap = new Map(signal.map(x => [x.time, x.value]));
  const hist = line.map(l => {
    const sVal = sigMap.get(l.time);
    return sVal !== undefined ? { time: l.time, value: l.value - sVal } : null;
  }).filter(x => x);
  return { macdLine: line, signalLine: signal, histogram: hist };
}

/**
 * Stochastic
 */
export function calculateStochastic(d, kP = 14, dP = 3, slowP = 3) {
  if (d.length < kP) return { k: [], d: [] };
  const kRaw = [];
  for (let i = kP - 1; i < d.length; i++) {
    const slice = d.slice(i - kP + 1, i + 1);
    const low = Math.min(...slice.map(x => x.low)), high = Math.max(...slice.map(x => x.high));
    kRaw.push({ time: d[i].time, value: high !== low ? 100 * (d[i].close - low) / (high - low) : 50 });
  }
  const kSlow = calculateSMA(kRaw, slowP), dLine = calculateSMA(kSlow, dP);
  return { k: kSlow, d: dLine };
}

/**
 * Williams %R
 */
export function calculateWilliamsR(d, p = 14) {
  if (d.length < p) return [];
  const res = [];
  for (let i = p - 1; i < d.length; i++) {
    const slice = d.slice(i - p + 1, i + 1);
    const low = Math.min(...slice.map(x => x.low)), high = Math.max(...slice.map(x => x.high));
    res.push({ time: d[i].time, value: high !== low ? -100 * (high - d[i].close) / (high - low) : -50 });
  }
  return res;
}

/**
 * Commodity Channel Index (CCI)
 */
export function calculateCCI(d, p = 20) {
  if (d.length < p) return [];
  const tp = d.map(x => ({ time: x.time, value: (x.high + x.low + x.close) / 3 }));
  const sma = calculateSMA(tp, p);
  return sma.map(s => {
    const slice = tp.filter(x => x.time <= s.time).slice(-p).map(x => x.value);
    const meanDev = slice.reduce((a, b) => a + Math.abs(b - s.value), 0) / p;
    return { time: s.time, value: meanDev !== 0 ? (tp.find(x => x.time === s.time).value - s.value) / (0.015 * meanDev) : 0 };
  });
}

// --- VOLUME ---

/**
 * On-Balance Volume (OBV)
 */
export function calculateOBV(d) {
  if (d.length === 0) return [];
  let obv = 0;
  const res = [{ time: d[0].time, value: 0 }];
  for (let i = 1; i < d.length; i++) {
    if (d[i].close > d[i - 1].close) obv += d[i].volume;
    else if (d[i].close < d[i - 1].close) obv -= d[i].volume;
    res.push({ time: d[i].time, value: obv });
  }
  return res;
}

/**
 * Awesome Oscillator
 */
export function calculateAwesomeOscillator(d) {
  if (d.length < 34) return [];
  const mid = d.map(x => ({ time: x.time, value: (x.high + x.low) / 2 }));
  const sma5 = calculateSMA(mid, 5);
  const sma34 = calculateSMA(mid, 34);
  const m34 = new Map(sma34.map(x => [x.time, x.value]));
  return sma5.map(s5 => {
    const s34 = m34.get(s5.time);
    return s34 !== undefined ? { time: s5.time, value: s5.value - s34 } : null;
  }).filter(x => x);
}

/**
 * Momentum
 */
export function calculateMomentum(d, p = 10) {
  if (d.length <= p) return [];
  const res = [];
  for (let i = p; i < d.length; i++) {
    res.push({ time: d[i].time, value: d[i].close - d[i - p].close });
  }
  return res;
}

/**
 * Stochastic RSI
 */
export function calculateStochRSI(d, p = 14, kP = 3, dP = 3) {
  const rsi = calculateRSI(d, p);
  if (rsi.length < p) return { k: [], d: [] };
  const stochRsi = [];
  for (let i = p - 1; i < rsi.length; i++) {
    const slice = rsi.slice(i - p + 1, i + 1).map(x => x.value);
    const min = Math.min(...slice), max = Math.max(...slice);
    stochRsi.push({ time: rsi[i].time, value: max !== min ? (rsi[i].value - min) / (max - min) : 0 });
  }
  const k = calculateSMA(stochRsi, kP);
  const dLine = calculateSMA(k, dP);
  return { k, d: dLine };
}

/**
 * Bull Bear Power
 */
export function calculateBullBearPower(d, p = 13) {
  const ema = calculateEMA(d, p);
  const eMap = new Map(ema.map(x => [x.time, x.value]));
  return d.map(x => {
    const ev = eMap.get(x.time);
    return ev !== undefined ? { time: x.time, bull: x.high - ev, bear: x.low - ev } : null;
  }).filter(x => x);
}

/**
 * Ultimate Oscillator
 */
export function calculateUltimateOscillator(d, p1 = 7, p2 = 14, p3 = 28) {
  if (d.length <= p3) return [];
  const res = [];
  for (let i = 1; i < d.length; i++) {
    const tl = Math.min(d[i].low, d[i - 1].close);
    const bp = d[i].close - tl;
    const tr = Math.max(d[i].high, d[i - 1].close) - tl;
    res.push({ time: d[i].time, bp, tr });
  }
  const calcAvg = (p) => {
    const avgs = [];
    for (let i = p - 1; i < res.length; i++) {
      const slice = res.slice(i - p + 1, i + 1);
      const sumBP = slice.reduce((a, b) => a + b.bp, 0);
      const sumTR = slice.reduce((a, b) => a + b.tr, 0);
      avgs.push({ time: res[i].time, value: sumTR !== 0 ? sumBP / sumTR : 0 });
    }
    return avgs;
  };
  const a1 = calcAvg(p1), a2 = calcAvg(p2), a3 = calcAvg(p3);
  const m1 = new Map(a1.map(x => [x.time, x.value])), m2 = new Map(a2.map(x => [x.time, x.value]));
  return a3.map(v3 => {
    const v1 = m1.get(v3.time), v2 = m2.get(v3.time);
    return { time: v3.time, value: 100 * (4 * v1 + 2 * v2 + v3.value) / 7 };
  });
}

/**
 * Hull Moving Average (HMA)
 */
export function calculateHMA(d, p) {
  const halfLen = Math.floor(p / 2);
  const sqrtLen = Math.floor(Math.sqrt(p));
  const wma1 = calculateWMA(d, halfLen);
  const wma2 = calculateWMA(d, p);
  const wMap2 = new Map(wma2.map(x => [x.time, x.value]));
  const rawHma = wma1.map(v1 => {
    const v2 = wMap2.get(v1.time);
    return v2 !== undefined ? { time: v1.time, value: 2 * v1.value - v2 } : null;
  }).filter(x => x);
  return calculateWMA(rawHma, sqrtLen);
}

/**
 * Weighted Moving Average (WMA)
 */
export function calculateWMA(d, p) {
  if (d.length < p) return [];
  const res = [];
  const weightSum = p * (p + 1) / 2;
  for (let i = p - 1; i < d.length; i++) {
    let sum = 0;
    for (let j = 0; j < p; j++) {
      const val = (d[i - j].close || d[i - j].value || 0);
      sum += val * (p - j);
    }
    res.push({ time: d[i].time, value: sum / weightSum });
  }
  return res;
}

/**
 * Volume SMA
 */
export function calculateVolumeSMA(d, p = 20) {
  return calculateSMA(d.map(x => ({ time: x.time, value: x.volume })), p);
}

export function calculateVWMA(d, p = 20) {
  if (!d || d.length < p) return [];
  const res = [];
  for (let i = p - 1; i < d.length; i++) {
    const slice = d.slice(i - p + 1, i + 1);
    const volumeSum = slice.reduce((sum, x) => sum + (x.volume || 0), 0);
    const weightedSum = slice.reduce((sum, x) => sum + (x.close || x.value || 0) * (x.volume || 0), 0);
    res.push({
      time: d[i].time,
      value: volumeSum !== 0 ? weightedSum / volumeSum : (d[i].close || d[i].value || 0),
    });
  }
  return res;
}

/**
 * Money Flow Index (MFI)
 */
export function calculateMFI(d, p = 14) {
  if (d.length <= p) return [];
  const mfi = [];
  const typPrice = d.map(x => (x.high + x.low + x.close) / 3);
  const rawMF = typPrice.map((tp, i) => tp * d[i].volume);

  for (let i = p; i < d.length; i++) {
    let posMF = 0, negMF = 0;
    for (let j = 0; j < p; j++) {
      const curr = typPrice[i - j], prev = typPrice[i - j - 1];
      if (curr > prev) posMF += rawMF[i - j];
      else if (curr < prev) negMF += rawMF[i - j];
    }
    const mfr = negMF === 0 ? 100 : posMF / negMF;
    mfi.push({ time: d[i].time, value: 100 - (100 / (1 + mfr)) });
  }
  return mfi;
}

/**
 * Chaikin Money Flow (CMF)
 */
export function calculateCMF(d, p = 21) {
  if (d.length <= p) return [];
  const cmf = [];
  for (let i = p - 1; i < d.length; i++) {
    const slice = d.slice(i - p + 1, i + 1);
    let mfvSum = 0, volSum = 0;
    slice.forEach(x => {
      const range = x.high - x.low;
      const mfm = range === 0 ? 0 : ((x.close - x.low) - (x.high - x.close)) / range;
      mfvSum += mfm * x.volume;
      volSum += x.volume;
    });
    cmf.push({ time: d[i].time, value: volSum === 0 ? 0 : mfvSum / volSum });
  }
  return cmf;
}

/**
 * Volume Weighted Average Price (VWAP)
 */
export function calculateVWAP(d) {
  let cumTPV = 0, cumVol = 0;
  return d.map(x => {
    const tp = (x.high + x.low + x.close) / 3;
    cumTPV += tp * (x.volume || 0);
    cumVol += (x.volume || 0);
    return { time: x.time, value: cumVol === 0 ? tp : cumTPV / cumVol };
  });
}

/**
 * Fibonacci Levels (Dynamic Range)
 */
export function calculateFibLevelsForPrice(price, high, low) {
  const diff = high - low;
  if (diff === 0) return { f236: 0, f382: 0, f500: 0, f618: 0, f786: 0 };
  return {
    f236: high - diff * 0.236,
    f382: high - diff * 0.382,
    f500: high - diff * 0.500,
    f618: high - diff * 0.618,
    f786: high - diff * 0.786
  };
}

// --- PIVOTS ---

/**
 * Pivots (Classic) - Uses Previous Session High/Low/Close
 */
export function calculatePivotClassic(d) {
  if (d.length < 2) return null;
  const prev = d[d.length - 2];
  const pp = (prev.high + prev.low + prev.close) / 3;
  return { pp, r1: 2 * pp - prev.low, r2: pp + (prev.high - prev.low), r3: prev.high + 2 * (pp - prev.low), s1: 2 * pp - prev.high, s2: pp - (prev.high - prev.low), s3: prev.low - 2 * (prev.high - pp) };
}

/**
 * Pivots (Fibonacci)
 */
export function calculatePivotFib(d) {
  if (d.length < 2) return null;
  const prev = d[d.length - 2];
  const pp = (prev.high + prev.low + prev.close) / 3, range = prev.high - prev.low;
  return { pp, r1: pp + range * 0.382, r2: pp + range * 0.618, r3: pp + range * 1.0, s1: pp - range * 0.382, s2: pp - range * 0.618, s3: pp - range * 1.0 };
}

// --- SYSTEMS ---

/**
 * Gaussian Channel System (GCS)
 */
export function calculateGCS(d, config = {}) {
  const { len = 50, sigma = 6.0, offset = 0.85, mult = 2.0, zLen = 20, adxLen = 14, emaFast = 8, emaSlow = 21, cooldown = 5, volFilter = true } = config;
  if (d.length < len) return { gaussMA: [], upperChan: [], lowerChan: [], midUpper: [], midLower: [], markers: [], lastStats: null };
  const f_gauss = (_d, _idx) => {
    const m = Math.floor(offset * (len - 1));
    let s = 0, ws = 0;
    for (let i = 0; i < len; i++) {
      const pos = _idx - i; if (pos < 0) continue;
      const w = Math.exp(-0.5 * Math.pow((i - m) / sigma, 2));
      s += w * _d[pos].close; ws += w;
    }
    return ws !== 0 ? s / ws : _d[_idx].close;
  };
  const gMA = [], residuals = [];
  for (let i = 0; i < d.length; i++) {
    const val = i >= len - 1 ? f_gauss(d, i) : d[i].close;
    gMA.push({ time: d[i].time, value: val }); residuals.push(d[i].close - val);
  }
  const uC = [], lC = [], mU = [], mL = [];
  for (let i = 0; i < d.length; i++) {
    if (i < len - 1) { uC.push({ time: d[i].time, value: NaN }); lC.push({ time: d[i].time, value: NaN }); mU.push({ time: d[i].time, value: NaN }); mL.push({ time: d[i].time, value: NaN }); continue; }
    const sd = Math.sqrt(residuals.slice(i - len + 1, i + 1).reduce((s, x) => s + x * x, 0) / len);
    uC.push({ time: d[i].time, value: gMA[i].value + sd * mult });
    lC.push({ time: d[i].time, value: gMA[i].value - sd * mult });
    mU.push({ time: d[i].time, value: gMA[i].value + sd * mult * 0.5 });
    mL.push({ time: d[i].time, value: gMA[i].value - sd * mult * 0.5 });
  }
  const adx = calculateADX(d, adxLen), eF = calculateEMA(d, emaFast), eS = calculateEMA(d, emaSlow), zS = calculateZScore(d, zLen), vM = calculateVolumeSMA(d, 20);
  const aMap = new Map(adx.map(x => [x.time, x])), fMap = new Map(eF.map(x => [x.time, x.value])), sMap = new Map(eS.map(x => [x.time, x.value])), zMap = new Map(zS.map(x => [x.time, x.value])), vMap = new Map(vM.map(x => [x.time, x.value]));
  const markers = []; let lb = -100, ls = -100, lastSig = "NONE";
  for (let i = 5; i < d.length; i++) {
    const t = d[i].time, pt = d[i - 1].time, slp = (gMA[i].value - gMA[i - 5].value) / 5;
    const cz = zMap.get(t) || 0, pz = zMap.get(pt) || 0, ca = aMap.get(t), cadx = ca?.adx || 0;
    const ef = fMap.get(t) || 0, es = sMap.get(t) || 0, pef = fMap.get(pt) || 0, pes = sMap.get(pt) || 0;
    const okV = !volFilter || d[i].volume > (vMap.get(t) || 0) * 1.1;
    const buyR = d[i].low <= mL[i].value && slp > 0 && pz < -2.0 && okV && i - lb > cooldown;
    const sellR = d[i].high >= mU[i].value && slp < 0 && pz > 2.0 && okV && i - ls > cooldown;
    const buyB = d[i].close > uC[i].value && d[i - 1].close <= uC[i - 1].value && cadx > 20 && ca?.diP > ca?.diN && ef > es && okV && i - lb > cooldown;
    const sellB = d[i].close < lC[i].value && d[i - 1].close >= lC[i - 1].value && cadx > 20 && ca?.diN > ca?.diP && ef < es && okV && i - ls > cooldown;
    const buyM = ef > es && pef <= pes && d[i].close > gMA[i].value && cadx > 20 && okV && i - lb > cooldown;
    const sellM = ef < es && pef >= pes && d[i].close < gMA[i].value && cadx > 20 && okV && i - ls > cooldown;
    if (buyR || buyB || buyM) { lastSig = `BUY (${buyR ? 'REV' : buyB ? 'BRK' : 'MOM'})`; markers.push({ time: t, type: 'GCS_BUY', text: lastSig }); lb = i; }
    else if (sellR || sellB || sellM) { lastSig = `SELL (${sellR ? 'REV' : sellB ? 'BRK' : 'MOM'})`; markers.push({ time: t, type: 'GCS_SELL', text: lastSig }); ls = i; }
  }
  return { gaussMA: gMA, upperChan: uC, lowerChan: lC, midUpper: mU, midLower: mL, markers, lastStats: { zScore: zS.pop()?.value || 0, adx: adx.pop()?.adx || 0, slope: (gMA[gMA.length - 1].value - gMA[gMA.length - 6].value) / 5, emaBullish: eF.pop()?.value > eS.pop()?.value, lastSignal: lastSig } };
}

/**
 * EMA Crossovers
 */
export function calculateEMACrosses(d) {
  const e50 = calculateEMA(d, 50), e100 = calculateEMA(d, 100), e200 = calculateEMA(d, 200);
  const m100 = new Map(e100.map(x => [x.time, x.value])), m200 = new Map(e200.map(x => [x.time, x.value]));
  const res = [];
  for (let i = 1; i < e50.length; i++) {
    const t = e50[i].time, pt = e50[i - 1].time, c50 = e50[i].value, p50 = e50[i - 1].value;
    const c100 = m100.get(t), p100 = m100.get(pt), c200 = m200.get(t), p200 = m200.get(pt);
    if (c100 && p100) {
      if (p50 <= p100 && c50 > c100) res.push({ time: t, type: 'EARLY_CROSS_BULLISH', text: 'Early Cross' });
      else if (p50 >= p100 && c50 < c100) res.push({ time: t, type: 'EARLY_CROSS_BEARISH', text: 'Early Cross' });
    }
    if (c200 && p200) {
      if (p50 <= p200 && c50 > c200) res.push({ time: t, type: 'GOLDEN_CROSS_BULLISH', text: 'Golden Cross' });
      else if (p50 >= p200 && c50 < c200) res.push({ time: t, type: 'GOLDEN_CROSS_BEARISH', text: 'Golden Cross' });
    }
  }
  return res;
}

/**
 * Z-Score Utility
 */
export function calculateZScore(d, p) {
  const sma = calculateSMA(d, p);
  return sma.map(s => {
    const slice = d.filter(x => x.time <= s.time).slice(-p).map(x => x.close);
    const sd = Math.sqrt(slice.reduce((sum, x) => sum + Math.pow(x - s.value, 2), 0) / p);
    return { time: s.time, value: sd !== 0 ? (slice[p - 1] - s.value) / sd : 0 };
  });
}

/**
 * UT Bot Alerts
 */
export function calculateUTBot(d, sensitivity = 2, atrPeriod = 1) {
  if (d.length < 20) return { markers: [], trailingStop: [] };
  const atr = calculateATR(d, atrPeriod);
  const aMap = new Map(atr.map(x => [x.time, x.value]));

  const tsData = [];
  const markers = [];
  let prevTrailingStop = d[0].close;
  let prevPrice = d[0].close;
  let position = 0;

  for (let i = 1; i < d.length; i++) {
    const t = d[i].time, price = d[i].close, xATR = aMap.get(t) || 0, nLoss = sensitivity * xATR;
    let currentStop = 0;
    if (price > prevTrailingStop && prevPrice > prevTrailingStop) currentStop = Math.max(prevTrailingStop, price - nLoss);
    else if (price < prevTrailingStop && prevPrice < prevTrailingStop) currentStop = Math.min(prevTrailingStop, price + nLoss);
    else if (price > prevTrailingStop) currentStop = price - nLoss;
    else currentStop = price + nLoss;

    tsData.push({ time: t, value: currentStop });
    if (price > currentStop && prevPrice <= prevTrailingStop) {
      if (position !== 1) { markers.push({ time: t, type: 'UT_BUY', text: 'UT BUY' }); position = 1; }
    } else if (price < currentStop && prevPrice >= prevTrailingStop) {
      if (position !== -1) { markers.push({ time: t, type: 'UT_SELL', text: 'UT SELL' }); position = -1; }
    }
    prevTrailingStop = currentStop; prevPrice = price;
  }
  return { markers, trailingStop: tsData };
}

/**
 * Chandelier Exit
 */
export function calculateChandelierExit(d, p = 22, mult = 3) {
  if (d.length < p) return { long: [], short: [], markers: [] };
  const atr = calculateATR(d, p);
  const aMap = new Map(atr.map(x => [x.time, x.value]));
  const long = [], short = [], markers = [];
  let dir = 1;
  let prevLongStop = null;
  let prevShortStop = null;

  for (let i = 0; i < d.length; i++) {
    const time = d[i].time;
    const currentAtr = aMap.get(time);
    if (currentAtr === undefined) continue;

    const slice = d.slice(Math.max(0, i - p + 1), i + 1);
    let longStop = Math.max(...slice.map(x => x.close)) - currentAtr * mult;
    let shortStop = Math.min(...slice.map(x => x.close)) + currentAtr * mult;
    const longStopPrev = prevLongStop ?? longStop;
    const shortStopPrev = prevShortStop ?? shortStop;

    if (i > 0) {
      longStop = d[i - 1].close > longStopPrev ? Math.max(longStop, longStopPrev) : longStop;
      shortStop = d[i - 1].close < shortStopPrev ? Math.min(shortStop, shortStopPrev) : shortStop;
    }

    const prevDir = dir;
    dir = d[i].close > shortStopPrev ? 1 : d[i].close < longStopPrev ? -1 : dir;

    long.push({ time, value: longStop });
    short.push({ time, value: shortStop });

    if (dir === 1 && prevDir === -1) {
      markers.push({ time, type: 'CHANDELIER_BUY', text: 'CH BUY' });
    } else if (dir === -1 && prevDir === 1) {
      markers.push({ time, type: 'CHANDELIER_SELL', text: 'CH SELL' });
    }

    prevLongStop = longStop;
    prevShortStop = shortStop;
  }
  return { long, short, markers };
}

function calculateIchimokuCloud(d, conversionPeriod = 9, basePeriod = 26, spanBPeriod = 52) {
  if (!d || d.length < spanBPeriod) return [];
  const out = [];

  for (let i = 0; i < d.length; i++) {
    if (i < spanBPeriod - 1) continue;
    const convSlice = d.slice(i - conversionPeriod + 1, i + 1);
    const baseSlice = d.slice(i - basePeriod + 1, i + 1);
    const spanBSlice = d.slice(i - spanBPeriod + 1, i + 1);
    const conversion = (Math.max(...convSlice.map(x => x.high)) + Math.min(...convSlice.map(x => x.low))) / 2;
    const base = (Math.max(...baseSlice.map(x => x.high)) + Math.min(...baseSlice.map(x => x.low))) / 2;
    const spanA = (conversion + base) / 2;
    const spanB = (Math.max(...spanBSlice.map(x => x.high)) + Math.min(...spanBSlice.map(x => x.low))) / 2;
    out.push({ time: d[i].time, conversion, base, spanA, spanB });
  }

  return out;
}

function averageValid(values) {
  const valid = values.filter(v => Number.isFinite(v));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 0;
}

function comparePriceToLevel(price, level) {
  if (!Number.isFinite(level)) return 0;
  if (price > level) return 1;
  if (price < level) return -1;
  return 0;
}

function statFromRating(score) {
  if (score > 0) return 'BUY';
  if (score < 0) return 'SELL';
  return 'NEUTRAL';
}

function summaryFromRating(score) {
  if (score < -0.55) return 'STRONG SELL';
  if (score < -0.1) return 'SELL';
  if (score <= 0.1) return 'NEUTRAL';
  if (score <= 0.55) return 'BUY';
  return 'STRONG BUY';
}

function calculateBasuriTechnicalRatings(d) {
  const rsiAll = calculateRSI(d, 14);
  const stochAll = calculateStochastic(d, 14, 3, 3);
  const cciAll = calculateCCI(d, 20);
  const adxAll = calculateADX(d, 14);
  const aoAll = calculateAwesomeOscillator(d);
  const momentumAll = calculateMomentum(d, 10);
  const macdAll = calculateMACD(d);
  const stochRsiAll = calculateStochRSI(d, 14, 3, 3);
  const williamsRAll = calculateWilliamsR(d, 14);
  const bullBearAll = calculateBullBearPower(d, 13);
  const ultimateAll = calculateUltimateOscillator(d);
  const ema13All = calculateEMA(d, 13);
  const emaSet = [10, 20, 30, 50, 100, 200].map(period => ({ period, values: calculateEMA(d, period) }));
  const smaSet = [10, 20, 30, 50, 100, 200].map(period => ({ period, values: calculateSMA(d, period) }));
  const hmaAll = calculateHMA(d, 9);
  const vwmaAll = calculateVWMA(d, 20);
  const ichimokuAll = calculateIchimokuCloud(d);

  const rsiMap = new Map(rsiAll.map(x => [x.time, x.value]));
  const stochKMap = new Map(stochAll.k.map(x => [x.time, x.value]));
  const stochDMap = new Map(stochAll.d.map(x => [x.time, x.value]));
  const cciMap = new Map(cciAll.map(x => [x.time, x.value]));
  const adxMap = new Map(adxAll.map(x => [x.time, x]));
  const aoMap = new Map(aoAll.map(x => [x.time, x.value]));
  const momentumMap = new Map(momentumAll.map(x => [x.time, x.value]));
  const macdLineMap = new Map(macdAll.macdLine.map(x => [x.time, x.value]));
  const macdSignalMap = new Map(macdAll.signalLine.map(x => [x.time, x.value]));
  const stochRsiKMap = new Map(stochRsiAll.k.map(x => [x.time, x.value]));
  const stochRsiDMap = new Map(stochRsiAll.d.map(x => [x.time, x.value]));
  const williamsRMap = new Map(williamsRAll.map(x => [x.time, x.value]));
  const bullBearMap = new Map(bullBearAll.map(x => [x.time, x]));
  const ultimateMap = new Map(ultimateAll.map(x => [x.time, x.value]));
  const ema13Map = new Map(ema13All.map(x => [x.time, x.value]));
  const emaMaps = emaSet.map(item => ({ period: item.period, map: new Map(item.values.map(x => [x.time, x.value])) }));
  const smaMaps = smaSet.map(item => ({ period: item.period, map: new Map(item.values.map(x => [x.time, x.value])) }));
  const hmaMap = new Map(hmaAll.map(x => [x.time, x.value]));
  const vwmaMap = new Map(vwmaAll.map(x => [x.time, x.value]));
  const ichimokuMap = new Map(ichimokuAll.map(x => [x.time, x]));

  const snapshotAt = (index) => {
    const current = d[index];
    const previous = d[index - 1];
    const previous2 = d[index - 2];
    const time = current.time;
    const close = current.close;

    const rsiNow = rsiMap.get(time);
    const rsiPrev = previous ? rsiMap.get(previous.time) : undefined;
    const stochKNow = stochKMap.get(time);
    const stochDNow = stochDMap.get(time);
    const cciNow = cciMap.get(time);
    const cciPrev = previous ? cciMap.get(previous.time) : undefined;
    const adxNow = adxMap.get(time);
    const adxPrev = previous ? adxMap.get(previous.time) : undefined;
    const aoNow = aoMap.get(time);
    const aoPrev = previous ? aoMap.get(previous.time) : undefined;
    const aoPrev2 = previous2 ? aoMap.get(previous2.time) : undefined;
    const momentumNow = momentumMap.get(time);
    const momentumPrev = previous ? momentumMap.get(previous.time) : undefined;
    const macdNow = macdLineMap.get(time);
    const macdSignalNow = macdSignalMap.get(time);
    const stochRsiKNow = stochRsiKMap.get(time);
    const stochRsiDNow = stochRsiDMap.get(time);
    const williamsRNow = williamsRMap.get(time);
    const williamsRPrev = previous ? williamsRMap.get(previous.time) : undefined;
    const bullBearNow = bullBearMap.get(time);
    const bullBearPrev = previous ? bullBearMap.get(previous.time) : undefined;
    const ultimateNow = ultimateMap.get(time);
    const ema13Now = ema13Map.get(time);
    const ema13Prev = previous ? ema13Map.get(previous.time) : undefined;
    const ichimokuNow = ichimokuMap.get(time);

    const oscillatorRatings = [
      {
        name: 'RSI (14)',
        val: Number.isFinite(rsiNow) ? rsiNow.toFixed(2) : '--',
        rating: Number.isFinite(rsiNow) && Number.isFinite(rsiPrev)
          ? (rsiNow < 30 && rsiNow > rsiPrev ? 1 : rsiNow > 70 && rsiNow < rsiPrev ? -1 : 0)
          : 0,
      },
      {
        name: 'Stoch (14,3,3)',
        val: Number.isFinite(stochKNow) ? stochKNow.toFixed(2) : '--',
        rating: Number.isFinite(stochKNow) && Number.isFinite(stochDNow)
          ? (stochKNow < 20 && stochDNow < 20 && stochKNow > stochDNow ? 1 : stochKNow > 80 && stochDNow > 80 && stochKNow < stochDNow ? -1 : 0)
          : 0,
      },
      {
        name: 'CCI (20)',
        val: Number.isFinite(cciNow) ? cciNow.toFixed(2) : '--',
        rating: Number.isFinite(cciNow) && Number.isFinite(cciPrev)
          ? (cciNow < -100 && cciNow > cciPrev ? 1 : cciNow > 100 && cciNow < cciPrev ? -1 : 0)
          : 0,
      },
      {
        name: 'ADX (14)',
        val: Number.isFinite(adxNow?.adx) ? adxNow.adx.toFixed(2) : '--',
        rating: adxNow && adxPrev
          ? (adxNow.diP > adxNow.diN && adxNow.adx > 20 && adxNow.adx > adxPrev.adx ? 1 : adxNow.diP < adxNow.diN && adxNow.adx > 20 && adxNow.adx < adxPrev.adx ? -1 : 0)
          : 0,
      },
      {
        name: 'Awesome Osc',
        val: Number.isFinite(aoNow) ? aoNow.toFixed(4) : '--',
        rating: Number.isFinite(aoNow) && Number.isFinite(aoPrev) && Number.isFinite(aoPrev2)
          ? (aoNow > 0 && aoPrev <= 0
            ? 1
            : aoNow < 0 && aoPrev >= 0
              ? -1
              : aoNow > 0 && aoPrev > 0 && aoNow > aoPrev && aoPrev < aoPrev2
                ? 1
                : aoNow < 0 && aoPrev < 0 && aoNow < aoPrev && aoPrev > aoPrev2
                  ? -1
                  : 0)
          : 0,
      },
      {
        name: 'Momentum (10)',
        val: Number.isFinite(momentumNow) ? momentumNow.toFixed(2) : '--',
        rating: Number.isFinite(momentumNow) && Number.isFinite(momentumPrev) ? (momentumNow > momentumPrev ? 1 : momentumNow < momentumPrev ? -1 : 0) : 0,
      },
      {
        name: 'MACD (12,26,9)',
        val: Number.isFinite(macdNow) ? macdNow.toFixed(4) : '--',
        rating: Number.isFinite(macdNow) && Number.isFinite(macdSignalNow) ? (macdNow > macdSignalNow ? 1 : macdNow < macdSignalNow ? -1 : 0) : 0,
      },
      {
        name: 'Stoch RSI',
        val: Number.isFinite(stochRsiKNow) ? stochRsiKNow.toFixed(4) : '--',
        rating: Number.isFinite(stochRsiKNow) && Number.isFinite(stochRsiDNow) && Number.isFinite(rsiNow)
          ? (rsiNow < 50 && stochRsiKNow < 20 && stochRsiDNow < 20 && stochRsiKNow > stochRsiDNow
            ? 1
            : rsiNow > 50 && stochRsiKNow > 80 && stochRsiDNow > 80 && stochRsiKNow < stochRsiDNow
              ? -1
              : 0)
          : 0,
      },
      {
        name: 'Williams %R',
        val: Number.isFinite(williamsRNow) ? williamsRNow.toFixed(2) : '--',
        rating: Number.isFinite(williamsRNow) && Number.isFinite(williamsRPrev)
          ? (williamsRNow < -80 && williamsRNow > williamsRPrev ? 1 : williamsRNow > -20 && williamsRNow < williamsRPrev ? -1 : 0)
          : 0,
      },
      {
        name: 'Bull Bear Power',
        val: Number.isFinite(bullBearNow?.bull) ? bullBearNow.bull.toFixed(2) : '--',
        rating: bullBearNow && bullBearPrev && Number.isFinite(ema13Now) && Number.isFinite(ema13Prev)
          ? (ema13Now > ema13Prev && bullBearNow.bear < 0 && bullBearNow.bear > bullBearPrev.bear
            ? 1
            : ema13Now < ema13Prev && bullBearNow.bull > 0 && bullBearNow.bull < bullBearPrev.bull
              ? -1
              : 0)
          : 0,
      },
      {
        name: 'Ultimate Osc',
        val: Number.isFinite(ultimateNow) ? ultimateNow.toFixed(2) : '--',
        rating: Number.isFinite(ultimateNow) ? (ultimateNow > 70 ? 1 : ultimateNow < 30 ? -1 : 0) : 0,
      },
    ];

    const movingAverageRatings = [
      ...emaMaps.map(item => {
        const value = item.map.get(time);
        return { name: `EMA ${item.period}`, val: Number.isFinite(value) ? value.toFixed(2) : '--', rating: comparePriceToLevel(close, value) };
      }),
      ...smaMaps.map(item => {
        const value = item.map.get(time);
        return { name: `SMA ${item.period}`, val: Number.isFinite(value) ? value.toFixed(2) : '--', rating: comparePriceToLevel(close, value) };
      }),
      {
        name: 'Hull MA (9)',
        val: Number.isFinite(hmaMap.get(time)) ? hmaMap.get(time).toFixed(2) : '--',
        rating: comparePriceToLevel(close, hmaMap.get(time)),
      },
      {
        name: 'VWMA (20)',
        val: Number.isFinite(vwmaMap.get(time)) ? vwmaMap.get(time).toFixed(2) : '--',
        rating: comparePriceToLevel(close, vwmaMap.get(time)),
      },
      {
        name: 'Ichimoku (9,26,52)',
        val: ichimokuNow ? `${ichimokuNow.conversion.toFixed(2)} / ${ichimokuNow.base.toFixed(2)}` : '--',
        rating: ichimokuNow
          ? (ichimokuNow.spanA > ichimokuNow.spanB
            && ichimokuNow.base > ichimokuNow.spanA
            && ichimokuNow.conversion > ichimokuNow.base
            && close > ichimokuNow.conversion
            ? 1
            : ichimokuNow.spanA < ichimokuNow.spanB
              && ichimokuNow.base < ichimokuNow.spanA
              && ichimokuNow.conversion < ichimokuNow.base
              && close < ichimokuNow.conversion
              ? -1
              : 0)
          : 0,
      },
    ];

    const oscillatorRating = averageValid(oscillatorRatings.map(item => item.rating));
    const movingAverageRating = averageValid(movingAverageRatings.map(item => item.rating));
    const ratingAll = (oscillatorRating + movingAverageRating) / 2;
    const list = [...oscillatorRatings, ...movingAverageRatings].map(item => ({
      name: item.name,
      val: item.val,
      stat: statFromRating(item.rating),
    }));
    const totalBuy = list.filter(item => item.stat === 'BUY').length;
    const totalSell = list.filter(item => item.stat === 'SELL').length;
    const totalNeutral = list.filter(item => item.stat === 'NEUTRAL').length;

    return {
      list,
      totalBuy,
      totalSell,
      totalNeutral,
      totalScore: totalBuy + totalSell,
      summary: summaryFromRating(ratingAll),
      ratingAll,
      oscillatorRating,
      movingAverageRating,
      scoreDetail: `${totalBuy} Buy, ${totalSell} Sell, ${totalNeutral} Neutral | Rating ${ratingAll.toFixed(2)}`,
    };
  };

  const markers = [];
  let position = 0;
  for (let i = 200; i < d.length; i++) {
    const stats = snapshotAt(i);
    if (stats.summary === 'STRONG BUY' && position !== 1) {
      markers.push({ time: d[i].time, type: 'BASURI_BUY', text: 'BASURI BUY' });
      position = 1;
    } else if (stats.summary === 'STRONG SELL' && position !== -1) {
      markers.push({ time: d[i].time, type: 'BASURI_SELL', text: 'BASURI SELL' });
      position = -1;
    } else if (stats.summary !== 'STRONG BUY' && stats.summary !== 'STRONG SELL') {
      position = 0;
    }
  }

  return { markers, lastStats: snapshotAt(d.length - 1) };
}

/**
 * BASURI Neural Master (Neural 31 Supreme Consensus)
 * Updated to use User-Defined 31-indicator Priority System.
 */
import { calculateBasuri as calculateBasuriCore } from './basuriCore.js';

export function calculateBasuri(d, sentimentScore = 0, lastOnly = false) {
  return calculateBasuriCore(d, sentimentScore, lastOnly);
}
