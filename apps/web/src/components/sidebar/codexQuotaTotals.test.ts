import {
  EnvironmentId,
  ProviderDriverKind,
  type UsageLimitSourceSnapshot,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  formatCodexQuotaReplenishment,
  resolveCodexQuotaTotals,
  resolveEnvironmentCodexQuotaTotals,
} from "./codexQuotaTotals";

const NOW = Date.parse("2026-11-03T00:00:00.000Z");

function account(
  id: string,
  sessionUsed: number,
  weeklyUsed: number,
  resetsAt: { session: string; weekly: string },
  disabled = false,
): UsageLimitSourceSnapshot["accounts"][number] {
  return {
    id,
    driver: ProviderDriverKind.make("codex"),
    identifier: id,
    ...(disabled ? { disabled: true } : {}),
    usageLimits: {
      checkedAt: "2026-11-03T00:00:00.000Z",
      windows: [
        {
          id: `${id}-session`,
          kind: "session",
          label: "Session",
          usedPercent: sessionUsed,
          resetsAt: resetsAt.session,
        },
        {
          id: `${id}-weekly`,
          kind: "weekly",
          label: "Weekly",
          usedPercent: weeklyUsed,
          resetsAt: resetsAt.weekly,
        },
      ],
    },
  };
}

function source(
  accounts: readonly UsageLimitSourceSnapshot["accounts"][number][],
): UsageLimitSourceSnapshot {
  return {
    id: "test-source" as UsageLimitSourceSnapshot["id"],
    kind: "cliproxy",
    label: "Test source",
    checkedAt: "2026-11-03T00:00:00.000Z",
    accounts,
  };
}

describe("resolveCodexQuotaTotals", () => {
  it("matches the current environment's cards without adding another environment's snapshots", () => {
    const local = EnvironmentId.make("local");
    const remote = EnvironmentId.make("remote");
    const resets = {
      session: "2026-11-03T02:00:00.000Z",
      weekly: "2026-11-04T00:00:00.000Z",
    };
    const accounts = [
      account("C1", 0, 100, resets, true),
      account("C2", 100, 48, resets, true),
      account("F", 1, 48, resets),
      account("R", 0, 100, resets, true),
      account("S", 11, 43, resets),
      account("V", 0, 100, resets, true),
      account("W", 0, 52, resets),
    ];
    const configs = new Map([
      [local, { usageLimitSources: [source(accounts)] }],
      [remote, { usageLimitSources: [source(accounts)] }],
    ]);

    const totals = resolveEnvironmentCodexQuotaTotals(configs, local, NOW);
    expect(totals?.session?.remaining).toBe(288);
    expect(totals?.weekly?.remaining).toBe(209);
    expect(totals?.session?.weeklyExhaustedCount).toBe(3);
    expect(resolveEnvironmentCodexQuotaTotals(configs, remote, NOW)).toEqual(totals);
    expect(
      resolveEnvironmentCodexQuotaTotals(configs, EnvironmentId.make("missing"), NOW),
    ).toBeNull();
    expect(resolveEnvironmentCodexQuotaTotals(configs, null, NOW)).toBeNull();
    expect(
      resolveEnvironmentCodexQuotaTotals(
        new Map([
          [local, { usageLimitSources: [] }],
          [remote, configs.get(remote)!],
        ]),
        local,
        NOW,
      ),
    ).toBeNull();
  });
  it("sums Codex accounts and replenishment regardless of disabled status", () => {
    const result = resolveCodexQuotaTotals(
      [
        source([
          account("enabled-a", 20, 40, {
            session: "2026-11-03T02:00:00.000Z",
            weekly: "2026-11-04T00:00:00.000Z",
          }),
          account("enabled-b", 60, 80, {
            session: "2026-11-03T03:00:00.000Z",
            weekly: "2026-11-05T00:00:00.000Z",
          }),
          account(
            "disabled",
            50,
            20,
            {
              session: "2026-11-03T01:00:00.000Z",
              weekly: "2026-11-03T01:00:00.000Z",
            },
            true,
          ),
        ]),
      ],
      NOW,
    );

    expect(result?.session?.remaining).toBe(170);
    expect(result?.weekly?.remaining).toBe(160);
    expect(result?.session?.replenishment).toEqual({
      percent: 50,
      at: Date.parse("2026-11-03T01:00:00.000Z"),
    });
    expect(result?.weekly?.replenishment).toEqual({
      percent: 20,
      at: Date.parse("2026-11-03T01:00:00.000Z"),
    });
  });

  it("counts weekly-exhausted accounts when all accounts are disabled", () => {
    const result = resolveCodexQuotaTotals(
      [
        source([
          account(
            "weekly-exhausted",
            40,
            100,
            {
              session: "2026-11-03T02:00:00.000Z",
              weekly: "2026-11-04T00:00:00.000Z",
            },
            true,
          ),
          account(
            "available",
            0,
            0,
            {
              session: "2026-11-03T03:00:00.000Z",
              weekly: "2026-11-05T00:00:00.000Z",
            },
            true,
          ),
        ]),
      ],
      NOW,
    );

    expect(result?.session?.remaining).toBe(100);
    expect(result?.session?.weeklyExhaustedCount).toBe(1);
    expect(result?.session?.replenishment).toEqual({
      percent: 60,
      at: Date.parse("2026-11-04T00:00:00.000Z"),
    });
    expect(result?.weekly?.remaining).toBe(100);
    expect(result?.weekly?.weeklyExhaustedCount).toBe(0);
  });

  it("sums five full quota accounts to 500%", () => {
    const result = resolveCodexQuotaTotals(
      [
        source(
          ["one", "two", "three", "four", "five"].map((id) =>
            account(id, 0, 0, {
              session: "2026-11-04T00:00:00.000Z",
              weekly: "2026-11-05T00:00:00.000Z",
            }),
          ),
        ),
      ],
      NOW,
    );

    expect(result?.session?.remaining).toBe(500);
    expect(result?.weekly?.remaining).toBe(500);
  });

  it("reports the nearest account replenishment", () => {
    const result = resolveCodexQuotaTotals(
      [
        source([
          account("first", 50, 50, {
            session: "2026-11-03T00:21:00.000Z",
            weekly: "2026-11-06T02:00:00.000Z",
          }),
          account("second", 100, 50, {
            session: "2026-11-06T02:00:00.000Z",
            weekly: "2026-11-03T00:21:00.000Z",
          }),
          account("third", 0, 0, {
            session: "2026-11-06T02:00:00.000Z",
            weekly: "2026-11-06T02:00:00.000Z",
          }),
          account("fourth", 0, 0, {
            session: "2026-11-06T02:00:00.000Z",
            weekly: "2026-11-06T02:00:00.000Z",
          }),
        ]),
      ],
      NOW,
    );

    expect(result?.session?.remaining).toBe(250);
    expect(result?.session?.replenishment).toEqual({
      percent: 50,
      at: Date.parse("2026-11-03T00:21:00.000Z"),
    });
    expect(result?.weekly?.remaining).toBe(300);
    expect(result?.weekly?.replenishment).toEqual({
      percent: 50,
      at: Date.parse("2026-11-03T00:21:00.000Z"),
    });
    expect(formatCodexQuotaReplenishment(result!.session!.replenishment!, NOW)).toBe("+50% in 21m");
    expect(
      formatCodexQuotaReplenishment(
        { percent: 25, at: Date.parse("2026-11-06T02:00:00.000Z") },
        NOW,
      ),
    ).toBe("+25% in 74h");
  });
});
