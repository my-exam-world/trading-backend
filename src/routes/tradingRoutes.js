import express from 'express';
import mongoose from 'mongoose';
import { TradingService } from '../services/tradingService.js';
import { tradingEvents } from '../services/tradingEvents.js';

const router = express.Router();

const parsePositiveNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const normalizeOrderPayload = (body) => {
  const type = String(body.type || '').toUpperCase();
  const price = parsePositiveNumber(body.price);
  const quantity = parsePositiveNumber(body.quantity);

  if (!body.symbol || !['BUY', 'SELL'].includes(type) || !price || !quantity) {
    return null;
  }

  return {
    symbol: String(body.symbol).toUpperCase(),
    type,
    price,
    quantity,
    stopLoss: parsePositiveNumber(body.stopLoss) ?? undefined,
    takeProfit1: parsePositiveNumber(body.takeProfit1) ?? undefined,
    takeProfit2: parsePositiveNumber(body.takeProfit2) ?? undefined,
    timeframe: body.timeframe ? String(body.timeframe) : '1',
  };
};

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

// Get trade history (with pagination)
router.get('/trades', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const data = await TradingService.getTrades(page, limit);
    res.json(data);
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
    const safeExitPrice = parsePositiveNumber(exitPrice);

    if (!mongoose.isValidObjectId(tradeId) || !safeExitPrice) {
      return res.status(400).json({ error: 'Valid tradeId and positive exitPrice are required' });
    }

    const trade = await TradingService.closePosition(tradeId, safeExitPrice);
    if (!trade) return res.status(404).json({ error: 'Open trade not found' });

    res.json(trade);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual order (optional)
router.post('/order', async (req, res) => {
  try {
    const payload = normalizeOrderPayload(req.body);
    if (!payload) {
      return res.status(400).json({ error: 'symbol, type, positive price, and positive quantity are required' });
    }

    const trade = await TradingService.placeOrder(payload);
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
    const safeIntervalMs = intervalMs === undefined ? 60000 : parsePositiveNumber(intervalMs);
    if (!safeIntervalMs || safeIntervalMs < 15000) {
      return res.status(400).json({ error: 'intervalMs must be at least 15000' });
    }
    
    // Import AutomationService here to avoid circular dependencies if any
    const { AutomationService } = await import('../services/automationService.js');
    await AutomationService.startAutomation(String(symbol).toUpperCase(), String(timeframe), safeIntervalMs);
    
    res.json({ message: `Autonomous bot started for ${symbol}:${timeframe}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stop persistent bot
router.post('/automation/stop', async (req, res) => {
  try {
    const { symbol, timeframe } = req.body;
    if ((symbol && !timeframe) || (!symbol && timeframe)) {
      return res.status(400).json({ error: 'Provide both symbol and timeframe to stop one bot, or neither to stop all bots' });
    }

    const { AutomationService } = await import('../services/automationService.js');
    await AutomationService.stopAutomation(symbol ? String(symbol).toUpperCase() : undefined, timeframe ? String(timeframe) : undefined);
    
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
