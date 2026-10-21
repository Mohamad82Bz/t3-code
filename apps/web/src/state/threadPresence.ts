import {
  createThreadPresenceAtoms,
  createThreadPresenceOverviewAtoms,
  threadPresenceOverviewTarget,
  presentThreadSpectators,
  threadPresenceTarget,
} from "@t3tools/client-runtime/state/thread-presence";
import type { EnvironmentId, ThreadId, ThreadSpectators } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import * as Option from "effect/Option";
import { useSyncExternalStore } from "react";

import { connectionAtomRuntime } from "../connection/runtime";
import { useEnvironments } from "./environments";
import { useEnvironmentQuery, useEnvironmentQuerySelector } from "./query";

const presence = createThreadPresenceAtoms(connectionAtomRuntime);
const overview = createThreadPresenceOverviewAtoms(connectionAtomRuntime);
const EMPTY_SPECTATORS: ThreadSpectators = [];

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

function isVisible() {
  return document.visibilityState === "visible";
}

export function useSidebarThreadSpectators(environmentId: EnvironmentId, threadId: ThreadId) {
  const visible = useSyncExternalStore(subscribeVisibility, isVisible);
  const { presentationById } = useEnvironments();
  const target = threadPresenceOverviewTarget(environmentId, presentationById, visible);
  const select = (
    result: AsyncResult.AsyncResult<Readonly<Record<string, ThreadSpectators>>, unknown>,
  ) => Option.getOrUndefined(AsyncResult.value(result))?.[threadId] ?? EMPTY_SPECTATORS;
  const spectators = useEnvironmentQuerySelector(target === null ? null : overview(target), select);
  return presentThreadSpectators(spectators, presentationById);
}

export function useThreadSpectators(environmentId: EnvironmentId, threadId: ThreadId | null) {
  const visible = useSyncExternalStore(subscribeVisibility, isVisible);
  const { presentationById } = useEnvironments();
  const target = threadPresenceTarget(environmentId, threadId, presentationById, visible);
  const query = useEnvironmentQuery(target === null ? null : presence(target));
  return presentThreadSpectators(query.data ?? EMPTY_SPECTATORS, presentationById);
}
