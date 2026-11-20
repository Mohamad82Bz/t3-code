import {
  createThreadPresenceOverviewAtoms,
  presentThreadSpectators,
  threadPresenceOverviewTarget,
} from "@t3tools/client-runtime/state/thread-presence";
import type { EnvironmentId, ThreadId, ThreadSpectators } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/reactivity";
import { useMemo, useSyncExternalStore } from "react";
import { AppState } from "react-native";

import { connectionAtomRuntime } from "../connection/runtime";
import { useEnvironments } from "./environments";
import { useEnvironmentQuerySelector } from "./query";

const overview = createThreadPresenceOverviewAtoms(connectionAtomRuntime);
const EMPTY_SPECTATORS: ThreadSpectators = [];

function subscribeAppState(onChange: () => void) {
  const subscription = AppState.addEventListener("change", onChange);
  return () => subscription.remove();
}

function isAppActive() {
  return AppState.currentState === "active";
}

export function useSidebarThreadSpectators(environmentId: EnvironmentId, threadId: ThreadId) {
  const active = useSyncExternalStore(subscribeAppState, isAppActive);
  const { presentationById } = useEnvironments();
  const target = threadPresenceOverviewTarget(environmentId, presentationById, active);
  const select = useMemo(
    () => (result: AsyncResult.AsyncResult<Readonly<Record<string, ThreadSpectators>>, unknown>) =>
      Option.getOrUndefined(AsyncResult.value(result))?.[threadId] ?? EMPTY_SPECTATORS,
    [threadId],
  );
  const spectators = useEnvironmentQuerySelector(target === null ? null : overview(target), select);
  return presentThreadSpectators(spectators, presentationById);
}
