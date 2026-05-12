/**
 * TradingView Historical Data Service
 * Uses @mathieuc/tradingview WebSocket client to fetch exact TV OHLCV data.
 * No auth required for public symbols.
 */

import TradingView from '@mathieuc/tradingview';

/**
 * Fetches historical OHLCV candles for a symbol directly from TradingView.
 * @param {string} symbol - Full TV symbol e.g. "NSE:ADANIPOWER"
 * @param {string} timeframe - TV timeframe: "D", "W", "60", "240" etc.
 * @param {number} bars - Number of candles to fetch (max ~5000)
 * @returns {Promise<Array>} Array of { time, open, high, low, close, volume }
 */
export async function getTradingViewHistory(symbol, timeframe = 'D', bars = 5000) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { client.end(); } catch (_) { }
        reject(new Error('TradingView WebSocket timed out after 30s'));
      }
    }, 30000);

    let client;
    try {
      client = new TradingView.Client();
    } catch (err) {
      clearTimeout(timeout);
      return reject(new Error('Failed to create TradingView client: ' + err.message));
    }

    const chart = new client.Session.Chart();

    chart.onError((...err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        try { client.end(); } catch (_) { }
        reject(new Error('TradingView chart error: ' + err.join(' ')));
      }
    });

    const session = (symbol.startsWith('NSE:') || symbol.startsWith('BSE:')) ? 'regular' : 'extended';

    chart.setMarket(symbol, {
      timeframe: timeframe,
      range: bars,
      session: session,
    });

    chart.onUpdate(() => {
      if (!settled && chart.periods && chart.periods.length > 0) {
        settled = true;
        clearTimeout(timeout);

        console.log(`[DEBUG] Received ${chart.periods.length} periods for ${symbol}`);

        try {
          console.log('[DEBUG] First candle raw data:', JSON.stringify(chart.periods[0]));
          const candles = chart.periods
            .filter(p => p && (p.time || p.t))
            .map(p => ({
              time: timeframe.includes('D') || timeframe.includes('W') || timeframe.includes('M') 
                ? new Date((p.time || p.t) * 1000).toISOString().split('T')[0]
                : (p.time || p.t),
              open:   Number(p.open ?? p.op ?? p.close ?? p.c),
              high:   Number(p.max ?? p.high ?? p.hp ?? p.open ?? p.close ?? p.c),
              low:    Number(p.min ?? p.low ?? p.lp ?? p.open ?? p.close ?? p.c),
              close:  Number(p.close ?? p.cp ?? p.c ?? p.open),
              volume: p.volume ?? p.v ?? 0,
            }))
            .sort((a, b) => (a.time > b.time ? 1 : -1));

          client.end();
          resolve(candles);
        } catch (err) {
          try { client.end(); } catch (_) { }
          reject(err);
        }
      }
    });
  });
}

/**
 * Streams real-time ticks for a symbol directly from TradingView.
 */
export async function streamTradingViewData(symbol, timeframe = 'D', onTick, onError) {
  let client;
  try {
    client = new TradingView.Client();
  } catch (err) {
    if (onError) onError(new Error('Failed to create Streaming TV client: ' + err.message));
    return () => { };
  }

  const chart = new client.Session.Chart();

  chart.onError((...err) => {
    if (onError) onError(new Error('Streaming TV chart error: ' + err.join(' ')));
    try { client.end(); } catch (_) { }
  });

  const session = (symbol.startsWith('NSE:') || symbol.startsWith('BSE:')) ? 'regular' : 'extended';

  chart.setMarket(symbol, {
    timeframe: timeframe,
    range: 1, // Only need the most recent bar/tick for streaming
    session: session,
  });

  chart.onUpdate(() => {
    if (chart.periods && chart.periods.length > 0) {
      try {
        const latest = chart.periods.reduce((prev, current) => {
          return (prev && prev.time > current.time) ? prev : current;
        });

        if (latest && (latest.time || latest.t)) {
          const liveTick = {
            symbol: symbol,
            time: timeframe.includes('D') || timeframe.includes('W') || timeframe.includes('M')
              ? new Date((latest.time || latest.t) * 1000).toISOString().split('T')[0]
              : (latest.time || latest.t),
            open:   Number(latest.open ?? latest.op ?? latest.close ?? latest.c),
            high:   Number(latest.max ?? latest.high ?? latest.hp ?? latest.open ?? latest.close ?? latest.c),
            low:    Number(latest.min ?? latest.low ?? latest.lp ?? latest.open ?? latest.close ?? latest.c),
            close:  Number(latest.close ?? latest.cp ?? latest.c ?? latest.open),
            volume: latest.volume ?? latest.v ?? 0,
          };

          // Highlight the live tick firing in the backend terminal
          console.log(`[LIVE TICK] ${symbol} | Price: ₹${liveTick.close} | Time: ${liveTick.time}`);

          if (onTick) onTick(liveTick);
        }
      } catch (e) {
        console.warn('Silent skip parsing tick', e.message);
      }
    }
  });

  // Return an unsubscribe/close function
  return () => {
    try { client.end(); } catch (_) { }
  };
}
