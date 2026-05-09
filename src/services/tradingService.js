import { LocalExchangeService } from './localExchangeService.js';
import { Trade } from '../models/Trade.js';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Universal Trading Service
 * Swaps between Local Dummy and Live Exchange based on .env configuration.
 */
export class TradingService {
  
  static isLive() {
    return process.env.USE_LIVE_EXCHANGE === 'true';
  }

  static async getBalance() {
    if (this.isLive()) {
      // Future: return Bybit/Binance balance
      throw new Error('Live API balance check not implemented yet');
    }
    return await LocalExchangeService.getBalance();
  }

  static async getTrades(limit = 50) {
    return await Trade.find().sort({ createdAt: -1 }).limit(limit);
  }

  static async getOpenPositions() {
    return await Trade.find({ status: 'OPEN' }).sort({ createdAt: -1 });
  }

  static async getDashboardSnapshot() {
    const [balance, trades, positions] = await Promise.all([
      this.getBalance(),
      this.getTrades(),
      this.getOpenPositions(),
    ]);

    return {
      balance,
      trades,
      positions,
      updatedAt: new Date().toISOString(),
    };
  }

  static async placeOrder(orderData) {
    console.log(`[TRADING SERVICE] Placing ${orderData.type} order for ${orderData.symbol}`);
    
    if (this.isLive()) {
        // Future: call BybitService.executeOrder(orderData)
        throw new Error('Live order execution not implemented yet');
    } else {
        return await LocalExchangeService.executeOrder(orderData);
    }
  }

  static async closePosition(tradeId, currentPrice) {
    if (this.isLive()) {
        // Future: call BybitService.closePosition(tradeId, currentPrice)
        throw new Error('Live position closing not implemented yet');
    } else {
        return await LocalExchangeService.closeTrade(tradeId, currentPrice);
    }
  }
}
