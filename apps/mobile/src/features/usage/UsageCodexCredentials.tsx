import { useAtomValue } from "@effect/atom-react";
import {
  type EnvironmentId,
  type UsageLimitSourceAccount,
  type UsageLimitSourceId,
  type UsageLimitSourceAccountActionInput,
} from "@t3tools/contracts";
import {
  collectCodexCredentialSources,
  formatResetsIn,
  remainingPercent,
  type LimitPresentations,
} from "@t3tools/shared/usageLimits";
import { useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import { ProviderIcon } from "../../components/ProviderIcon";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { ResetCredits } from "./UsageLimitsSection";

function CredentialCard({
  account,
  environmentId,
  sourceId,
  now,
}: {
  readonly account: UsageLimitSourceAccount;
  readonly environmentId: EnvironmentId;
  readonly sourceId: UsageLimitSourceId;
  readonly now: number;
}) {
  const command = serverEnvironment.usageLimitSourceAccountAction;
  const permitted = useAtomValue(command.permissionAtom(environmentId));
  const run = useAtomCommand(command, { reportFailure: false });
  const pending = useRef(false);
  const [busy, setBusy] = useState<"toggle" | "startQuota" | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const available = permitted && account.canManage && account.authIndex;
  const act = async (action: UsageLimitSourceAccountActionInput["action"]) => {
    if (pending.current || !available) return;
    pending.current = true;
    setBusy(action.type);
    setStatus(null);
    const result = await run({
      environmentId,
      input: { sourceId, accountId: account.id, authIndex: account.authIndex!, action },
    });
    pending.current = false;
    setBusy(null);
    setStatus(
      result._tag === "Success"
        ? result.value.message
        : "error" in result.cause && result.cause.error instanceof Error
          ? result.cause.error.message
          : "Could not update the credential. Refresh to check its state.",
    );
  };
  return (
    <View className="w-64 gap-3 rounded-2xl border border-border-subtle bg-grouped-card p-4">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Account ${account.identifier}, ${account.disabled ? "disabled, enable" : "enabled, disable"}`}
        accessibilityState={{ disabled: Boolean(busy) || !available }}
        disabled={Boolean(busy) || !available}
        onPress={() => void act({ type: "toggle", expectedDisabled: account.disabled ?? false })}
        className="gap-4 active:opacity-60"
      >
        <View className="flex-row items-center justify-between gap-2">
          <Text className="text-xl font-t3-bold text-foreground">{account.identifier}</Text>
          <Text className="text-xs text-foreground-muted">
            {busy === "toggle" ? "Updating…" : account.disabled ? "Disabled" : "Enabled"}
          </Text>
        </View>
        {(["session", "weekly"] as const).map((kind) => {
          const window = account.usageLimits.windows.find((window) => window.kind === kind);
          return (
            <View key={kind} className="gap-1">
              <View className="flex-row justify-between gap-2">
                <Text className="text-sm text-foreground-muted">
                  {kind === "session" ? "Session" : "Weekly"}
                </Text>
                <Text className="text-sm font-t3-medium tabular-nums text-foreground">
                  {window ? `${remainingPercent(window)}% left` : "Unavailable"}
                </Text>
              </View>
              <Text className="text-xs tabular-nums text-foreground-tertiary">
                {window
                  ? (formatResetsIn(window, now) ?? "Reset time unavailable")
                  : "No quota data"}
              </Text>
            </View>
          );
        })}
      </Pressable>
      {account.commented ? (
        <Text className="text-xs text-foreground-tertiary">Has comment</Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Start Quota for account ${account.identifier}`}
        accessibilityState={{ disabled: Boolean(busy) || !available }}
        disabled={Boolean(busy) || !available}
        onPress={() => void act({ type: "startQuota" })}
        className="min-h-11 items-center justify-center rounded-lg bg-subtle px-3 active:opacity-60 disabled:opacity-50"
      >
        <Text className="text-sm font-t3-medium text-foreground">
          {busy === "startQuota" ? "Starting quota…" : "Start Quota"}
        </Text>
      </Pressable>
      {!account.disabled && account.usageLimits.resetCredits?.nextCreditId ? (
        <ResetCredits
          environmentId={environmentId}
          input={{
            sourceId,
            accountId: account.id,
            creditId: account.usageLimits.resetCredits.nextCreditId,
          }}
          credits={account.usageLimits.resetCredits}
          now={now}
        />
      ) : null}
      {status ? (
        <Text accessibilityLiveRegion="polite" className="text-xs text-foreground-muted">
          {status}
        </Text>
      ) : null}
      {account.usageLimits.unavailable ? (
        <Text className="text-xs text-foreground-muted">
          {account.usageLimits.unavailable.message ?? "Quota unavailable."}
        </Text>
      ) : null}
    </View>
  );
}

export function UsageCodexCredentials({
  presentations,
  now,
}: {
  readonly presentations: LimitPresentations;
  readonly now: number;
}) {
  return collectCodexCredentialSources(presentations).map(
    ({ environmentId, environmentLabel, source, accounts }) => (
      <View key={`${environmentId}:${source.id}`} className="gap-3">
        <View className="flex-row items-center gap-2">
          <ProviderIcon provider="codex" size={18} />
          <Text className="text-base font-t3-medium text-foreground">
            Codex · {presentations.size > 1 ? `${environmentLabel} · ` : ""}
            {source.label}
          </Text>
        </View>
        <Text className="text-xs text-foreground-muted">
          Tap a card to enable or disable its CPA credential. Start Quota sends one small request,
          then restores the original state.
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row items-start gap-3">
            {accounts.map((account) => (
              <CredentialCard
                key={account.id}
                account={account}
                environmentId={environmentId}
                sourceId={source.id}
                now={now}
              />
            ))}
          </View>
        </ScrollView>
      </View>
    ),
  );
}
