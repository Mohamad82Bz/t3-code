import type {
  SubscribeThreadPresenceInput,
  ThreadId,
  ThreadPresenceSnapshot,
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

export class ThreadPresence extends Context.Service<
  ThreadPresence,
  {
    readonly subscribe: (input: SubscribeThreadPresenceInput) => Stream.Stream<ThreadSpectators>;
    readonly observe: () => Stream.Stream<ThreadPresenceSnapshot>;
  }
>()("t3/orchestration-v2/ThreadPresence") {}

const make = Effect.gen(function* () {
  const mutex = yield* Semaphore.make(1);
  const snapshot = yield* SubscriptionRef.make<ThreadPresenceSnapshot>([]);
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
    if (Equal.equals(yield* SubscriptionRef.get(entry.spectators), next)) return;
    yield* SubscriptionRef.set(entry.spectators, next);
    const all: Array<ThreadPresenceSnapshot[number]> = [];
    for (const [threadId, thread] of threads) {
      const spectators = yield* SubscriptionRef.get(thread.spectators);
      if (spectators.length > 0) all.push({ threadId, spectators });
    }
    all.sort((a, b) => a.threadId.localeCompare(b.threadId));
    yield* SubscriptionRef.set(snapshot, all);
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
              entry.views.set(viewId, input.spectator);
              yield* publish(entry);
              return entry;
            }),
          ),
          (entry) =>
            mutex.withPermits(1)(
              Effect.gen(function* () {
                entry.views.delete(viewId);
                yield* publish(entry);
                if (entry.views.size === 0) threads.delete(input.threadId);
              }),
            ),
        );
        return SubscriptionRef.changes(entry.spectators);
      }),
    );

  return ThreadPresence.of({ subscribe, observe: () => SubscriptionRef.changes(snapshot) });
});

export const layer = Layer.effect(ThreadPresence, make);
