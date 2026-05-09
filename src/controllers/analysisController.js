import { IndicatorsService } from '../services/indicatorsService.js';
import { YahooFinanceService } from '../services/yahooFinanceService.js';
import { SentimentService } from '../services/sentimentService.js';
import { TradeSetupService } from '../services/tradeSetupService.js';
import { TradeQualityService } from '../services/tradeQualityService.js';
import { FibonacciService } from '../services/fibonacciService.js';
import { MultiAgentService } from '../services/multiAgentService.js';
import { getTradingViewHistory, streamTradingViewData } from '../services/tradingViewDataService.js';
import { AnalysisReport } from '../models/analysisReport.js';
import { SymbolMapper } from '../utils/symbolMapper.js';
import { IndicatorRegistry } from '../indicators/index.js';
import { AutomationService } from '../services/automationService.js';


export class AnalysisController {
  /**
   * Main analysis endpoint: Technicals + Sentiment + Yahoo Price
   */
  static async analyze(req, res) {
    const { symbol, exchange, timeframe } = req.query;

    if (!symbol || !exchange || !timeframe) {
      return res.status(400).json({ error: 'Missing required parameters: symbol, exchange, timeframe' });
    }

    try {
      const fullSymbol = SymbolMapper.toTradingView(symbol, exchange);
      const tvTimeframe = String(timeframe);

      console.log(`[ANALYSIS] Starting full scan for ${fullSymbol} (${tvTimeframe})`);

      console.log(`[ANALYSIS] Starting unified high-precision scan for ${fullSymbol} (${tvTimeframe})`);

      // We no longer automatically start the bot here. 
      // The user must explicitly start it via the UI to prevent zombie bots.
      // 1. Fetch RAW History (800 bars for precision) instead of Snapshot
      const tfMap = { '1m': '1', '5m': '5', '15m': '15', '30m': '30', '1h': '60', '4h': '240', '1d': 'D', '1W': 'W', '1M': 'M' };
      const tvTf = tfMap[timeframe] || 'D';
      
      let history = [];
      try {
          history = await getTradingViewHistory(fullSymbol, tvTf, 5000);
      } catch (e) {
          console.warn("[ANALYSIS] History fetch failed, Brain using degraded state:", e.message);
      }

      // 2. Calculate local indicators from history
      // We use history.slice(0, -1) for the main scan to ensure the verdict is based on a CLOSED candle.
      // This prevents the prediction from flickering with every tick.
      const closedHistory = history.length > 1 ? history.slice(0, -1) : history;
      const rawIndicators = IndicatorRegistry.calculateFromHistory(closedHistory);


      // 3. Metadata from Yahoo. Keep live price separate so the brain stays aligned to the last closed candle.
      const yfSymbol = SymbolMapper.toYahoo(symbol, exchange);
      const yahooPrice = await YahooFinanceService.getPrice(yfSymbol);
      if (yahooPrice && yahooPrice.price) rawIndicators.live_close = yahooPrice.price;

      // 4. Fetch Reddit Sentiment
      const sentiment = await SentimentService.analyzeSentiment(String(symbol));


      rawIndicators['bbw'] = (rawIndicators['BB.upper'] && rawIndicators['BB.lower'] && rawIndicators.SMA20) 
        ? (rawIndicators['BB.upper'] - rawIndicators['BB.lower']) / rawIndicators.SMA20 
        : null;

      // 5. Compute Stock Score (Layer A)
      const stockScore = IndicatorsService.computeStockScore(rawIndicators);

      // 6. Compute Trade Setup (Layer B) & Quality (Layer C)
      let tradeSetup = null;
      let tradeQuality = null;
      if (stockScore.score >= 50) { 
        tradeSetup = TradeSetupService.computeTradeSetup(rawIndicators);
        tradeQuality = TradeQualityService.computeTradeQuality(rawIndicators, stockScore.score, tradeSetup, sentiment.sentiment_score);
      }

      // 7. Advanced Brain Logic
      const fibonacci = FibonacciService.runAnalysis(rawIndicators);
      const multiAgent = MultiAgentService.runMultiAgentAnalysis(rawIndicators, stockScore, sentiment.sentiment_score);

      return res.json({
        symbol: fullSymbol,
        exchange: String(exchange),
        timeframe: tvTimeframe,
        price_data: yahooPrice,
        technical_analysis: { 
            summary: { RECOMMENDATION: stockScore.grade === "Elite" ? "STRONG_BUY" : stockScore.grade === "Strong" ? "BUY" : "NEUTRAL" },
            is_local: true
        },
        stock_score: stockScore,
        prediction: {
            action: stockScore.score >= 70 ? "BUY" : stockScore.score <= 40 ? "SELL" : "NEUTRAL",
            confidence: `${stockScore.score}%`,
            reasoning: stockScore.signals.slice(0, 3).join(", "),
            intraday_play: stockScore.score >= 80 ? "High Probability Long" : stockScore.score <= 30 ? "High Probability Short" : "Wait for Setup"
        },
        trade_setup: tradeSetup,
        trade_quality: tradeQuality,
        multi_agent_consensus: multiAgent,
        fibonacci_analysis: fibonacci,
        sentiment_analysis: sentiment,
        timestamp: new Date().toISOString(),
      });


    } catch (error) {
      console.error('[ERROR] Analysis failed:', error.message);
      return res.status(500).json({ error: 'Analysis failed', details: error.message });
    }
  }

