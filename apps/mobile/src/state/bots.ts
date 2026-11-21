import { WS_METHODS, type EnvironmentId } from "@t3tools/contracts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { AsyncResult, Atom } from "effect/reactivity";
import { connectionAtomRuntime } from "../connection/runtime";
import { environmentServerConfigsAtom, serverEnvironment } from "./server";

const subscribe = createEnvironmentRpcSubscriptionAtomFamily(connectionAtomRuntime, {
  label: "environment-bots",
  tag: WS_METHODS.botsSubscribe,
});

export const botsSnapshotAtom = Atom.family((environmentId: EnvironmentId) =>
  Atom.make((get) => {
    if (
      get(serverEnvironment.configValueAtom(environmentId))?.environment.capabilities.bots !== true
    ) {
      return AsyncResult.initial<never, never>();
    }
    return get(subscribe({ environmentId, input: {} }));
  }),
);

export const setBotsEnabled = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "bots:set-enabled",
  tag: WS_METHODS.botsSetEnabled,
});

export const mutateBot = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "bots:mutate",
  tag: WS_METHODS.botsMutate,
});

export const mobileBotProfilesAtom = Atom.make((get) => {
  const profiles = new Map<EnvironmentId, ReadonlyArray<import("@t3tools/contracts").BotProfile>>();
  for (const [environmentId, config] of get(environmentServerConfigsAtom)) {
    if (config.environment.capabilities.bots !== true) continue;
    const snapshot = AsyncResult.getOrElse(get(botsSnapshotAtom(environmentId)), () => null);
    if (snapshot?.enabled) profiles.set(environmentId, snapshot.bots);
  }
  return profiles;
});

export const drawBotAvatar = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "bots:draw-avatar",
  tag: WS_METHODS.botsDrawAvatar,
});
