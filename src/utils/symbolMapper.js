/**
 * Centralized Symbol Normalization Utility
 * Maps user-input symbols and exchanges to API-specific formats for
 * TradingView and Yahoo Finance.
 */

const CRYPTO_MAP = ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT', 'MATIC', 'BNB', 'LTC', 'USDT', 'USDC'];

export class SymbolMapper {
  /**
   * Translates a symbol and exchange to a TradingView compatible format.
   * e.g., (BTC, NYSE) -> BINANCE:BTCUSDT
   */
  static toTradingView(symbol, exchange = 'NSE') {
    const sym = symbol.toUpperCase().replace('/', '');
    const ex = exchange.toUpperCase();

    // 1. Check if it's a known crypto
    if (CRYPTO_MAP.includes(sym) || sym.endsWith('USD') || sym.endsWith('USDT')) {
      // If user provided a specific pair (e.g. BTCUSD), respect the quote currency
      if (sym.length > 3 && (sym.endsWith('USD') || sym.endsWith('USDT'))) {
          // If no specific crypto exchange is set, choose a logical default
          if (['NSE', 'BSE', 'NYSE', 'NASDAQ'].includes(ex)) {
              const defaultEx = sym.endsWith('USDT') ? 'BINANCE' : 'COINBASE';
              return `${defaultEx}:${sym}`;
          }
          return `${ex}:${sym}`;
      }

      let pureSym = sym;
      if (sym.endsWith('USDT')) pureSym = sym.replace('USDT', '');
      if (sym.endsWith('USD')) pureSym = sym.replace('USD', '');
      
      // Default crypto to BINANCE:USDT if no specific pair or crypto exchange provided
      if (['NSE', 'BSE', 'NYSE', 'NASDAQ'].includes(ex)) {
        return `BINANCE:${pureSym}USDT`;
      }
    }

    // 2. Default standard format
    return `${ex}:${sym}`;
  }

  /**
   * Translates a symbol and exchange to a Yahoo Finance compatible format.
   * e.g., (BTC, NYSE) -> BTC-USD
   * e.g., (RELIANCE, NSE) -> RELIANCE.NS
   */
  static toYahoo(symbol, exchange = 'NSE') {
    const sym = symbol.toUpperCase().replace('/', '');
    const ex = exchange.toUpperCase();

    // 1. Crypto handling
    if (CRYPTO_MAP.includes(sym) || sym.endsWith('USD') || sym.endsWith('USDT')) {
      let pureSym = sym;
      if (sym.endsWith('USDT')) pureSym = sym.replace('USDT', '');
      if (sym.endsWith('USD')) pureSym = sym.replace('USD', '');
      return `${pureSym}-USD`;
    }

    // 2. Indian Stocks
    if (ex === 'NSE') return `${sym}.NS`;
    if (ex === 'BSE') return `${sym}.BO`;

    // 3. Default
    return sym;
  }
}
