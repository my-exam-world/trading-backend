import { Trade } from '../models/Trade.js';
import { Account } from '../models/Account.js';
import { tradingEvents } from './tradingEvents.js';

/**
 * Local Dummy Exchange Service
 * Simulates trade execution in the local database.
 */
export class LocalExchangeService {
  
  static async getBalance() {
    let account = await Account.findOne();
    if (!account) {
      account = await Account.create({ balance: 10000 });
    }
    return account.balance;
  }

  static async executeOrder(params) {
    const { symbol, type, price, quantity, stopLoss, takeProfit1, takeProfit2, timeframe } = params;
    
    // Check if we have enough balance
    const balance = await this.getBalance();
    const cost = price * quantity;

    if (type === 'BUY' && balance < cost) {
      throw new Error('Insufficient virtual balance');
    }

    // Create the trade record
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

    // Update balance (Lock funds for both BUY and SELL)
    await Account.updateOne({}, { $inc: { balance: -cost } });

    console.log(`[LOCAL TRADE] ${type} ${symbol} executed at ${price}`);
    tradingEvents.emitChange({ action: 'ORDER_OPENED', tradeId: trade._id.toString(), symbol, timeframe });
    return trade;
  }

  static async closeTrade(tradeId, exitPrice) {
    const trade = await Trade.findById(tradeId);
    if (!trade || trade.status === 'CLOSED') return null;

    const pnl = trade.type === 'BUY' 
      ? (exitPrice - trade.entryPrice) * trade.quantity
      : (trade.entryPrice - exitPrice) * trade.quantity;

    trade.status = 'CLOSED';
    trade.exitPrice = exitPrice;
    trade.exitTime = new Date();
    trade.pnl = pnl;
    await trade.save();

    // Return funds to account
    const originalCost = trade.entryPrice * trade.quantity;
    await Account.updateOne({}, { 
        $inc: { 
            balance: originalCost + pnl,
            totalPnl: pnl,
            tradesCount: 1
        } 
    });

    console.log(`[LOCAL TRADE] Closed ${tradeId} at ${exitPrice}. PnL: ${pnl}`);
    tradingEvents.emitChange({ action: 'ORDER_CLOSED', tradeId: trade._id.toString(), symbol: trade.symbol, timeframe: trade.timeframe });
    return trade;
  }
}
