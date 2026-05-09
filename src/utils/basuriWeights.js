/**
 * Basuri Consensus Weights (User Defined Priorities)
 * Total sum: 106.5
 */
export const BASURI_WEIGHTS = {
    "EMA14": 3,
    "EMA26": 6,
    "EMA200": 12,
    "RSI": 10,
    "MACD_LINE": 9,
    "MACD_SIGNAL": 5,
    "MACD_HIST": 2,
    "STOCH_K": 2,
    "STOCH_D": 1,
    "CCI": 1,
    "MFI": 5,
    "BB_UPPER": 1,
    "BB_MIDDLE": 3,
    "BB_LOWER": 1,
    "ATR": 6,
    "ADX": 6,
    "OBV": 8,
    "CMF": 4,
    "VOL_SPIKE": 3,
    "PIVOT_P": 2,
    "PIVOT_R1": 1.5,
    "PIVOT_R2": 1,
    "PIVOT_S1": 1.5,
    "PIVOT_S2": 1,
    "FIB_0236": 0.5,
    "FIB_0382": 0.5,
    "FIB_0500": 0.5,
    "FIB_0618": 1.5,
    "FIB_0786": 0.5,
    "VWAP": 7,
    "FEAR_GREED": 1
};

export const TOTAL_BASURI_WEIGHT = Object.values(BASURI_WEIGHTS).reduce((a, b) => a + b, 0);
