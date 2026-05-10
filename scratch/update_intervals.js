import mongoose from 'mongoose';
import { AutomationState } from '../src/models/AutomationState.js';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/tradingview_mcp';

async function update() {
  await mongoose.connect(MONGO_URI);
  await AutomationState.updateMany({}, { intervalMs: 10000 });
  console.log('UPDATED ALL BOTS TO 10s INTERVAL');
  process.exit();
}
update();
