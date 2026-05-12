import { Trade } from '../models/Trade.js';
import { Account } from '../models/Account.js';
import { tradingEvents } from './tradingEvents.js';

/**
 * Local Dummy Exchange Service
 * Simulates trade execution in the local database.
 */
export class LocalExchangeService {
  static validatePositiveNumber(value, label) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(`${label} must be a positive number`);
    }
    return parsed;
  }
  
  static async getBalance() {
    let account = await Account.findOne();
    if (!account) {
      account = await Account.create({ balance: 10000 });
    }
    return account.balance;
  }

  static async executeOrder(params) {
    const { symbol, type, stopLoss, takeProfit1, takeProfit2, timeframe } = params;
    const price = this.validatePositiveNumber(params.price, 'price');
    const quantity = this.validatePositiveNumber(params.quantity, 'quantity');

    if (!symbol || !['BUY', 'SELL'].includes(type)) {
      throw new Error('symbol and valid order type are required');
    }

    await this.getBalance();
    
    const cost = Number((price * quantity).toFixed(2));

    // ATOMIC UPDATE: Only deduct if balance >= cost
    const updateResult = await Account.updateOne(
      { balance: { $gte: cost } }, 
      { $inc: { balance: -cost } }
    );

    if (updateResult.modifiedCount === 0) {
      const currentBalance = await this.getBalance();
      const msg = `[LOCAL TRADE] REJECTED: Insufficient balance for ${type} ${symbol}. Needed: ${cost}, Available: ${currentBalance}`;
      console.error(msg);
      throw new Error(msg);
    }

    // Create the trade record only after funds are successfully locked
    const trade = await Trade.create({
      symbol,
      type,
      entryPrice: price,
      quantity,
      status: 'OPEN',
      stopLoss,
      takeProfit1,
      takeProfit2,
      timeframe,
      isLive: false
    });

    console.log(`[LOCAL TRADE] ${type} ${symbol} executed at ${price}. Locked: ${cost}`);
    tradingEvents.emitChange({ action: 'ORDER_OPENED', tradeId: trade._id.toString(), symbol, timeframe });
    return trade;
  }

  static async closeTrade(tradeId, exitPrice) {
    const safeExitPrice = this.validatePositiveNumber(exitPrice, 'exitPrice');
    const trade = await Trade.findById(tradeId);
    if (!trade || trade.status === 'CLOSED') return null;

    // Calculate PnL with precision
    const rawPnl = trade.type === 'BUY' 
      ? (safeExitPrice - trade.entryPrice) * trade.quantity
      : (trade.entryPrice - safeExitPrice) * trade.quantity;
    
    const pnl = Number(rawPnl.toFixed(2));

    trade.status = 'CLOSED';
    trade.exitPrice = safeExitPrice;
    trade.exitTime = new Date();
    trade.pnl = pnl;
    await trade.save();

    // Return funds to account (Atomic Increment)
    const originalCost = Number((trade.entryPrice * trade.quantity).toFixed(2));
    const returnAmount = Number((originalCost + pnl).toFixed(2));

    await Account.updateOne({}, { 
        $inc: { 
            balance: returnAmount,
            totalPnl: pnl,
            tradesCount: 1
        } 
    });

    console.log(`[LOCAL TRADE] Closed ${tradeId} at ${safeExitPrice}. PnL: ${pnl}. Returned: ${returnAmount}`);
    tradingEvents.emitChange({ action: 'ORDER_CLOSED', tradeId: trade._id.toString(), symbol: trade.symbol, timeframe: trade.timeframe });
    return trade;
  }
}
