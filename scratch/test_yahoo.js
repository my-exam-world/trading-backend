import { YahooFinanceService } from '../src/services/yahooFinanceService.js';
import { SymbolMapper } from '../src/utils/symbolMapper.js';

async function test() {
  const testCases = [
    { symbol: 'ADANIPOWER', exchange: 'NSE' },
    { symbol: 'BTCUSD', exchange: 'NYSE' }, // The problematic case
    { symbol: 'ETH', exchange: 'NSE' },
  ];

  for (const tc of testCases) {
    const yfSymbol = SymbolMapper.toYahoo(tc.symbol, tc.exchange);
    const tvSymbol = SymbolMapper.toTradingView(tc.symbol, tc.exchange);
    
    console.log(`\n--- Testing ${tc.symbol} (${tc.exchange}) ---`);
    console.log(`Mapped TV: ${tvSymbol}`);
    console.log(`Mapped Yahoo: ${yfSymbol}`);

    const price = await YahooFinanceService.getPrice(yfSymbol);
    console.log('Price Result:', price);
    
    if (price.error) {
      console.log('Error found as expected or unexpected depending on symbol.');
    }
  }
}

test();
