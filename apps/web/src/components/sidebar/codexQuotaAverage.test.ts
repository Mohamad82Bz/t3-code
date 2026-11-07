import { ProviderDriverKind, type UsageLimitSourceSnapshot } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { formatCodexQuotaReplenishment, resolveCodexQuotaAverage } from "./codexQuotaAverage";

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

describe("resolveCodexQuotaAverage", () => {
  it("averages Codex accounts and replenishment regardless of disabled status", () => {
    const result = resolveCodexQuotaAverage(
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

    expect(result?.session?.remaining).toBe(57);
    expect(result?.weekly?.remaining).toBe(53);
    expect(result?.session?.replenishment).toEqual({
      percent: 16.7,
      at: Date.parse("2026-11-03T01:00:00.000Z"),
    });
    expect(result?.weekly?.replenishment).toEqual({
      percent: 6.7,
      at: Date.parse("2026-11-03T01:00:00.000Z"),
    });
  });

  it("retains weekly exhaustion suppression when all accounts are disabled", () => {
    const result = resolveCodexQuotaAverage(
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

    expect(result?.session?.remaining).toBe(50);
    expect(result?.session?.suppressedPercent).toBe(30);
    expect(result?.session?.replenishment).toEqual({
      percent: 30,
      at: Date.parse("2026-11-04T00:00:00.000Z"),
    });
    expect(result?.weekly?.remaining).toBe(50);
    expect(result?.weekly?.suppressedPercent).toBe(0);
  });

  it("reports the nearest account replenishment", () => {
    const result = resolveCodexQuotaAverage(
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

    expect(result?.session?.remaining).toBe(63);
    expect(result?.session?.replenishment).toEqual({
      percent: 12.5,
      at: Date.parse("2026-11-03T00:21:00.000Z"),
    });
    expect(result?.weekly?.remaining).toBe(75);
    expect(result?.weekly?.replenishment).toEqual({
      percent: 12.5,
      at: Date.parse("2026-11-03T00:21:00.000Z"),
    });
    expect(formatCodexQuotaReplenishment(result!.session!.replenishment!, NOW)).toBe(
      "+12.5% in 21m",
    );
    expect(
      formatCodexQuotaReplenishment(
        { percent: 25, at: Date.parse("2026-11-06T02:00:00.000Z") },
        NOW,
      ),
    ).toBe("+25% in 74h");
  });
});
