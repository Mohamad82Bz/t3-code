import { WS_METHODS, type EnvironmentId } from "@t3tools/contracts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { AsyncResult, Atom } from "effect/reactivity";
import { connectionAtomRuntime } from "../connection/runtime";
import { serverEnvironment } from "./server";

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
