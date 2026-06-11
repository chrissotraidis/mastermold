import { plainBriefingHeadline, plainBriefingText } from "@/lib/plain-finance-copy";

export function plainJournalSignal(signal: string) {
  const normalized = signal.trim();
  if (/^z=/i.test(normalized)) return "";
  if (normalized === "return_z") return "Unusual price move";
  if (normalized === "volume_z") return "Unusual trading volume";
  if (normalized === "news_count_z") return "News pickup";
  if (/^funding rate$/i.test(normalized)) return "Crypto borrow-payment rate";
  if (/^funding$/i.test(normalized)) return "Borrow-payment clue";
  if (/^basis$/i.test(normalized)) return "Futures price gap";
  if (normalized === "T0") return "Urgent alert";
  if (normalized === "T1") return "Worth checking";
  if (normalized === "T2") return "FYI";
  return plainJournalText(normalized);
}

export function plainJournalText(value: string) {
  const plain = plainBriefingHeadline(value);
  if (/temporary public outcome api check/i.test(plain)) {
    return "Example saved call";
  }
  if (/temporary result note/i.test(plain)) {
    return "Result saved for the example call.";
  }
  if (/legacy call body still works/i.test(plain)) {
    return "Example saved call";
  }
  if (/boundary check: public result response stays clean/i.test(plain)) {
    return "Example saved call";
  }
  if (/boundary check: keep confidence wording clean/i.test(plain)) {
    return "Example saved call";
  }
  if (/saved local verification call/i.test(plain)) {
    return "Example saved call";
  }
  if (/result saved during local verification/i.test(plain)) {
    return "Result saved for the example call.";
  }
  if (/this temporary check is removed after verification/i.test(plain)) {
    return "This entry is only an example and should not be used as investment evidence.";
  }
  if (/^temporary check$/i.test(plain)) {
    return "Review-flow check";
  }
  if (/[σ]|sigma|z-score|z=/i.test(value)) {
    return "The move stops mattering to the portfolio, no new source confirms it, or it does not change the decision by the stated horizon.";
  }
  return plain
    .replace(/\bEngine output\b/gi, "Saved market read")
    .replace(/\bsaved market scan\b/gi, "saved market read")
    .replace(/\bnext scan\b/gi, "next saved read")
    .replace(/\bsaved scan\b/gi, "saved read")
    .replace(/\bDemo data\b/gi, "Sample data")
    .replace(/\bFresh today\b/gi, "Saved today")
    .replace(/\bopen interest\b/gi, "borrow-market activity")
    .replace(/\blocal market snapshot\b/gi, "chat context snapshot")
    .replace(/\bdemo portfolio\b/gi, "sample portfolio")
    .replace(/\bin the sample portfolio, not imported money at\b/gi, "in the sample portfolio at")
    .replace(/\bNot resolved yet\b/gi, "Result was still developing")
    .replace(/\bscored on process\b/gi, "scored on review quality")
    .replace(/_/g, " ");
}
