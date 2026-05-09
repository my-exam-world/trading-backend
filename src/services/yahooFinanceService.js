import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export class YahooFinanceService {
  /**
   * Fetches real-time price and meta data for a symbol.
   */
  static async getPrice(symbol) {
    try {
      const result = await yahooFinance.quote(symbol);
      
      if (!result) {
        throw new Error(`No data returned for ${symbol}`);
      }
      
      const price = result?.regularMarketPrice || 0;
      const prevClose = result?.regularMarketPreviousClose || price;
      const change = price - prevClose;
      const changePct = prevClose !== 0 ? (change / prevClose) * 100 : 0;

      return {
        symbol: symbol.toUpperCase(),
        price,
        previous_close: prevClose,
        change: Number(change.toFixed(4)),
        change_pct: Number(changePct.toFixed(2)),
        currency: result.currency || 'USD',
        exchange: result.exchangeName || '',
        market_state: result.marketState || '',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`Error fetching price for ${symbol}:`, error.message);
      return { error: error.message };
    }
  }

  /**
   * Fetches historical OHLCV data for charts.
   */
  static async getHistory(symbol, period = '1y', interval = '1d') {
    try {
      // Convert period string to a start date
      const getPastDate = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const periodMap = {
        '1d':   getPastDate(1),
        '5d':   getPastDate(5),
        '1wk':  getPastDate(7),
        '1mo':  getPastDate(30),
        '3mo':  getPastDate(90),
        '6mo':  getPastDate(180),
        '1y':   getPastDate(365),
        '5y':   getPastDate(365 * 5),
        '10y':  getPastDate(365 * 10),
      };
      let startDate = periodMap[period] || getPastDate(365);

      // --- Yahoo Finance API Constraints Safety Layer ---
      const now = new Date();
      if (interval === '1m') {
        const limit = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (startDate < limit) {
          console.log(`[YAHOO SAFETY] Capping 1m range from ${period} to 7 days.`);
          startDate = limit;
        }
      } else if (['2m', '5m', '15m', '30m', '60m', '90m', '1h'].includes(interval)) {
        const limit = new Date(now.getTime() - 59 * 24 * 60 * 60 * 1000);
        if (startDate < limit) {
          console.log(`[YAHOO SAFETY] Capping intraday range from ${period} to 59 days.`);
          startDate = limit;
        }
      }

      const result = await yahooFinance.chart(symbol, { 
        period1: startDate,
        period2: new Date(),   // ← Always fetch up to today
        interval 
      });
      return result.quotes
        .filter(q => q.open && q.high && q.low && q.close)
        .map(q => ({
          date: q.date instanceof Date ? q.date.toISOString() : q.date,
          open: Number(q.open.toFixed(4)),
          high: Number(q.high.toFixed(4)),
          low: Number(q.low.toFixed(4)),
          close: Number(q.close.toFixed(4)),
          volume: q.volume || 0
        }));
    } catch (error) {
      console.error(`Error fetching history for ${symbol}:`, error.message);
      return [];
    }
  }
}
