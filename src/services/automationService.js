import { getTradingViewHistory } from './tradingViewDataService.js';
import * as IndicatorMath from '../utils/indicatorMath.js';
import { TradingService } from './tradingService.js';
import { TradeSetupService } from './tradeSetupService.js';
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
        await this._startInternal(bot.symbol, bot.timeframe, bot.intervalMs || 60000);
      }
    } catch (err) {
      console.error('[AUTOMATION] Failed to initialize persistent bots:', err.message);
    }
  }

  static async startAutomation(symbol = 'BINANCE:BTCUSDT', timeframe = '1', intervalMs = 60000) {
    try {
      await AutomationState.findOneAndUpdate(
        { symbol, timeframe },
        { isActive: true, intervalMs },
        { upsert: true, new: true }
      );
      await this._startInternal(symbol, timeframe, intervalMs);
    } catch (err) {
      console.error(`[AUTOMATION DB ERROR] Failed to save bot state for ${symbol}:${timeframe}`, err.message);
    }
  }

  static async _startInternal(symbol, timeframe, intervalMs) {
    const key = `${symbol}:${timeframe}`;
    
    if (this.monitors.has(key)) {
      console.log(`[AUTOMATION] Monitor already running for ${key}`);
      return;
    }
    
    console.log(`[AUTOMATION] Initializing Basuri Bot for ${key}...`);
    
    const intervalId = setInterval(async () => {
      try {
        await this.checkSignals(symbol, timeframe);
      } catch (err) {
        console.error(`[AUTOMATION ERROR] [${key}]`, err.message);
      }
    }, intervalMs);
    
    this.monitors.set(key, { intervalId, symbol, timeframe });
    
    // Run once immediately
    this.checkSignals(symbol, timeframe).catch(err => {
        console.error(`[AUTOMATION ERROR] [${key}] Initial check failed:`, err.message);
    });
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

    // 2. Fetch sentiment for Fear & Greed Index (31st indicator)
    const sentiment = await SentimentService.analyzeSentiment(symbol.split(':')[1] || symbol);
    
    // 3. Run Basuri on all candles so we can detect signals correctly.
    // [CRITICAL] Changed lastOnly from true to false to enable marker detection.
    const basuri = IndicatorMath.calculateBasuri(signalCandles, sentiment.sentiment_score, false);
    const markers = basuri.markers;
    if (!basuri.lastStats) {
        console.warn(`[BOT] [${symbol}] No stats returned from Basuri engine.`);
        return;
    }
    
    // 4. Position Management (Stop & Reverse Logic)
    let openTrade = await Trade.findOne({ symbol, status: 'OPEN' });
    const lastMarker = markers.length > 0 ? markers[markers.length - 1] : null;
    const lastTime = this.normalizeTime(signalCandle.time);
    const prevTime = candles.length >= 2 ? this.normalizeTime(candles[candles.length - 2].time) : null;
    const lastMarkerTime = lastMarker ? this.normalizeTime(lastMarker.time) : null;

    // Freshness: Marker must be on the current candle OR the previous candle
    const hasFreshMarker = lastMarkerTime !== null && (lastMarkerTime === lastTime || lastMarkerTime === prevTime);

    if (lastMarker && !hasFreshMarker) {
        console.log(`[BOT] [${symbol}] Found marker at ${lastMarkerTime}, but it is not fresh (Last: ${lastTime}, Prev: ${prevTime}). Skipping.`);
    }
    
    // 4a. Check for EXIT conditions (Opposite Signal OR Momentum Loss)
    if (openTrade) {
      const isOpposite = (lastMarker && hasFreshMarker) && 
                         ((openTrade.type === 'BUY' && lastMarker.type === 'BASURI_SELL') || 
                          (openTrade.type === 'SELL' && lastMarker.type === 'BASURI_BUY'));
      
      const buyPct = parseFloat(basuri.lastStats.totalBuy);
      const sellPct = parseFloat(basuri.lastStats.totalSell);
      
      const isMomentumLoss = (openTrade.type === 'BUY' && buyPct < 50) || 
                             (openTrade.type === 'SELL' && sellPct < 50);

      if (isOpposite || isMomentumLoss) {
        const reason = isOpposite ? `Opposite Signal (${lastMarker.type})` : `Momentum Loss (${openTrade.type === 'BUY' ? buyPct : sellPct}%)`;
        console.log(`[SIGNAL] [${symbol}:${timeframe}] ${reason} detected. Closing ${openTrade.type} position.`);
        
        await TradingService.closePosition(openTrade._id, currentPrice);
        AutomationState.updateOne({ symbol, timeframe }, { lastSignal: `EXIT ${openTrade.type} (${reason})` }).catch(() => {});
        openTrade = null; // Mark as null so we can check for a fresh entry if needed
      }
    }

    const buyPct = parseFloat(basuri.lastStats.totalBuy);
    const sellPct = parseFloat(basuri.lastStats.totalSell);
    
    // We log the current state regardless of whether we trade
    console.log(`[BOT CHECK] ${symbol} | Buy: ${buyPct.toFixed(1)}% | Sell: ${sellPct.toFixed(1)}% | Summary: ${basuri.lastStats.summary} | Marker: ${lastMarker?.type || 'NONE'} at ${lastMarkerTime}`);

    // 4b. Check for New Signal (ENTRY)
    if (!openTrade) {
      if (lastMarker && hasFreshMarker) {
        const side = (lastMarker.type === 'BASURI_BUY') ? 'BUY' : 
                     (lastMarker.type === 'BASURI_SELL') ? 'SELL' : null;
        
        if (!side) {
            console.log(`[BOT] [${symbol}] Ignoring unknown marker type: ${lastMarker.type}`);
            return;
        }

        // [CRITICAL] Wait for Next Indicator Logic
        // We only enter if the marker is FRESH (exact crossover) 
        // AND it's a NEW marker that we haven't traded yet.
        const state = await AutomationState.findOne({ symbol, timeframe });
        const lastTradedTime = state?.lastTradedMarkerTime || 0;
        const markerTime = lastMarkerTime;

        if (markerTime > lastTradedTime) {
          console.log(`[SIGNAL] [${symbol}:${timeframe}] NEW BASURI ${side} detected at ${currentPrice}. Entering trade.`);
           
          await TradingService.placeOrder({
            symbol,
            type: side,
            price: currentPrice,
            quantity: 1.0,
            timeframe: String(timeframe)
          });

          await AutomationState.updateOne(
            { symbol, timeframe }, 
            { 
              lastSignal: `ENTER ${side}`,
              lastTradedMarkerTime: markerTime 
            }
          ).catch(() => {});
        } else {
          if (hasFreshMarker && markerTime <= lastTradedTime) {
            console.log(`[BOT] Skipping signal at ${markerTime} - Already traded this indicator.`);
          }
        }
      }
    }
  }
}
