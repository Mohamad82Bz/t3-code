import { describe, expect, it } from "vite-plus/test";
import type { UsageRecord } from "@t3tools/provider-core/server/usage";
import { priceCpaUsage } from "./cpaPricing.ts";

const record: UsageRecord = {
  provider: "claude",
  timestampMs: 0,
  model: "aliased-model",
  sessionId: "session",
  dedupeKey: "request",
  reportedCostUsd: null,
  speed: "standard",
  totals: {
    uncachedInputTokens: 100,
    cachedInputTokens: 900,
    cacheCreationTokens: 0,
    outputTokens: 50,
    reasoningTokens: 25,
  },
};

describe("CPA session pricing", () => {
  it("uses cache-aware rates without charging reasoning twice and rejects missing prices", () => {
    const price = {
      prompt: 2,
      completion: 10,
      cacheRead: 0.1,
      promptConfigured: true,
      completionConfigured: true,
      cacheReadConfigured: true,
    };
    expect(priceCpaUsage(price, record)).toBeCloseTo(0.00079, 10);
    expect(priceCpaUsage({ ...price, completionConfigured: false }, record)).toBeNull();
    expect(priceCpaUsage({ ...price, completion: 0 }, record)).toBeCloseTo(0.00029, 10);
    expect(priceCpaUsage({ ...price, prompt: -1 }, record)).toBeNull();
    expect(
      priceCpaUsage(
        {
          ...price,
          contextTiers: [{ thresholdTokens: 999, completion: 20, completionConfigured: true }],
        },
        record,
      ),
    ).toBeCloseTo(0.00129, 10);
    expect(
      priceCpaUsage(
        {
          ...price,
          contextTiers: [{ thresholdTokens: 1000, completion: 20, completionConfigured: true }],
        },
        record,
      ),
    ).toBeCloseTo(0.00079, 10);
    expect(
      priceCpaUsage(
        {
          ...price,
          serviceTiers: [
            { mode: "fast", serviceTier: "priority", completion: 30, completionConfigured: true },
          ],
        },
        { ...record, speed: "fast" },
      ),
    ).toBeCloseTo(0.00179, 10);
  });
});
