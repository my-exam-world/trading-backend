import mongoose from 'mongoose';

const AnalysisReportSchema = new mongoose.Schema({
  symbol: { type: String, required: true },
  exchange: { type: String, required: true },
  timeframe: { type: String, required: true },
  price_data: {
    price: Number,
    change_pct: Number,
  },
  stock_score: {
     score: Number,
     signals: [String],
     penalties: [String]
  },
  trade_setup: {
    targets: {
      target_1: Number,
      target_2: Number
    },
    stop_loss: Number,
    entry_points: {
      breakout_entry: Number,
      pullback_entry: Number
    }
  },
  multi_agent_consensus: {
    consensus_decision: String,
    conviction_level: String,
    total_agent_score: Number,
    agents: mongoose.Schema.Types.Mixed
  },
  fibonacci_analysis: mongoose.Schema.Types.Mixed,
  sentiment_analysis: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now }
});

export const AnalysisReport = mongoose.model('AnalysisReport', AnalysisReportSchema);
