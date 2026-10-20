interface CliproxyAccountIdentity {
  readonly id: string;
  readonly auth_index?: string | undefined;
  readonly email?: string | undefined;
  readonly account?: string | undefined;
  readonly label?: string | undefined;
  readonly name?: string | undefined;
  readonly comment?: string | undefined;
  readonly note?: string | undefined;
  readonly metadata?:
    | { readonly comment?: string | undefined; readonly note?: string | undefined }
    | undefined;
}

export function identifyCliproxyAccounts<T extends CliproxyAccountIdentity>(
  accounts: readonly T[],
) {
  const sorted = accounts
    .map((account) => {
      const label = String(account.email || account.account || account.label || account.name || "?")
        .replace(/^codex[-_]/i, "")
        .trim();
      const initial = Array.from(label)[0]?.toUpperCase() || "?";
      const commented = [
        account.comment,
        account.note,
        account.metadata?.comment,
        account.metadata?.note,
      ].some((value) => typeof value === "string" && value.trim().length > 0);
      return { ...account, initial, commented };
    })
    .sort(
      (a, b) =>
        Number(a.commented) - Number(b.commented) ||
        a.initial.localeCompare(b.initial) ||
        (a.auth_index ?? a.id).localeCompare(b.auth_index ?? b.id),
    );
  const counts = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const account of sorted) counts.set(account.initial, (counts.get(account.initial) ?? 0) + 1);
  return sorted.map((account) => {
    const index = (seen.get(account.initial) ?? 0) + 1;
    seen.set(account.initial, index);
    return {
      ...account,
      identifier: counts.get(account.initial)! > 1 ? `${account.initial}${index}` : account.initial,
    };
  });
}
