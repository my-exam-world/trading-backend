export class MultiAgentService {
  /**
   * Run the 3-agent committee (Technical, Sentiment, Risk) debate.
   * Outputs the final consensus decision.
   */
  static runMultiAgentAnalysis(indicators, stockScoreObj, sentimentScore) {
    if (!indicators || !stockScoreObj) return null;

    const close = indicators['close'];
    const bbWidth = indicators['bbw'];
    const rsi = indicators['RSI'];
    const ema200 = indicators['EMA200'];

    // --- Technical Agent ---
    // Looks at Bollinger Band rating (pseudo)
    let techRating = 0;
    let techSignal = "NEUTRAL";
    const bbUpper = indicators['BB.upper'];
    const bbLower = indicators['BB.lower'];
    const sma20 = indicators['SMA20']; 
    
    if (close && bbUpper && bbLower && sma20) {
      if (close > bbUpper) { techRating = 3; techSignal = "STRONG BUY"; }
      else if (close > sma20 + ((bbUpper - sma20)/2)) { techRating = 2; techSignal = "BUY"; }
      else if (close > sma20) { techRating = 1; techSignal = "LEAN BULLISH"; }
      else if (close < bbLower) { techRating = -3; techSignal = "STRONG SELL"; }
      else if (close < sma20 - ((sma20 - bbLower)/2)) { techRating = -2; techSignal = "SELL"; }
      else { techRating = -1; techSignal = "LEAN BEARISH"; }
    }
    
    const technicalAnalyst = {
      agent: "Technical Analyst",
      stance: techSignal,
      score: techRating,
      reasoning: `Price action vs Bollinger Bands yields a ${techRating}/3 rating.`,
    };

    // --- Sentiment Agent ---
    // Momentum + Reddit
    let sentimentRating = 0;
    if (sentimentScore > 0.1) sentimentRating += 2;
    else if (sentimentScore > 0) sentimentRating += 1;
    else if (sentimentScore < -0.1) sentimentRating -= 2;

    if (rsi > 55 && rsi < 70) sentimentRating += 1;
    else if (rsi < 45) sentimentRating -= 1;

    let sentSignal = "NEUTRAL";
    if (sentimentRating >= 2) sentSignal = "BULLISH";
    else if (sentimentRating <= -2) sentSignal = "BEARISH";

    const sentimentAnalyst = {
      agent: "Sentiment & Momentum",
      stance: sentSignal,
      score: sentimentRating,
      reasoning: `Combined RSI + Reddit Sentiment yields a ${sentimentRating}/3 rating.`,
    };

    // --- Risk Manager ---
    // Penalties only
    let riskPenalty = 0;
    const riskNotes = [];
    if (bbWidth && bbWidth > 0.1) {
      riskPenalty -= 1;
      riskNotes.push("High Volatility (BBW > 10%)");
    }
    if (close && ema200 && close < ema200) {
      riskPenalty -= 2;
      riskNotes.push("Long Term Trend is Bearish (Price < EMA200)");
    }
    
    let riskSignal = riskPenalty < 0 ? "CAUTION" : "CLEAR";

    const riskManager = {
      agent: "Risk Manager",
      stance: riskSignal,
      score: riskPenalty,
      reasoning: riskNotes.length > 0 ? riskNotes.join("; ") : "No major risk warnings detected.",
    };

    // --- Consensus Debate ---
    const totalScore = technicalAnalyst.score + sentimentAnalyst.score + riskManager.score;
    // Map totalScore (-6 to +6) to decision
    
    let consensusDecision = "HOLD";
    let conviction = "Low";

    if (totalScore >= 4) {
      consensusDecision = "STRONG BUY";
      conviction = "High";
    } else if (totalScore >= 2) {
      consensusDecision = "BUY";
      conviction = "Medium";
    } else if (totalScore <= -4) {
      consensusDecision = "STRONG SELL";
      conviction = "High";
    } else if (totalScore <= -2) {
      consensusDecision = "SELL";
      conviction = "Medium";
    }

    return {
      consensus_decision: consensusDecision,
      conviction_level: conviction,
      total_agent_score: totalScore,
      agents: {
        technical: technicalAnalyst,
        sentiment: sentimentAnalyst,
        risk: riskManager,
      }
    };
  }
}
