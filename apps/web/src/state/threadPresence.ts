import {
  createThreadPresenceAtoms,
  presentThreadSpectators,
  threadPresenceTarget,
} from "@t3tools/client-runtime/state/thread-presence";
import type { EnvironmentId, ThreadId, ThreadSpectators } from "@t3tools/contracts";
import { useSyncExternalStore } from "react";

import { connectionAtomRuntime } from "../connection/runtime";
import { useEnvironments } from "./environments";
import { useEnvironmentQuery } from "./query";

const presence = createThreadPresenceAtoms(connectionAtomRuntime);
const EMPTY_SPECTATORS: ThreadSpectators = [];

function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

function isVisible() {
  return document.visibilityState === "visible";
}

export function useThreadSpectators(environmentId: EnvironmentId, threadId: ThreadId | null) {
  const visible = useSyncExternalStore(subscribeVisibility, isVisible);
  const { presentationById } = useEnvironments();
  const target = threadPresenceTarget(environmentId, threadId, presentationById, visible);
  const query = useEnvironmentQuery(target === null ? null : presence(target));
  return presentThreadSpectators(query.data ?? EMPTY_SPECTATORS, presentationById);
}
