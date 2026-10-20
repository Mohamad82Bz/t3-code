import type {
  SubscribeThreadPresenceInput,
  ThreadId,
  ThreadSpectator,
  ThreadSpectators,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Equal from "effect/Equal";
import * as Layer from "effect/Layer";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";

import * as ServerEnvironment from "../environment/ServerEnvironment.ts";

export class ThreadPresence extends Context.Service<
  ThreadPresence,
  {
    readonly subscribe: (input: SubscribeThreadPresenceInput) => Stream.Stream<ThreadSpectators>;
  }
>()("t3/orchestration-v2/ThreadPresence") {}

const make = Effect.gen(function* () {
  const environment = yield* ServerEnvironment.ServerEnvironment;
  const hostId = yield* environment.getEnvironmentId;
  const mutex = yield* Semaphore.make(1);
  const threads = new Map<
    ThreadId,
    {
      readonly views: Map<symbol, ThreadSpectator | undefined>;
      readonly spectators: SubscriptionRef.SubscriptionRef<ThreadSpectators>;
    }
  >();

  const publish = Effect.fnUntraced(function* (entry: NonNullable<ReturnType<typeof threads.get>>) {
    const byEnvironment = new Map<ThreadSpectator["environmentId"], ThreadSpectator>();
    for (const spectator of entry.views.values()) {
      if (spectator !== undefined) byEnvironment.set(spectator.environmentId, spectator);
    }
    const next = [...byEnvironment.values()].sort((a, b) =>
      a.environmentId.localeCompare(b.environmentId),
    );
    if (!Equal.equals(yield* SubscriptionRef.get(entry.spectators), next)) {
      yield* SubscriptionRef.set(entry.spectators, next);
    }
  });

  const subscribe = (input: SubscribeThreadPresenceInput) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const viewId = Symbol();
        const entry = yield* Effect.acquireRelease(
          mutex.withPermits(1)(
            Effect.gen(function* () {
              let entry = threads.get(input.threadId);
              if (entry === undefined) {
                entry = {
                  views: new Map(),
                  spectators: yield* SubscriptionRef.make<ThreadSpectators>([]),
                };
                threads.set(input.threadId, entry);
              }
              entry.views.set(
                viewId,
                input.spectator?.environmentId === hostId ? undefined : input.spectator,
              );
              yield* publish(entry);
              return entry;
            }),
          ),
          (entry) =>
            mutex.withPermits(1)(
              Effect.gen(function* () {
                entry.views.delete(viewId);
                if (entry.views.size === 0) threads.delete(input.threadId);
                else yield* publish(entry);
              }),
            ),
        );
        return SubscriptionRef.changes(entry.spectators);
      }),
    );

  return ThreadPresence.of({ subscribe });
});

export const layer = Layer.effect(ThreadPresence, make);
