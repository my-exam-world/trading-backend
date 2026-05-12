import { getTradingViewHistory } from './tradingViewDataService.js';
import { calculateBasuri } from '../utils/basuriCore.js';
import { calculateEMA } from '../utils/indicatorMath.js';
import { TradingService } from './tradingService.js';
import { Trade } from '../models/Trade.js';
import { AutomationState } from '../models/AutomationState.js';
import { SentimentService } from './sentimentService.js';

/**
 * Basuri Automation Service (Multi-Monitor Edition)
 * Monitors market data and executes trades based on the Basuri Indicator.
 * Now persistent with MongoDB!
 */
export class AutomationService {
  static monitors = new Map(); // Key: "symbol:timeframe", Value: { intervalId, symbol, timeframe }
  static MIN_INTERVAL_MS = 15000;

  static normalizeIntervalMs(intervalMs = 60000) {
    const parsed = Number(intervalMs);
    if (!Number.isFinite(parsed) || parsed < this.MIN_INTERVAL_MS) return 60000;
    return parsed;
  }

  static normalizeTime(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return Math.floor(Date.parse(`${value}T00:00:00Z`) / 1000);
    }
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
    }
    return null;
  }

  static async initPersistentBots() {
    try {
      const activeBots = await AutomationState.find({ isActive: true });
      console.log(`[AUTOMATION] Found ${activeBots.length} persistent bots to resume...`);
      for (const bot of activeBots) {
        await this._startInternal(bot.symbol, bot.timeframe, this.normalizeIntervalMs(bot.intervalMs));
      }
    } catch (err) {
      console.error('[AUTOMATION] Failed to initialize persistent bots:', err.message);
    }
  }

  static async startAutomation(symbol = 'BINANCE:BTCUSDT', timeframe = '1', intervalMs = 60000) {
    try {
      const safeIntervalMs = this.normalizeIntervalMs(intervalMs);
      await AutomationState.findOneAndUpdate(
        { symbol, timeframe },
        { isActive: true, intervalMs: safeIntervalMs },
        { upsert: true, new: true }
      );
      await this._startInternal(symbol, timeframe, safeIntervalMs);
    } catch (err) {
      console.error(`[AUTOMATION DB ERROR] Failed to save bot state for ${symbol}:${timeframe}`, err.message);
      throw err;
    }
  }

  static async _startInternal(symbol, timeframe, intervalMs) {
    const key = `${symbol}:${timeframe}`;
    
    if (this.monitors.has(key)) {
      console.log(`[AUTOMATION] Monitor already running for ${key}`);
      return;
    }
    
    console.log(`[AUTOMATION] Initializing Basuri Bot for ${key}...`);

    const monitor = { intervalId: null, symbol, timeframe, isChecking: false };
    const runCheck = async () => {
      if (monitor.isChecking) {
        console.warn(`[AUTOMATION] Previous check still running for ${key}. Skipping this tick.`);
        return;
      }

      monitor.isChecking = true;
      try {
        await this.checkSignals(symbol, timeframe);
      } catch (err) {
        console.error(`[AUTOMATION ERROR] [${key}]`, err.message);
      } finally {
        monitor.isChecking = false;
      }
    };

    monitor.intervalId = setInterval(runCheck, this.normalizeIntervalMs(intervalMs));
    
    this.monitors.set(key, monitor);
    
    // Run once immediately
    runCheck();
  }

  static async stopAutomation(symbol, timeframe) {
    if (symbol && timeframe) {
      try {
        await AutomationState.findOneAndUpdate(
          { symbol, timeframe },
          { isActive: false }
        );
      } catch (err) {
        console.error(`[AUTOMATION DB ERROR] Failed to stop bot state for ${symbol}:${timeframe}`, err.message);
      }

      const key = `${symbol}:${timeframe}`;
      const monitor = this.monitors.get(key);
      if (monitor) {
        clearInterval(monitor.intervalId);
        this.monitors.delete(key);
        console.log(`[AUTOMATION] Stopped monitor for ${key}`);
      }
    } else {
      // Stop all
      try {
        await AutomationState.updateMany({}, { isActive: false });
      } catch (err) {
         console.error(`[AUTOMATION DB ERROR] Failed to stop all bots in DB`, err.message);
      }
      for (const [key, monitor] of this.monitors.entries()) {
        clearInterval(monitor.intervalId);
        console.log(`[AUTOMATION] Stopped monitor for ${key}`);
      }
      this.monitors.clear();
    }
  }

  static async checkSignals(symbol, timeframe) {
    // Update lastRunAt in DB occasionally (optional, but good for tracking)
    AutomationState.updateOne({ symbol, timeframe }, { lastRunAt: new Date() }).catch(() => {});

    // 1. Fetch latest data (Using 5000 bars for high-precision EMA stabilization)
    const candles = await getTradingViewHistory(symbol, String(timeframe), 5000); 
    if (!candles || candles.length < 200) {
        console.warn(`[AUTOMATION] [${symbol}:${timeframe}] Insufficient data (${candles?.length || 0} bars)`);
        return;
    }

    const lastCandle = candles[candles.length - 1];
    const signalCandles = candles;
    const signalCandle = signalCandles[signalCandles.length - 1];
    const currentPrice = lastCandle.close;
    if (!signalCandle) return;

    // 2. Fetch sentiment for Fear & Greed Index
    const sentiment = await SentimentService.analyzeSentiment(symbol.split(':')[1] || symbol);
    
    // 3. Run Basuri Core Engine
    const basuri = calculateBasuri(signalCandles, sentiment.sentiment_score, false);
    const markers = basuri.markers;
    if (!basuri.lastStats) {
        console.warn(`[BOT] [${symbol}] No stats returned from Basuri engine.`);
        return;
    }

    // --- DEFENSIVE TRADING: DATA EXTRACTION ---
    const statsList = basuri.lastStats.list;
    const ema200Stat = statsList.find(s => s.name === 'EMA 200');
    const adxStat = statsList.find(s => s.name === 'ADX Trend');
    const atrStat = statsList.find(s => s.name === 'ATR Volatility');

    const ema200Value = ema200Stat ? parseFloat(ema200Stat.val) : null;
    const adxValue = adxStat ? parseFloat(adxStat.val) : null;
    const atrValue = atrStat ? parseFloat(atrStat.val) : 0;

    // 4. Position Management (Stop Loss, Take Profit, and Reversals)
    let openTrade = await Trade.findOne({ symbol, timeframe: String(timeframe), status: 'OPEN' });

    // 4a. AUTOMATED SL/TP & TRAILING STOP MONITORING
    if (openTrade) {
      let autoExitReason = null;
      const entryPrice = openTrade.entryPrice;

      // 1. Check for hard SL/TP hits
      if (openTrade.stopLoss) {
        if (openTrade.type === 'BUY' && currentPrice <= openTrade.stopLoss) autoExitReason = 'STOP_LOSS';
        else if (openTrade.type === 'SELL' && currentPrice >= openTrade.stopLoss) autoExitReason = 'STOP_LOSS';
      }
      
      // TP2 (Final) check
      if (!autoExitReason && openTrade.takeProfit2) {
        if (openTrade.type === 'BUY' && currentPrice >= openTrade.takeProfit2) autoExitReason = 'FINAL_TAKE_PROFIT';
        else if (openTrade.type === 'SELL' && currentPrice <= openTrade.takeProfit2) autoExitReason = 'FINAL_TAKE_PROFIT';
      }

      if (autoExitReason) {
        console.log(`[AUTO EXIT] [${symbol}] ${autoExitReason} hit at ${currentPrice}. Closing ${openTrade.type} position.`);
        await TradingService.closePosition(openTrade._id, currentPrice);
        AutomationState.updateOne({ symbol, timeframe }, { lastSignal: `EXIT ${openTrade.type} (${autoExitReason})` }).catch(() => {});
        openTrade = null; // SAR: Continue to check for new entries in the same tick
      }

      // 2. [NEW] SMART TP1 BREAK-EVEN JUMP
      // If price hits TP1, move SL to Entry Price + tiny buffer (Risk-Free Trade)
      const tp1Hit = openTrade.takeProfit1 && (
          (openTrade.type === 'BUY' && currentPrice >= openTrade.takeProfit1) ||
          (openTrade.type === 'SELL' && currentPrice <= openTrade.takeProfit1)
      );

      if (tp1Hit) {
          console.log(`[TARGET] [${symbol}] TP1 reached! Moving SL to Entry (${entryPrice}) for a Risk-Free Trade.`);
          await Trade.updateOne({ _id: openTrade._id }, { 
              stopLoss: entryPrice, 
              takeProfit1: null // Clear TP1 so it doesn't trigger again
          });
          openTrade.stopLoss = entryPrice;
          openTrade.takeProfit1 = null;
      }

      // 3. DYNAMIC TRAILING STOP: Move SL to protect profits
      // If price moves in our favor by 1.0x ATR, move SL to (currentPrice - 1.5x ATR)
      const currentPnL = openTrade.type === 'BUY' ? (currentPrice - entryPrice) : (entryPrice - currentPrice);
      const isProfit = currentPnL > atrValue; // Moved in favor by at least 1 ATR

      if (isProfit && atrValue > 0) {
          const newSL = openTrade.type === 'BUY' ? (currentPrice - (atrValue * 1.5)) : (currentPrice + (atrValue * 1.5));
          
          // Only move SL in our favor, never wider
          const shouldUpdate = openTrade.type === 'BUY' ? (newSL > openTrade.stopLoss) : (newSL < openTrade.stopLoss);
          
          if (shouldUpdate) {
              console.log(`[TRAILING] [${symbol}] Moving SL from ${openTrade.stopLoss.toFixed(2)} to ${newSL.toFixed(2)} to lock in profit.`);
              await Trade.updateOne({ _id: openTrade._id }, { stopLoss: newSL });
              openTrade.stopLoss = newSL; // Update local ref
          }
      }
    }

    const lastMarker = markers.length > 0 ? markers[markers.length - 1] : null;
    const lastTime = this.normalizeTime(signalCandle.time);
    const prevTime = candles.length >= 2 ? this.normalizeTime(candles[candles.length - 2].time) : null;
    const lastMarkerTime = lastMarker ? this.normalizeTime(lastMarker.time) : null;

    const hasFreshMarker = lastMarkerTime !== null && (lastMarkerTime === lastTime || lastMarkerTime === prevTime);

    // 4b. Check for Signal REVERSAL or MOMENTUM LOSS
    if (openTrade) {
      const buyPct = parseFloat(basuri.lastStats.totalBuy);
      const sellPct = parseFloat(basuri.lastStats.totalSell);

      const isOpposite = (openTrade.type === 'BUY' && (sellPct >= 50 || (lastMarker && lastMarker.type === 'BASURI_SELL'))) || 
                         (openTrade.type === 'SELL' && (buyPct >= 50 || (lastMarker && lastMarker.type === 'BASURI_BUY')));
      
      const isMomentumLoss = (openTrade.type === 'BUY' && buyPct < 45) || 
                             (openTrade.type === 'SELL' && sellPct < 45);

      if (isOpposite || isMomentumLoss) {
        const reason = isOpposite ? `Opposite Signal (SAR)` : `Momentum Loss (${openTrade.type === 'BUY' ? buyPct : sellPct}%)`;
        console.log(`[SIGNAL] [${symbol}:${timeframe}] ${reason} detected. Closing ${openTrade.type} position.`);
        
        await TradingService.closePosition(openTrade._id, currentPrice);
        AutomationState.updateOne({ symbol, timeframe }, { lastSignal: `EXIT ${openTrade.type} (${reason})` }).catch(() => {});
        openTrade = null; // Important: Set to null so the entry logic below can trigger the reverse trade
      }
    }

    const buyPct = parseFloat(basuri.lastStats.totalBuy);
    const sellPct = parseFloat(basuri.lastStats.totalSell);
    
    // Log current state for visibility
    console.log(`[BOT CHECK] ${symbol} | Buy: ${buyPct.toFixed(1)}% | Sell: ${sellPct.toFixed(1)}% | Trend: ${currentPrice > ema200Value ? 'Bullish' : 'Bearish'} (vs EMA 200) | ADX: ${adxValue?.toFixed(1) || 'N/A'}`);
    
    // 4c. New Signal (ENTRY) with Professional Filters
    if (!openTrade) {
      let side = (lastMarker && lastMarker.type === 'BASURI_BUY') ? 'BUY' : 
                 (lastMarker && lastMarker.type === 'BASURI_SELL') ? 'SELL' : null;
      
      // [TREND JOINING] If no fresh marker but consensus is very strong, we join the trend
      if (!side) {
        if (buyPct >= 55) {
          side = 'BUY';
          console.log(`[TREND JOIN] [${symbol}] No recent marker, but 55%+ Buy Consensus detected. Joining Trend.`);
        } else if (sellPct >= 55) {
          side = 'SELL';
          console.log(`[TREND JOIN] [${symbol}] No recent marker, but 55%+ Sell Consensus detected. Joining Trend.`);
        }
      }
        
      if (!side) return;

      const currentPct = side === 'BUY' ? buyPct : sellPct;
      const markerTime = lastMarker ? lastMarkerTime : lastTime; // Use last candle time for joined trends

      if (currentPct >= 50) {
        // --- PROFESSIONAL FILTERS ---
        
        // 1. TREND GUARD (1m EMA 200)
        if (ema200Value) {
          if (side === 'BUY' && currentPrice < (ema200Value * 0.998)) { // Added 0.2% buffer
            console.log(`[FILTERED] [${symbol}] BUY ignored: Price ${currentPrice} is too far below EMA 200 (${ema200Value.toFixed(2)})`);
            AutomationState.updateOne({ symbol, timeframe }, { lastSignal: `FILTERED: Below EMA 200` }).catch(() => {});
            return;
          }
          if (side === 'SELL' && currentPrice > (ema200Value * 1.002)) { // Added 0.2% buffer
            console.log(`[FILTERED] [${symbol}] SELL ignored: Price ${currentPrice} is too far above EMA 200 (${ema200Value.toFixed(2)})`);
            AutomationState.updateOne({ symbol, timeframe }, { lastSignal: `FILTERED: Above EMA 200` }).catch(() => {});
            return;
          }
        }

        // 2. VOLATILITY GUARD (ADX > 15) - Relaxed from 20 to 15
        if (adxValue !== null && adxValue < 15) {
          console.log(`[FILTERED] [${symbol}] ${side} ignored: ADX is ${adxValue.toFixed(1)} (Low Volatility/Sideways)`);
          AutomationState.updateOne({ symbol, timeframe }, { lastSignal: `FILTERED: Low ADX (${adxValue.toFixed(1)})` }).catch(() => {});
          return;
        }

        // 3. [NEW] HTF ALIGNMENT (15m Trend Guard)
        // Check if the higher timeframe is also in our direction
        try {
            const htfTimeframe = '15';
            const htfCandles = await getTradingViewHistory(symbol, htfTimeframe, 250);
            if (htfCandles && htfCandles.length > 200) {
                const htfEMAData = calculateEMA(htfCandles, 200);
                const htfEMA = htfEMAData[htfEMAData.length - 1]?.value;
                
                if (htfEMA) {
                    if (side === 'BUY' && currentPrice < htfEMA) {
                        console.log(`[FILTERED] [${symbol}] BUY ignored: 15m HTF Trend is Bearish (Price < HTF EMA 200)`);
                        AutomationState.updateOne({ symbol, timeframe }, { lastSignal: `FILTERED: HTF Trend Bearish` }).catch(() => {});
                        return;
                    }
                    if (side === 'SELL' && currentPrice > htfEMA) {
                        console.log(`[FILTERED] [${symbol}] SELL ignored: 15m HTF Trend is Bullish (Price > HTF EMA 200)`);
                        AutomationState.updateOne({ symbol, timeframe }, { lastSignal: `FILTERED: HTF Trend Bullish` }).catch(() => {});
                        return;
                    }
                }
            }
        } catch (htfErr) {
            console.warn(`[AUTOMATION] HTF Guard skipped due to error: ${htfErr.message}`);
        }

        // Atomic claim
        const state = await AutomationState.findOne({ symbol, timeframe });
        const lastTradedTime = state?.lastTradedMarkerTime || 0;

        if (markerTime > lastTradedTime) {
          const claim = await AutomationState.findOneAndUpdate(
            {
              symbol,
              timeframe,
              $or: [
                { lastTradedMarkerTime: { $exists: false } },
                { lastTradedMarkerTime: { $lt: markerTime } }
              ]
            },
            {
              lastSignal: `ENTERING ${side}`,
              lastTradedMarkerTime: markerTime
            },
            { new: true }
          );

          if (!claim) return;

          // 4. RISK MANAGEMENT & POSITION SIZING
          const riskAmountPct = 0.01; // Risk 1% of balance per trade
          const balance = await TradingService.getBalance();
          const riskValue = balance * riskAmountPct;
          
          const slDistance = atrValue * 1.5;
          const stopLoss = side === 'BUY' ? (currentPrice - slDistance) : (currentPrice + slDistance);
          
          // Quantity = RiskValue / SLDistance
          let quantity = riskValue / slDistance;
          
          // Clamp quantity (Minimum 0.1 for crypto, or 1 for stocks)
          const isStock = symbol.startsWith('NSE:') || symbol.startsWith('BSE:');
          quantity = isStock ? Math.max(1, Math.floor(quantity)) : Number(quantity.toFixed(4));

          const tp1Distance = atrValue * 2.0; // Close half at 2x ATR
          const tp2Distance = atrValue * 4.0; // Keep rest for 4x ATR
          
          const tp1 = side === 'BUY' ? (currentPrice + tp1Distance) : (currentPrice - tp1Distance);
          const tp2 = side === 'BUY' ? (currentPrice + tp2Distance) : (currentPrice - tp2Distance);

          console.log(`[SIGNAL] [${symbol}:${timeframe}] ${side} triggered. Risk: ${riskValue.toFixed(2)} | Qty: ${quantity} | SL: ${stopLoss.toFixed(2)} | TP1: ${tp1.toFixed(2)}`);

          try {
            await TradingService.placeOrder({
              symbol,
              type: side,
              price: currentPrice,
              quantity,
              stopLoss,
              takeProfit1: tp1,
              takeProfit2: tp2,
              timeframe: String(timeframe)
            });
          } catch (err) {
            await AutomationState.updateOne(
              { symbol, timeframe, lastTradedMarkerTime: markerTime },
              {
                lastSignal: `ORDER FAILED ${side}: ${err.message}`,
                lastTradedMarkerTime: lastTradedTime
              }
            ).catch(() => {});
            throw err;
          }
        }
      }
    }
  }
}
