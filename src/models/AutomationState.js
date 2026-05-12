import mongoose from 'mongoose';

const automationStateSchema = new mongoose.Schema({
  symbol: {
    type: String,
    required: true,
  },
  timeframe: {
    type: String,
    required: true,
  },
  intervalMs: {
    type: Number,
    default: 60000,
  },
  isActive: {
    type: Boolean,
    default: false,
  },
  lastRunAt: {
    type: Date,
  },
  lastSignal: {
    type: String,
  },
  lastTradedMarkerTime: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
});

// Ensure a unique monitor per symbol-timeframe combination
automationStateSchema.index({ symbol: 1, timeframe: 1 }, { unique: true });

export const AutomationState = mongoose.model('AutomationState', automationStateSchema);
