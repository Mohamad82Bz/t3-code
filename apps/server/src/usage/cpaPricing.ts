import * as Schema from "effect/Schema";
import type { UsageRecord } from "@t3tools/provider-core/server/usage";

const PriceFields = {
  prompt: Schema.optional(Schema.Number),
  completion: Schema.optional(Schema.Number),
  cache: Schema.optional(Schema.Number),
  cacheRead: Schema.optional(Schema.Number),
  cacheCreation: Schema.optional(Schema.Number),
  promptConfigured: Schema.optional(Schema.Boolean),
  completionConfigured: Schema.optional(Schema.Boolean),
  cacheConfigured: Schema.optional(Schema.Boolean),
  cacheReadConfigured: Schema.optional(Schema.Boolean),
  cacheCreationConfigured: Schema.optional(Schema.Boolean),
};
const Price = Schema.Struct({
  ...PriceFields,
  contextTiers: Schema.optional(
    Schema.Array(
      Schema.Struct({
        ...PriceFields,
        thresholdTokens: Schema.Number,
      }),
    ),
  ),
  serviceTiers: Schema.optional(
    Schema.Array(
      Schema.Struct({
        ...PriceFields,
        mode: Schema.String,
        serviceTier: Schema.String,
      }),
    ),
  ),
});
export const decodeCpaPrices = Schema.decodeUnknownEffect(
  Schema.Struct({ prices: Schema.Record(Schema.String, Price) }),
);
export type CpaPrices = Readonly<Record<string, typeof Price.Type>>;

export function priceCpaUsage(price: typeof Price.Type, record: UsageRecord): number | null {
  const input =
    record.totals.uncachedInputTokens +
    record.totals.cachedInputTokens +
    record.totals.cacheCreationTokens;
  const context = price.contextTiers
    ?.filter((tier) => input > tier.thresholdTokens)
    .sort((a, b) => b.thresholdTokens - a.thresholdTokens)[0];
  const service =
    record.speed === "standard"
      ? undefined
      : price.serviceTiers?.find(
          (tier) =>
            tier.mode === record.speed ||
            tier.serviceTier === (record.speed === "fast" ? "priority" : "ultrafast"),
        );
  const resolve = (field: "prompt" | "completion" | "cacheRead" | "cacheCreation") => {
    const configured = `${field}Configured` as const;
    for (const tier of [service, context]) {
      if (tier?.[configured]) return tier[field] ?? 0;
    }
    const value = price[field];
    if (
      price[configured] === true ||
      (price[configured] === undefined && value !== undefined && value > 0)
    )
      return value ?? 0;
    if (field === "cacheRead" && (price.cacheConfigured === true || (price.cache ?? 0) > 0))
      return price.cache ?? 0;
    return null;
  };
  let total = 0;
  for (const [field, tokens] of [
    ["prompt", record.totals.uncachedInputTokens],
    ["completion", record.totals.outputTokens],
    ["cacheRead", record.totals.cachedInputTokens],
    ["cacheCreation", record.totals.cacheCreationTokens],
  ] as const) {
    if (tokens === 0) continue;
    const rate = resolve(field);
    if (rate === null || !Number.isFinite(rate) || rate < 0) return null;
    total += (tokens * rate) / 1_000_000;
  }
  return Number.isFinite(total) ? total : null;
}
