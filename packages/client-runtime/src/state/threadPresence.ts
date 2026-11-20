import {
  ORCHESTRATION_V2_WS_METHODS,
  resolveEnvironmentMachineKind,
  type EnvironmentId,
  type SubscribeThreadPresenceInput,
  type ThreadId,
  type ThreadSpectators,
} from "@t3tools/contracts";
import * as Stream from "effect/Stream";
import type { Atom } from "effect/reactivity";

import type { EnvironmentPresentation } from "../connection/presentation.ts";
import type { EnvironmentRegistry } from "../connection/registry.ts";
import { createEnvironmentRpcSubscriptionAtomFamily } from "./runtime.ts";
import { reuseUnchanged } from "./serverConfigProjection.ts";

export function createThreadPresenceAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  return createEnvironmentRpcSubscriptionAtomFamily(runtime, {
    label: "thread-presence",
    tag: ORCHESTRATION_V2_WS_METHODS.subscribeThreadPresence,
    idleTtlMs: 0,
    transform: (stream) => Stream.concat(Stream.succeed<ThreadSpectators>([]), stream),
  });
}

export function createThreadPresenceOverviewAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  return createEnvironmentRpcSubscriptionAtomFamily(runtime, {
    label: "thread-presence-overview",
    tag: ORCHESTRATION_V2_WS_METHODS.subscribeThreadPresenceOverview,
    idleTtlMs: 0,
    transform: (stream) =>
      stream.pipe(
        Stream.map((snapshot) =>
          Object.fromEntries(snapshot.map(({ threadId, spectators }) => [threadId, spectators])),
        ),
        Stream.scan((): Readonly<Record<string, ThreadSpectators>> => ({}), reuseUnchanged),
      ),
  });
}

export function threadPresenceOverviewTarget(
  environmentId: EnvironmentId,
  environments: ReadonlyMap<EnvironmentId, EnvironmentPresentation>,
  active: boolean,
) {
  const destination = environments.get(environmentId);
  return active &&
    destination?.connection.phase === "connected" &&
    destination.serverConfig?.environment.capabilities.threadPresenceOverview === true
    ? { environmentId, input: {} }
    : null;
}

export function threadPresenceTarget(
  environmentId: EnvironmentId,
  threadId: ThreadId | null,
  environments: ReadonlyMap<EnvironmentId, EnvironmentPresentation>,
  active: boolean,
) {
  const destination = environments.get(environmentId);
  if (
    !active ||
    threadId === null ||
    destination?.connection.phase !== "connected" ||
    destination.serverConfig?.environment.capabilities.threadPresence !== true
  ) {
    return null;
  }
  return { environmentId, input: threadPresenceInput(threadId, environments) };
}

export function threadPresenceInput(
  threadId: ThreadId,
  environments: ReadonlyMap<EnvironmentId, EnvironmentPresentation>,
): SubscribeThreadPresenceInput {
  for (const [environmentId, { entry, serverConfig }] of environments) {
    if (entry.target._tag !== "PrimaryConnectionTarget" || serverConfig === null) continue;
    return {
      threadId,
      spectator: {
        environmentId,
        label: serverConfig.environment.label.trim().slice(0, 120),
        machine: resolveEnvironmentMachineKind(serverConfig),
      },
    };
  }
  // Browser-only and mobile clients do not necessarily own an environment identity.
  return { threadId };
}

export function presentThreadSpectators(
  spectators: ThreadSpectators,
  environments: ReadonlyMap<EnvironmentId, EnvironmentPresentation>,
): ThreadSpectators {
  return spectators.map((spectator) => {
    const known = environments.get(spectator.environmentId);
    return known === undefined
      ? spectator
      : {
          ...spectator,
          label:
            known.entry.target._tag === "PrimaryConnectionTarget" && known.serverConfig !== null
              ? known.serverConfig.environment.label
              : known.entry.target.label,
          machine:
            known.serverConfig === null
              ? spectator.machine
              : resolveEnvironmentMachineKind(known.serverConfig),
        };
  });
}
