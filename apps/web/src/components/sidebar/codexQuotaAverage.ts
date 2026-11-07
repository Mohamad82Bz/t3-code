import type { UsageLimitSourceSnapshot } from "@t3tools/contracts";
import { remainingPercent } from "@t3tools/shared/usageLimits";

export interface CodexQuotaReplenishment {
  readonly percent: number;
  readonly at: number;
}

export interface CodexQuotaAverageWindow {
  readonly remaining: number;
  readonly replenishment: CodexQuotaReplenishment | null;
  readonly suppressedPercent: number;
}

export interface CodexQuotaAverage {
  readonly session: CodexQuotaAverageWindow | null;
  readonly weekly: CodexQuotaAverageWindow | null;
}

export function resolveCodexQuotaAverage(
  sources: readonly UsageLimitSourceSnapshot[],
  now: number,
): CodexQuotaAverage | null {
  const accounts = sources.flatMap((source) =>
    source.accounts.filter((account) => account.driver === "codex" && account.identifier),
  );
  if (accounts.length === 0) return null;

  const average = (kind: "session" | "weekly"): CodexQuotaAverageWindow | null => {
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
          restoresPercent:
            kind === "session" && weeklyExhausted ? rawRemaining : 100 - rawRemaining,
          resetsAt: kind === "session" && weeklyExhausted ? weekly?.resetsAt : window?.resetsAt,
        },
      ];
    });
    if (values.length === 0) return null;

    const remaining = Math.round(
      values.reduce((sum, value) => sum + value.remaining, 0) / values.length,
    );
    const suppressedPercent =
      kind === "session"
        ? Math.round(
            values.reduce((sum, value) => sum + (value.rawRemaining - value.remaining), 0) /
              values.length,
          )
        : 0;
    const replenishment =
      values
        .flatMap((value) => {
          if (value.resetsAt === undefined || value.remaining >= 100) return [];
          const at = Date.parse(value.resetsAt);
          return Number.isFinite(at) && at > now
            ? [{ percent: Math.round((value.restoresPercent / values.length) * 10) / 10, at }]
            : [];
        })
        .sort((left, right) => left.at - right.at)[0] ?? null;

    return { remaining, replenishment, suppressedPercent };
  };

  const result = { session: average("session"), weekly: average("weekly") };
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
