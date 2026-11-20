import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { View } from "react-native";

import { EnvironmentMachineSymbol } from "../../components/EnvironmentMachineSymbol";
import { AppText } from "../../components/ui/AppText";
import { useSidebarThreadSpectators } from "../../state/threadPresence";

export function SidebarThreadSpectators({
  environmentId,
  threadId,
}: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}) {
  const spectators = useSidebarThreadSpectators(environmentId, threadId);
  const first = spectators[0];
  if (first === undefined) return null;
  return (
    <View
      accessible
      accessibilityLabel={`Viewing this session: ${spectators.map((spectator) => spectator.label).join(", ")}`}
      className="max-w-28 shrink-0 flex-row items-center gap-1 rounded border border-border bg-foreground/5 px-1"
    >
      <EnvironmentMachineSymbol
        kind={first.machine}
        size={11}
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
