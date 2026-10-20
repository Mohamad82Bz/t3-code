import { assert, it } from "@effect/vitest";
import {
  EnvironmentId,
  ThreadId,
  AuthOrchestrationReadScope,
  ORCHESTRATION_V2_WS_METHODS,
  WsRpcGroup,
  type SubscribeThreadPresenceInput,
  type ThreadSpectator,
  type ThreadSpectators,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import * as RpcTest from "effect/rpc/RpcTest";

import * as RpcAuthorization from "../auth/RpcAuthorization.ts";

import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as ThreadPresence from "./ThreadPresence.ts";

const HOST = EnvironmentId.make("mamd");
const THREAD = ThreadId.make("thread-one");
const OTHER_THREAD = ThreadId.make("thread-two");
const FRIEND: ThreadSpectator = {
  environmentId: EnvironmentId.make("syrent"),
  label: "syrent",
  machine: "linux",
};
const layer = ThreadPresence.layer.pipe(
  Layer.provide(
    Layer.succeed(ServerEnvironment.ServerEnvironment, {
      getEnvironmentId: Effect.succeed(HOST),
      getDescriptor: Effect.die("Presence does not need the environment descriptor"),
    }),
  ),
);

const openView = Effect.fnUntraced(function* (input: SubscribeThreadPresenceInput) {
  const presence = yield* ThreadPresence.ThreadPresence;
  const scope = yield* Scope.make();
  yield* Effect.addFinalizer(() => Scope.close(scope, Exit.void));
  const updates = yield* Queue.unbounded<ThreadSpectators>();
  yield* presence.subscribe(input).pipe(
    Stream.runForEach((spectators) => Queue.offer(updates, spectators)),
    Effect.forkIn(scope),
  );
  const initial = yield* Queue.take(updates);
  return { initial, updates, close: Scope.close(scope, Exit.void) };
});

it.effect("excludes the host and broadcasts a visitor to both the host and the visitor", () =>
  Effect.gen(function* () {
    const host = yield* openView({
      threadId: THREAD,
      spectator: { environmentId: HOST, label: "Mamd", machine: "desktop" },
    });
    assert.deepEqual(host.initial, []);
    const friend = yield* openView({ threadId: THREAD, spectator: FRIEND });
    assert.deepEqual(friend.initial, [FRIEND]);
    assert.deepEqual(yield* Queue.take(host.updates), [FRIEND]);
    yield* friend.close;
    assert.deepEqual(yield* Queue.take(host.updates), []);
  }).pipe(Effect.scoped, Effect.provide(layer)),
);

it.effect("deduplicates windows and keeps a visitor until their last view disconnects", () =>
  Effect.gen(function* () {
    const host = yield* openView({ threadId: THREAD });
    const first = yield* openView({ threadId: THREAD, spectator: FRIEND });
    assert.deepEqual(yield* Queue.take(host.updates), [FRIEND]);
    const second = yield* openView({ threadId: THREAD, spectator: { ...FRIEND } });
    assert.deepEqual(second.initial, [FRIEND]);
    assert.equal(yield* Queue.size(host.updates), 0);
    yield* first.close;
    assert.equal(yield* Queue.size(host.updates), 0);
    yield* second.close;
    assert.deepEqual(yield* Queue.take(host.updates), []);
  }).pipe(Effect.scoped, Effect.provide(layer)),
);

it.effect("isolates threads and removes presence when navigating or reconnecting", () =>
  Effect.gen(function* () {
    const host = yield* openView({ threadId: THREAD });
    const otherHost = yield* openView({ threadId: OTHER_THREAD });
    const friend = yield* openView({ threadId: THREAD, spectator: FRIEND });
    assert.deepEqual(yield* Queue.take(host.updates), [FRIEND]);
    assert.equal(yield* Queue.size(otherHost.updates), 0);
    yield* friend.close;
    assert.deepEqual(yield* Queue.take(host.updates), []);
    const moved = yield* openView({ threadId: OTHER_THREAD, spectator: FRIEND });
    assert.deepEqual(moved.initial, [FRIEND]);
    assert.deepEqual(yield* Queue.take(otherHost.updates), [FRIEND]);
    assert.equal(yield* Queue.size(host.updates), 0);
    yield* moved.close;
    assert.deepEqual(yield* Queue.take(otherHost.updates), []);
    yield* host.close;
    const reopened = yield* openView({ threadId: THREAD });
    assert.deepEqual(reopened.initial, []);
  }).pipe(Effect.scoped, Effect.provide(layer)),
);

it.effect("sends a complete snapshot to late viewers and publishes identity changes", () =>
  Effect.gen(function* () {
    const friend = yield* openView({ threadId: THREAD, spectator: FRIEND });
    const another: ThreadSpectator = {
      environmentId: EnvironmentId.make("another"),
      label: "Another machine",
      machine: "laptop",
    };
    yield* openView({ threadId: THREAD, spectator: another });
    assert.deepEqual(yield* Queue.take(friend.updates), [another, FRIEND]);
    const host = yield* openView({ threadId: THREAD });
    assert.deepEqual(host.initial, [another, FRIEND]);
    const renamed = { ...FRIEND, label: "New name", machine: "desktop" as const };
    const updated = yield* openView({ threadId: THREAD, spectator: renamed });
    assert.deepEqual(updated.initial, [another, renamed]);
    assert.deepEqual(yield* Queue.take(host.updates), [another, renamed]);
    yield* updated.close;
    assert.deepEqual(yield* Queue.take(host.updates), [another, FRIEND]);
  }).pipe(Effect.scoped, Effect.provide(layer)),
);

it.effect("streams presence through the read-only RPC and cleans up a cancelled visitor", () =>
  Effect.gen(function* () {
    const presence = yield* ThreadPresence.ThreadPresence;
    const method = ORCHESTRATION_V2_WS_METHODS.subscribeThreadPresence;
    const group = WsRpcGroup.omit(
      ...[...WsRpcGroup.requests.keys()].filter(
        (tag): tag is Exclude<keyof typeof RpcAuthorization.RPC_REQUIRED_SCOPES, typeof method> =>
          tag !== method,
      ),
    );
    const rpcLayer = Layer.mergeAll(
      group.toLayerHandler(method, (input) => presence.subscribe(input)),
      RpcAuthorization.layer([AuthOrchestrationReadScope]),
    );
    const host = yield* RpcTest.makeClient(group).pipe(Effect.provide(rpcLayer));
    const visitor = yield* RpcTest.makeClient(group).pipe(Effect.provide(rpcLayer));
    const received = yield* Queue.unbounded<ThreadSpectators>();
    yield* host[method]({ threadId: THREAD }).pipe(
      Stream.runForEach((snapshot) => Queue.offer(received, snapshot)),
      Effect.forkScoped,
    );
    assert.deepEqual(yield* Queue.take(received), []);
    const visitorScope = yield* Scope.make();
    yield* Effect.addFinalizer(() => Scope.close(visitorScope, Exit.void));
    const visitorReceived = yield* Queue.unbounded<ThreadSpectators>();
    yield* visitor[method]({ threadId: THREAD, spectator: FRIEND }).pipe(
      Stream.runForEach((snapshot) => Queue.offer(visitorReceived, snapshot)),
      Effect.forkIn(visitorScope),
    );
    assert.deepEqual(yield* Queue.take(visitorReceived), [FRIEND]);
    assert.deepEqual(yield* Queue.take(received), [FRIEND]);
    yield* Scope.close(visitorScope, Exit.void);
    assert.deepEqual(yield* Queue.take(received), []);
  }).pipe(Effect.scoped, Effect.provide(layer)),
);
