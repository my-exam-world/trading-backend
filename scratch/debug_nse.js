
import { getTradingViewHistory } from '../src/services/tradingViewDataService.js';

async function testNse() {
  try {
    const candles = await getTradingViewHistory('NSE:VEDL', '1', 5);
    console.log('Processed Candles:', candles);
  } catch (err) {
    console.error('Error:', err);
  }
}

testNse();
