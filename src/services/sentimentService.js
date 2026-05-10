import axios from 'axios';

const BULLISH_KEYWORDS = [
  "buy", "bull", "moon", "pump", "long", "call", "up", "gain",
  "strong", "breakout", "bullish", "rally", "surge", "upside",
  "accumulate", "undervalued", "support", "bottom", "recovery",
];

const BEARISH_KEYWORDS = [
  "sell", "bear", "dump", "short", "put", "down", "loss", "weak",
  "crash", "drop", "bearish", "tank", "decline", "downside",
  "overvalued", "resistance", "top", "overbought", "bubble",
];

const SUBREDDIT_GROUPS = {
  crypto: ["CryptoCurrency", "Bitcoin", "ethereum", "CryptoMarkets", "altcoin"],
  stocks: ["stocks", "investing", "wallstreetbets", "StockMarket", "ValueInvesting"],
  all: ["wallstreetbets", "stocks", "investing", "CryptoCurrency", "StockMarket"],
};

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const SENTIMENT_CACHE = new Map();
const CACHE_TTL = 60 * 1000; // 1 minute

export class SentimentService {
  static scoreText(text) {
    const t = text.toLowerCase();
    let bull = 0;
    let bear = 0;

    BULLISH_KEYWORDS.forEach(w => { if (t.includes(w)) bull++; });
    BEARISH_KEYWORDS.forEach(w => { if (t.includes(w)) bear++; });

    const total = bull + bear;
    return total === 0 ? 0 : (bull - bear) / total;
  }

  static getLabel(score) {
    if (score > 0.2) return "Strongly Bullish";
    if (score > 0.05) return "Bullish";
    if (score < -0.2) return "Strongly Bearish";
    if (score < -0.05) return "Bearish";
    return "Neutral";
  }

  static async analyzeSentiment(symbol, category = "all", limit = 20) {
    const cacheKey = `${symbol}:${category}`;
    const cached = SENTIMENT_CACHE.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      return cached.data;
    }

    const subs = SUBREDDIT_GROUPS[category] || SUBREDDIT_GROUPS.all;
    const perSub = Math.max(2, Math.floor(limit / subs.length) + 1);

    const allPosts = [];
    const scores = [];
    const seenUrls = new Set();

    for (const sub of subs) {
      try {
        const url = `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(symbol)}&sort=new&t=week&limit=${perSub}`;
        const response = await axios.get(url, {
          headers: { 'User-Agent': USER_AGENT }
        });

        const children = response.data.data.children;
        children.forEach((p) => {
          const d = p.data;
          
          if (seenUrls.has(d.permalink)) return; // Prevents duplicates!
          seenUrls.add(d.permalink);

          const text = `${d.title} ${d.selftext}`;
          const score = this.scoreText(text);
          scores.push(score);

          allPosts.push({
            title: d.title.substring(0, 120),
            upvotes: d.score,
            comments: d.num_comments,
            sentiment: score > 0 ? "bullish" : score < 0 ? "bearish" : "neutral",
            url: `https://reddit.com${d.permalink}`,
            subreddit: `r/${sub}`,
          });
        });
      } catch (error) {
        // Silently continue for failed subreddit fetches
      }
    }

    const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    allPosts.sort((a, b) => b.upvotes - a.upvotes);

    const result = {
      symbol: symbol.toUpperCase(),
      sentiment_score: Number(avg.toFixed(3)),
      sentiment_label: this.getLabel(avg),
      posts_analyzed: scores.length,
      bullish_count: scores.filter(s => s > 0).length,
      bearish_count: scores.filter(s => s < 0).length,
      neutral_count: scores.filter(s => s === 0).length,
      top_posts: allPosts.slice(0, 5),
      sources: subs.map(s => `r/${s}`),
      timestamp: new Date().toISOString(),
    };

    SENTIMENT_CACHE.set(cacheKey, { timestamp: Date.now(), data: result });
    return result;
  }
}
