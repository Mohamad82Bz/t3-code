import { describe, expect, it } from "vite-plus/test";
import { identifyCliproxyAccounts } from "./cliproxyAccounts.ts";

describe("CPA account identifiers", () => {
  it("matches the mod's stable first-letter ordering, with commented credentials last", () => {
    const accounts = [
      { id: "z", email: "alice@example.com", comment: "reserved" },
      { id: "b", email: "robin@example.com" },
      { id: "a", email: "riley@example.com", disabled: true },
      { id: "c", name: "codex-frank.json", metadata: { note: "  " } },
      { id: "d", account: "tom", metadata: { comment: "backup" } },
    ];
    const identified = identifyCliproxyAccounts(accounts);
    expect(
      identified.map((account) => [account.id, account.identifier, account.commented]),
    ).toEqual([
      ["c", "F", false],
      ["a", "R1", false],
      ["b", "R2", false],
      ["z", "A", true],
      ["d", "T", true],
    ]);
    expect(identifyCliproxyAccounts(accounts.toReversed())).toEqual(identified);
  });
  it("uses auth indexes to disambiguate matching initials, not runtime names or quota", () => {
    const accounts = [
      { id: "aaa", auth_index: "z", email: "alex@example.com" },
      { id: "zzz", auth_index: "a", email: "alice@example.com" },
    ];
    expect(
      identifyCliproxyAccounts(accounts).map((account) => [account.id, account.identifier]),
    ).toEqual([
      ["zzz", "A1"],
      ["aaa", "A2"],
    ]);
  });
});
