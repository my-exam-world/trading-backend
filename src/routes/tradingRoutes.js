import express from 'express';
import { TradingService } from '../services/tradingService.js';
import { tradingEvents } from '../services/tradingEvents.js';

const router = express.Router();

router.get('/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let isClosed = false;

  const sendSnapshot = async () => {
    if (isClosed) return;

    try {
      const snapshot = await TradingService.getDashboardSnapshot();
      res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
    } catch (err) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
    }
  };

  const handleChange = () => {
    void sendSnapshot();
  };

  const heartbeat = setInterval(() => {
    if (!isClosed) {
      res.write(': keepalive\n\n');
    }
  }, 15000);

  tradingEvents.on('changed', handleChange);
  await sendSnapshot();

  req.on('close', () => {
    isClosed = true;
    clearInterval(heartbeat);
    tradingEvents.off('changed', handleChange);
  });
});

// Get virtual balance
router.get('/balance', async (req, res) => {
  try {
    const balance = await TradingService.getBalance();
    res.json({ balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get trade history
router.get('/trades', async (req, res) => {
  try {
    const trades = await TradingService.getTrades();
    res.json(trades);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get open positions
router.get('/positions', async (req, res) => {
  try {
    const trades = await TradingService.getOpenPositions();
    res.json(trades);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual close position
router.post('/close', async (req, res) => {
  try {
    const { tradeId, exitPrice } = req.body;
    const trade = await TradingService.closePosition(tradeId, exitPrice);
    res.json(trade);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual order (optional)
router.post('/order', async (req, res) => {
  try {
    const trade = await TradingService.placeOrder(req.body);
    res.json(trade);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start persistent bot
router.post('/automation/start', async (req, res) => {
  try {
    const { symbol, timeframe, intervalMs } = req.body;
    if (!symbol || !timeframe) return res.status(400).json({ error: 'Missing symbol or timeframe' });
    
    // Import AutomationService here to avoid circular dependencies if any
    const { AutomationService } = await import('../services/automationService.js');
    await AutomationService.startAutomation(symbol, String(timeframe), intervalMs || 60000);
    
    res.json({ message: `Autonomous bot started for ${symbol}:${timeframe}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stop persistent bot
router.post('/automation/stop', async (req, res) => {
  try {
    const { symbol, timeframe } = req.body;
    const { AutomationService } = await import('../services/automationService.js');
    await AutomationService.stopAutomation(symbol, timeframe ? String(timeframe) : undefined);
    
    res.json({ message: `Autonomous bot stopped` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get active bots status
router.get('/automation/status', async (req, res) => {
  try {
    const { AutomationState } = await import('../models/AutomationState.js');
    const activeBots = await AutomationState.find({ isActive: true });
    res.json(activeBots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
