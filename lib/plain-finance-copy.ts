export function plainBriefingText(value: string) {
  return value
    .replace(/\bDemo Market Wire\b/gi, "Sample market note")
    .replace(/\bDemo Crypto Desk\b/gi, "Sample crypto note")
    .replace(/\bDemo Macro Notes\b/gi, "Sample macro note")
    .replace(/\bSeeded portfolio snapshot\b/gi, "Sample portfolio snapshot")
    .replace(/\s*\([^)]*\bz-?score[^)]*\)/gi, "")
    .replace(/\s*\([^)]*\bz\s*=\s*[-+\d.]+[^)]*\)/gi, "")
    .replace(
      /\b([A-Z]{1,6})'?s recent return z-score of [-+\d.]+ indicates outperformance relative to its historical mean, suggesting potential short-term momentum\./gi,
      "$1 is moving better than usual versus its recent history, so check whether the position size still fits the visible risk.",
    )
    .replace(
      /\b([A-Z]{1,6})'?s recent return z-score of [-+\d.]+ indicates underperformance relative to its historical mean, suggesting potential downside pressure\./gi,
      "$1 is moving worse than usual versus its recent history, so check whether the original reason still holds.",
    )
    .replace(
      /\b([A-Z]{1,6})\s+1-day\s+return\s+\+(\d+(?:\.\d+)?)%(?=\s|$|[.,;)])/gi,
      "$1 moved up $2% today",
    )
    .replace(
      /\b([A-Z]{1,6})\s+1-day\s+return\s+-(\d+(?:\.\d+)?)%(?=\s|$|[.,;)])/gi,
      "$1 moved down $2% today",
    )
    .replace(
      /\b([A-Z]{1,6})\s+volume\s+([-+]?\d+(?:\.\d+)?)x\s+avg\b/gi,
      "$1 is trading $2× its usual volume",
    )
    .replace(
      /\b([A-Z]{1,6})\s+volume\s+is\s+([-+]?\d+(?:\.\d+)?)x\s+(?:average|avg)\b/gi,
      "$1 is trading $2× its usual volume",
    )
    .replace(
      /\b([A-Z]{1,6})\s+is moving up, but the picture is mixed\b/gi,
      "$1 moved up; check the bear case before adding risk",
    )
    .replace(
      /\b([A-Z]{1,6})\s+is moving, but the picture is mixed\b/gi,
      "$1 moved; check the bear case before adding risk",
    )
    .replace(/\bScreener return_z(?:\s+signal)?(?:\s+[-+\d.]+\s+vs\s+mean\s+~?[-+\d]+(?:\.\d+)?)?\b/gi, "The market scan found an unusual price move")
    .replace(/\bScreener volume_z(?:\s+signal)?(?:\s+[-+\d.]+\s+vs\s+mean\s+~?[-+\d]+(?:\.\d+)?)?\b/gi, "The market scan found unusually heavy trading")
    .replace(/\bScreener news_count_z(?:\s+signal)?(?:\s+[-+\d.]+\s+vs\s+mean\s+~?[-+\d]+(?:\.\d+)?)?\b/gi, "The market scan found a news change")
    .replace(
      /\b1-day return is [-+\d.]+σ (?:above|below) its trailing mean\s*\([^)]*\);\s*deterministic screener trigger, no model involved\.?/gi,
      "The market scan found an unusual price move.",
    )
    .replace(
      /\bVolume is [-+\d.]+σ (?:above|below) its trailing mean\s*\([^)]*\);\s*deterministic screener trigger, no model involved\.?/gi,
      "The market scan found unusually heavy trading.",
    )
    .replace(/\bOpenRouter card synthesis\b/gi, "Market summary")
    .replace(/\bOpenRouter summary\b/gi, "Market summary")
    .replace(/\bcard synthesis\b/gi, "market summary")
    .replace(
      /\bHigh relevance for tech\/growth watchlists given NVDA'?s market leadership\b/gi,
      "NVDA is a large visible position, so unusual movement can change the visible portfolio's risk today.",
    )
    .replace(
      /\bRelevant for DeFi watchlists due to its role in Aave'?s liquidity pools\.?/gi,
      "aUSDC is a small on-chain cash position, so review it only if you planned to adjust that cash.",
    )
    .replace(
      /\bBTC is a core holding in many crypto portfolios and a key benchmark for the asset class\.?/gi,
      "BTC is the largest visible holding, so a move matters more than a small watchlist item.",
    )
    .replace(/\bNo real P&L\b/gi, "No real gain or loss")
    .replace(/\bP&L\b/gi, "gain or loss")
    .replace(/\bderivatives basis\b/gi, "futures price gap")
    .replace(/\bcrypto basis\b/gi, "crypto futures price gap")
    .replace(/\bbasis carry\b/gi, "futures price gap carry")
    .replace(/\bbasis attractive\b/gi, "The futures price gap looked interesting")
    .replace(/\bbasis remains firm\b/gi, "the futures price gap stayed firm")
    .replace(/\bbasis is fragile\b/gi, "Futures price gaps can vanish")
    .replace(/\bbasis\b/gi, "futures price gap")
    .replace(/\bfunding rate\b/gi, "crypto borrow-payment rate")
    .replace(/\bfunding rates\b/gi, "crypto borrow-payment rates")
    .replace(/\bfunding flips negative\b/gi, "borrow payments turn against the trade")
    .replace(/\bfunding carry\b/gi, "borrow-payment carry")
    .replace(/\bpositive funding carry\b/gi, "positive borrow-payment carry")
    .replace(/\bReturn momentum extreme\b/gi, "Unusual price strength")
    .replace(/\bHigh unusual price moves\b/gi, "Unusual price move")
    .replace(/\bPositive return momentum\b/gi, "Price momentum")
    .replace(/\bElevated trading volume\b/gi, "Unusually heavy trading")
    .replace(/\bElevated volume\b/gi, "Unusually heavy trading")
    .replace(/\bLow news count\b/gi, "Quiet news flow")
    .replace(/\bNegative news sentiment\b/gi, "Negative headlines")
    .replace(/\bCounter-case uncertainty\b/gi, "Unclear downside case")
    .replace(
      /\bRecent readings indicate significant deviations from mean in returns, volume, and news coverage\b/gi,
      "Recent price, trading activity, and news changed enough to review today",
    )
    .replace(
      /\bsignificant deviations from mean in returns, volume, and news coverage\b/gi,
      "price, trading activity, and news changed enough to review",
    )
    .replace(
      /\bExtreme positive momentum with surging volume suggests continued institutional interest\b/gi,
      "Strong price momentum with heavy trading can point to continued interest",
    )
    .replace(
      /\bcould point to growing investor interest and potential upside\b/gi,
      "could keep buyers interested, but size the position around risk",
    )
    .replace(
      /\bgrowing investor interest and potential upside\b/gi,
      "buyers may stay interested, but size the position around risk",
    )
    .replace(
      /\bRecent unusual moves indicate above-average returns and trading volume, suggesting heightened activity\./gi,
      "Price and trading activity picked up. Check it only if you planned to adjust this small on-chain position.",
    )
    .replace(
      /\bUnusually heavy trading and unusual price moves may signal growing demand or protocol utility\./gi,
      "Heavy trading and a price move can mean more interest, but the position is small enough to avoid chasing it.",
    )
    .replace(
      /\bNegative news pickup could indicate reduced visibility or sentiment headwinds\./gi,
      "Less helpful news flow could make the move harder to trust.",
    )
    .replace(
      /\bSuch extreme readings may indicate overbought conditions and potential mean reversion\b/gi,
      "The move may already be stretched, so the risk is a pullback after the excitement fades",
    )
    .replace(
      /\bNegative news sentiment may weigh on price if negative narratives gain traction\b/gi,
      "Negative headlines could pressure the price if that story gains traction",
    )
    .replace(
      /\bNegative headlines may weigh on price if negative narratives gain traction\b/gi,
      "Negative headlines could pressure the price if that story gains traction",
    )
    .replace(
      /\bNegative news sentiment could weigh on ([A-Z]{1,6})'?s price, despite strong volume and return metrics\b/gi,
      "Negative headlines could pressure $1 even if trading activity looks strong",
    )
    .replace(/\bmean reversion\b/gi, "a pullback")
    .replace(/\boverbought conditions\b/gi, "a stretched move")
    .replace(/\bsignificant deviations?\b/gi, "unusual changes")
    .replace(/\breturn metrics\b/gi, "price moves")
    .replace(/\bvolume metrics\b/gi, "trading activity")
    .replace(/\breturn z-scores?\b/gi, "unusual price moves")
    .replace(/\bvolume z-scores?\b/gi, "unusual trading volume")
    .replace(/\bnews count z-scores?\b/gi, "news pickup")
    .replace(/\bz-scores?\b/gi, "unusual moves")
    .replace(/\bHigh unusual price moves\b/gi, "Unusual price move")
    .replace(/\b(unusual price move|unusually heavy trading|news change) reading\b/gi, "$1")
    .replace(
      /\bcould point to buyers may stay interested, but size the position around risk\b/gi,
      "could keep buyers interested, but size the position around risk",
    )
    .replace(
      /\bPrice momentum and Unusually heavy trading could point to buyers may stay interested, but size the position around risk\b/gi,
      "Price momentum and heavier trading could keep buyers interested, but size the position around risk",
    )
    .replace(
      /\bPrice momentum and Unusually heavy trading could keep buyers interested, but size the position around risk\b/gi,
      "Price momentum and heavier trading could keep buyers interested, but size the position around risk",
    )
    .replace(/\bcould point to buyers may stay interested\b/gi, "could keep buyers interested")
    .replace(/\bUnusually heavy trading could point to\b/gi, "heavier trading could point to")
    .replace(
      /\bUnusually heavy trading and unusual price moves may signal growing demand or protocol utility\b/gi,
      "Heavy trading and a price move can mean more interest, but the position is small enough to avoid chasing it",
    )
    .replace(
      /\bNegative news pickup could indicate reduced visibility or sentiment headwinds\b/gi,
      "Less helpful news flow could make the move harder to trust",
    )
    .replace(
      /\bRecent unusual moves indicate above-average returns and trading volume, suggesting heightened activity\b/gi,
      "Price and trading activity picked up. Check it only if you planned to adjust this small on-chain position",
    )
    .replace(/\bcould signal\b/gi, "could point to")
    .replace(/\bcould point to buyers may stay interested\b/gi, "could keep buyers interested")
    .replace(
      /\bPrice momentum and Unusually heavy trading could keep buyers interested, but size the position around risk\b/gi,
      "Price momentum and heavier trading could keep buyers interested, but size the position around risk",
    )
    .replace(/\s*\([^)]*\bz=[^)]+\)/gi, "")
    .replace(/\s*\(unusual moves [-+\d.]+\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function plainBriefingHeadline(value: string) {
  return plainBriefingText(value)
    .replace(/\btop call\b/gi, "top idea")
    .replace(
      /\b([A-Z]{1,6})\s+shows positive momentum amid mixed signals\b/gi,
      "$1 moved up; check the bear case before adding risk",
    )
    .replace(
      /\b([A-Z]{1,6})\s+shows strong momentum and volume signals\b/gi,
      "$1 is moving strongly and trading more than usual",
    )
    .replace(
      /\b([A-Z]{1,6})\s+shows strong volume and return signals\b/gi,
      "$1 is unusually active",
    )
    .replace(
      /\b([A-Z]{1,6})\s+shows mixed signals amidst market activity\b/gi,
      "$1 moved; check the bear case before adding risk",
    )
    .replace(/\bmixed signals\b/gi, "mixed picture")
    .replace(/\bvolume and return signals\b/gi, "unusual trading and price moves")
    .replace(/\bmomentum and volume signals\b/gi, "price strength and heavier trading")
    .replace(/\breturn signals\b/gi, "price moves")
    .replace(/\bvolume signals\b/gi, "trading activity")
    .replace(/\bsignals\b/gi, "reasons to watch")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^.+$/, sentenceCaseHeadline);
}

/**
 * Models return headlines in inconsistent Title Case ("NVDA Shows Strong
 * Momentum"). Normalize to sentence case while preserving tickers/acronyms
 * (all-caps tokens) and the first word.
 */
function sentenceCaseHeadline(headline: string): string {
  const words = headline.split(" ");
  if (words.length < 3) return headline;
  const candidates = words.slice(1).filter((word) => /^[A-Za-z]/.test(word) && !/^[A-Z0-9.&-]+$/.test(word));
  if (candidates.length === 0) return headline;
  const capitalized = candidates.filter((word) => /^[A-Z]/.test(word)).length;
  if (capitalized / candidates.length < 0.6) return headline;
  return words
    .map((word, index) => {
      if (index === 0) return word;
      if (/^[A-Z0-9.&-]+$/.test(word)) return word; // tickers, acronyms
      return word.charAt(0).toLowerCase() + word.slice(1);
    })
    .join(" ");
}
