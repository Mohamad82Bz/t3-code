import type { EnvironmentId, UsageLimitSourceSnapshot } from "@t3tools/contracts";
import { remainingPercent } from "@t3tools/shared/usageLimits";

export interface CodexQuotaReplenishment {
  readonly percent: number;
  readonly at: number;
}

export interface CodexQuotaTotalWindow {
  readonly remaining: number;
  readonly replenishment: CodexQuotaReplenishment | null;
  readonly weeklyExhaustedCount: number;
}

export interface CodexQuotaTotals {
  readonly session: CodexQuotaTotalWindow | null;
  readonly weekly: CodexQuotaTotalWindow | null;
}

export function resolveEnvironmentCodexQuotaTotals(
  configs: ReadonlyMap<
    EnvironmentId,
    { readonly usageLimitSources?: readonly UsageLimitSourceSnapshot[] | undefined }
  >,
  environmentId: EnvironmentId | null,
  now: number,
): CodexQuotaTotals | null {
  if (environmentId === null) return null;
  return resolveCodexQuotaTotals(configs.get(environmentId)?.usageLimitSources ?? [], now);
}

export function resolveCodexQuotaTotals(
  sources: readonly UsageLimitSourceSnapshot[],
  now: number,
): CodexQuotaTotals | null {
  const accounts = sources.flatMap((source) =>
    source.accounts.filter((account) => account.driver === "codex" && account.identifier),
  );
  if (accounts.length === 0) return null;

  const total = (kind: "session" | "weekly"): CodexQuotaTotalWindow | null => {
    const values = accounts.flatMap((account) => {
      const window = account.usageLimits.windows.find((candidate) => candidate.kind === kind);
      const weekly =
        kind === "session"
          ? account.usageLimits.windows.find((candidate) => candidate.kind === "weekly")
          : undefined;
      const rawRemaining = window ? remainingPercent(window) : 0;
      const weeklyExhausted = weekly !== undefined && remainingPercent(weekly) === 0;
      if (!window && !weeklyExhausted) return [];
      return [
        {
          remaining: kind === "session" && weeklyExhausted ? 0 : rawRemaining,
          rawRemaining,
          weeklyExhausted,
          restoresPercent:
            kind === "session" && weeklyExhausted ? rawRemaining : 100 - rawRemaining,
          resetsAt: kind === "session" && weeklyExhausted ? weekly?.resetsAt : window?.resetsAt,
        },
      ];
    });
    if (values.length === 0) return null;

    const remaining = values.reduce((sum, value) => sum + value.remaining, 0);
    const weeklyExhaustedCount =
      kind === "session" ? values.filter((value) => value.weeklyExhausted).length : 0;
    const replenishment =
      values
        .flatMap((value) => {
          if (value.resetsAt === undefined || value.restoresPercent <= 0) return [];
          const at = Date.parse(value.resetsAt);
          return Number.isFinite(at) && at > now ? [{ percent: value.restoresPercent, at }] : [];
        })
        .sort((left, right) => left.at - right.at)[0] ?? null;

    return { remaining, replenishment, weeklyExhaustedCount };
  };

  const result = { session: total("session"), weekly: total("weekly") };
  return result.session === null && result.weekly === null ? null : result;
}

export function formatCodexQuotaReplenishment(
  replenishment: CodexQuotaReplenishment,
  now: number,
): string {
  const remainingMs = Math.max(0, replenishment.at - now);
  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  const time = minutes < 60 ? `${minutes}m` : `${Math.ceil(remainingMs / 3_600_000)}h`;
  return `+${replenishment.percent}% in ${time}`;
}
