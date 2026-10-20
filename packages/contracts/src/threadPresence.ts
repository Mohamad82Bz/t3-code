import * as Schema from "effect/Schema";

import { EnvironmentId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { EnvironmentMachineKind } from "./environment.ts";

// Display identity is client-supplied, not an authenticated user or a permission grant.
export const ThreadSpectator = Schema.Struct({
  environmentId: EnvironmentId,
  label: TrimmedNonEmptyString.check(Schema.isMaxLength(120)),
  machine: EnvironmentMachineKind,
});
export type ThreadSpectator = typeof ThreadSpectator.Type;

export const SubscribeThreadPresenceInput = Schema.Struct({
  threadId: ThreadId,
  spectator: Schema.optionalKey(ThreadSpectator),
});
export type SubscribeThreadPresenceInput = typeof SubscribeThreadPresenceInput.Type;

export const ThreadSpectators = Schema.Array(ThreadSpectator);
export type ThreadSpectators = typeof ThreadSpectators.Type;