  /**
   * Historical data endpoint - powered by TradingView WebSocket
   */
  static async getHistory(req, res) {
    const { symbol, exchange, timeframe, bars } = req.query;

    if (!symbol || !exchange) {
      return res.status(400).json({ error: 'symbol and exchange are required' });
    }

    try {
      const fullSymbol = SymbolMapper.toTradingView(symbol, exchange);
      
      // Map our UI timeframe to TradingView format
      const tfMap = { '1m': '1', '5m': '5', '15m': '15', '30m': '30', '1h': '60', '4h': '240', '1d': 'D', '1W': 'W', '1M': 'M' };
      const tvTf = tfMap[timeframe] || 'D';
      
      const numBars = parseInt(bars) || 300;

      console.log(`[HISTORY] Fetching ${numBars} bars for ${fullSymbol} (${tvTf}) from TradingView...`);
      const history = await getTradingViewHistory(fullSymbol, tvTf, numBars);
      
      return res.json({ symbol: fullSymbol, timeframe: tvTf, count: history.length, history });
    } catch (error) {
      console.error('[HISTORY ERROR]', error.message);
      return res.status(500).json({ error: 'Failed to fetch TV history', details: error.message });
    }
  }

  /**
   * Server-Sent Events (SSE) Endpoint for real-time live charting
   */
  static async streamHistory(req, res) {
    const { symbol, exchange, timeframe } = req.query;

    if (!symbol || !exchange) {
      return res.status(400).json({ error: 'symbol and exchange are required' });
    }

    const fullSymbol = SymbolMapper.toTradingView(symbol, exchange);
    const tfMap = { '1m': '1', '5m': '5', '15m': '15', '30m': '30', '1h': '60', '4h': '240', '1d': 'D', '1W': 'W', '1M': 'M' };
    const tvTf = tfMap[timeframe] || 'D';

    // Establish SSE configuration
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // Promptly send headers to establish stream

    console.log(`[STREAM] Attached real-time pipeline to ${fullSymbol} (${tvTf})`);

    const closeStream = await streamTradingViewData(
      fullSymbol, 
      tvTf, 
      (liveTick) => {
        res.write(`data: ${JSON.stringify(liveTick)}\n\n`);
      },
      (error) => {
        console.error('[STREAM ERROR]', error.message);
        res.write(`event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`);
      }
    );

    // Automatically terminate proxy connection if the client refreshes/disconnets
    req.on('close', () => {
      console.log(`[STREAM] Connection closed by client: ${fullSymbol}`);
      if (closeStream && typeof closeStream === 'function') closeStream();
    });
  }

