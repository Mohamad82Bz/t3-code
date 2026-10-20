import { useIsFocused } from "@react-navigation/native";
import {
  createThreadPresenceAtoms,
  presentThreadSpectators,
  threadPresenceTarget,
} from "@t3tools/client-runtime/state/thread-presence";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useSyncExternalStore } from "react";
import { AppState, View } from "react-native";

import { EnvironmentMachineSymbol } from "../../components/EnvironmentMachineSymbol";
import { AppText } from "../../components/ui/AppText";
import { connectionAtomRuntime } from "../../connection/runtime";
import { useEnvironments } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";

const presence = createThreadPresenceAtoms(connectionAtomRuntime);

function subscribeAppState(onChange: () => void) {
  const subscription = AppState.addEventListener("change", onChange);
  return () => subscription.remove();
}

function isAppActive() {
  return AppState.currentState === "active";
}

export function ComposerSpectators({
  environmentId,
  threadId,
}: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}) {
  const focused = useIsFocused();
  const active = useSyncExternalStore(subscribeAppState, isAppActive);
  const { presentationById } = useEnvironments();
  const target = threadPresenceTarget(environmentId, threadId, presentationById, focused && active);
  const query = useEnvironmentQuery(target === null ? null : presence(target));
  const spectators = presentThreadSpectators(query.data ?? [], presentationById);
  const first = spectators[0];
  if (first === undefined) return null;
  return (
    <View
      accessible
      accessibilityLabel={`Spectating: ${spectators.map((spectator) => spectator.label).join(", ")}`}
      className="mx-2 max-w-28 shrink flex-row items-center gap-1 rounded-md border border-border bg-foreground/5 px-2 py-1"
    >
      <EnvironmentMachineSymbol
        kind={first.machine}
        size={12}
        tintColorClassName="text-foreground-muted"
      />
      <AppText numberOfLines={1} className="shrink text-xs text-foreground-muted">
        {first.label}
      </AppText>
      {spectators.length > 1 ? (
        <AppText className="text-xs text-foreground-muted">+{spectators.length - 1}</AppText>
      ) : null}
    </View>
  );
}
