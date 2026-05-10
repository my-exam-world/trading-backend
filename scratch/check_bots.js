import mongoose from 'mongoose';
import { AutomationState } from '../src/models/AutomationState.js';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/tradingview_mcp';

async function check() {
  await mongoose.connect(MONGO_URI);
  const states = await AutomationState.find();
  console.log('ACTIVE BOTS:', states.filter(s => s.isActive));
  process.exit();
}
check();
