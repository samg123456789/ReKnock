import { TRADES } from "@/lib/trades";

export const WEBSITE_SUMMARY_PROMPT_VERSION = "website_summary@1";

export type WebsiteSummary = { description: string; trade_guess: string[] };

const SYSTEM = `You read a contractor's website text and summarize their business for an SMS follow-up tool. Return only strict JSON, no code fences, no prose. Never use em-dashes. Never invent services the text does not support.`;

export function buildWebsiteSummaryPrompt(url: string, siteText: string) {
  const tradeList = TRADES.map((t) => `${t.value} = ${t.label}`).join("\n");
  const prompt = `Website: ${url}

Text scraped from the site (may be messy):
"""
${siteText}
"""

Return JSON:
{
  "description": "1 to 2 plain sentences on what this contractor does and where, in their own framing. 8th-grade reading level. No marketing fluff, no em-dashes.",
  "trade_guess": ["the trade values from the list below that clearly apply; empty array if unclear"]
}

Allowed trade values (use the value on the left, not the label):
${tradeList}

Return only the JSON.`;
  return { system: SYSTEM, prompt, temperature: 0.3, maxTokens: 500 };
}
