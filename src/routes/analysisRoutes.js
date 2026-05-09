import { Router } from 'express';
import { AnalysisController } from '../controllers/analysisController.js';

const router = Router();

// @route   GET /api/analysis/scan
// @desc    Run full analysis (Technical + Sentiment)
router.get('/scan', AnalysisController.analyze);

// @route   GET /api/analysis/history
// @desc    Get historical OHLCV data
router.get('/history', AnalysisController.getHistory);

// @route   GET /api/analysis/yahoo-history
router.get('/yahoo-history', AnalysisController.getYahooHistory);

// @route   GET /api/analysis/stream
// @desc    Server-Sent Events endpoint for live real-time charting
router.get('/stream', AnalysisController.streamHistory);

// @route   GET /api/analysis/yahoo-stream
// @desc    Simulated SSE endpoint for Yahoo Finance polling
router.get('/yahoo-stream', AnalysisController.streamYahooHistory);

// --- Watchlist Persistence ---
router.post('/watchlist', AnalysisController.saveToWatchlist);
router.get('/watchlist', AnalysisController.getWatchlist);
router.delete('/watchlist/:id', AnalysisController.removeFromWatchlist);

export default router;
