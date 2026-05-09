import mongoose from 'mongoose';

const tradeSchema = new mongoose.Schema({
  symbol: { type: String, required: true },
  type: { type: String, enum: ['BUY', 'SELL'], required: true },
  entryPrice: { type: Number, required: true },
  exitPrice: { type: Number },
  quantity: { type: Number, required: true },
  status: { type: String, enum: ['OPEN', 'CLOSED'], default: 'OPEN' },
  pnl: { type: Number, default: 0 },
  stopLoss: { type: Number },
  takeProfit1: { type: Number },
  takeProfit2: { type: Number },
  time: { type: Date, default: Date.now },
  timeframe: { type: String, default: '1' },
  exitTime: { type: Date },
  isLive: { type: Boolean, default: false } 
}, { timestamps: true });

export const Trade = mongoose.model('Trade', tradeSchema);