  /**
   * Simulated Server-Sent Events (SSE) Endpoint for Yahoo Finance polling
   */
  static async streamYahooHistory(req, res) {
    const { symbol, interval } = req.query;

    if (!symbol) return res.status(400).json({ error: 'symbol is required' });

    const parts = symbol.split(':');
    const pureSymbol = parts.length > 1 ? parts[1] : symbol;
    const ex = parts.length > 1 ? parts[0] : 'NSE';
    const yfSymbol = SymbolMapper.toYahoo(pureSymbol, ex);

    const ytIntervalMap = { '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '60m', '4h': '60m', '1d': '1d', '1W': '1wk', '1M': '1mo' };
    const yInterval = ytIntervalMap[interval] || '1d';

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); 

    console.log(`[STREAM YAHOO] Attached polling pipeline to ${yfSymbol} (${yInterval})`);

    // Poll Yahoo every 5 seconds to simulate live feed. 
    // We restrict the period to '1wk' to minimize payload size and avoid API bans.
    const timer = setInterval(async () => {
      try {
        const history = await YahooFinanceService.getHistory(yfSymbol, '1wk', yInterval);
        if (history && history.length > 0) {
          const liveTick = history[history.length - 1]; // Grabs the most recent forming candle
          console.log(`[LIVE YAHOO] ${pureSymbol} | Price: ₹${liveTick.close}`);
          res.write(`data: ${JSON.stringify(liveTick)}\n\n`);
        }
      } catch (err) {
        // Drop silent to keep interval alive
      }
    }, 5000);

    req.on('close', () => {
      console.log(`[STREAM YAHOO] Connection closed by client: ${yfSymbol}`);
      clearInterval(timer);
    });
  }

  /**
   * Historical data endpoint - powered by Yahoo Finance
   */
  static async getYahooHistory(req, res) {
    const { symbol, range, interval } = req.query;

    if (!symbol) {
      return res.status(400).json({ error: 'symbol is required' });
    }

    try {
      // Clean symbol (remove EX: prefix if it exists)
      const parts = symbol.split(':');
      const pureSymbol = parts.length > 1 ? parts[1] : symbol;
      const ex = parts.length > 1 ? parts[0] : 'NSE';
      
      const yfSymbol = SymbolMapper.toYahoo(pureSymbol, ex);

      // Map interval from TV style to Yahoo style safely
      const ytIntervalMap = { '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '60m', '4h': '60m', '1d': '1d', '1W': '1wk', '1M': '1mo' };
      const yInterval = ytIntervalMap[interval] || '1d';
      
      // Range mappings
      const yRangeMap = { '1D': '1d', '5D': '5d', '1W': '1wk', '1M': '1mo', '3M': '3mo', '6M': '6mo', '1Y': '1y', '5Y': '5y', 'ALL': '10y' };
      let yRange = yRangeMap[range] || '1y';

      // Ensure 1m data always fetches 7 days for stability
      if (yInterval === '1m') yRange = '1wk';

      console.log(`[YAHOO] Fetching ${yRange} (${yInterval}) for ${yfSymbol}...`);
      const history = await YahooFinanceService.getHistory(yfSymbol, yRange, yInterval);
      
      return res.json({ symbol: yfSymbol, interval: yInterval, count: history.length, history });
    } catch (error) {
      console.error('[YAHOO HISTORY ERROR]', error.message);
      return res.status(500).json({ error: 'Failed to fetch Yahoo history', details: error.message });
    }
  }

  /**
   * Save an analysis report to the watchlist
   */
  static async saveToWatchlist(req, res) {
    try {
      const reportData = req.body;
      const newReport = new AnalysisReport(reportData);
      await newReport.save();
      res.status(201).json({ message: 'Analysis saved to watchlist successfully', report: newReport });
    } catch (error) {
      console.error('[WATCHLIST ERROR] Save failed:', error.message);
      res.status(500).json({ error: 'Failed to save analysis', details: error.message });
    }
  }

  /**
   * Fetch all saved analysis reports
   */
  static async getWatchlist(req, res) {
    try {
      const reports = await AnalysisReport.find().sort({ createdAt: -1 });
      res.json(reports);
    } catch (error) {
      console.error('[WATCHLIST ERROR] Fetch failed:', error.message);
      res.status(500).json({ error: 'Failed to fetch watchlist' });
    }
  }

  /**
   * Remove a saved report from the watchlist
   */
  static async removeFromWatchlist(req, res) {
    try {
      const { id } = req.params;
      await AnalysisReport.findByIdAndDelete(id);
      res.json({ message: 'Report removed from watchlist' });
    } catch (error) {
      console.error('[WATCHLIST ERROR] Delete failed:', error.message);
      res.status(500).json({ error: 'Failed to remove report' });
    }
  }
}
