import mongoose from 'mongoose';

const accountSchema = new mongoose.Schema({
  balance: { type: Number, default: 10000 }, // Default $10,000
  currency: { type: String, default: 'USDT' },
  totalPnl: { type: Number, default: 0 },
  tradesCount: { type: Number, default: 0 }
}, { timestamps: true });

export const Account = mongoose.model('Account', accountSchema);
