import mongoose from 'mongoose';
import { Trade } from '../src/models/Trade.js';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/tradingview_mcp';

async function check() {
  await mongoose.connect(MONGO_URI);
  const trades = await Trade.find({ status: 'OPEN' });
  console.log('OPEN TRADES:', trades);
  process.exit();
}
check();
