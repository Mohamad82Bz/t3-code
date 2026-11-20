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
  type ThreadPresenceSnapshot,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import * as RpcTest from "effect/rpc/RpcTest";

import * as RpcAuthorization from "../auth/RpcAuthorization.ts";

import * as ThreadPresence from "./ThreadPresence.ts";

const HOST = EnvironmentId.make("mamd");
const THREAD = ThreadId.make("thread-one");
const OTHER_THREAD = ThreadId.make("thread-two");
const FRIEND: ThreadSpectator = {
  environmentId: EnvironmentId.make("syrent"),
  label: "syrent",
  machine: "linux",
};
const layer = ThreadPresence.layer;
const OWNER: ThreadSpectator = { environmentId: HOST, label: "Mamd", machine: "desktop" };

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

it.effect("includes the owner and broadcasts every viewer to themselves and others", () =>
  Effect.gen(function* () {
    const host = yield* openView({ threadId: THREAD, spectator: OWNER });
    assert.deepEqual(host.initial, [OWNER]);
    const friend = yield* openView({ threadId: THREAD, spectator: FRIEND });
    assert.deepEqual(friend.initial, [OWNER, FRIEND]);
    assert.deepEqual(yield* Queue.take(host.updates), [OWNER, FRIEND]);
    yield* friend.close;
    assert.deepEqual(yield* Queue.take(host.updates), [OWNER]);
  }).pipe(Effect.scoped, Effect.provide(layer)),
);

const openOverview = Effect.fnUntraced(function* () {
  const presence = yield* ThreadPresence.ThreadPresence;
  const updates = yield* Queue.unbounded<ThreadPresenceSnapshot>();
  const fiber = yield* presence.observe().pipe(
    Stream.runForEach((snapshot) => Queue.offer(updates, snapshot)),
    Effect.forkScoped,
  );
  const initial = yield* Queue.take(updates);
  return { initial, updates, fiber };
});

it.effect("observes all sessions without joining them, including the owner's own sessions", () =>
  Effect.gen(function* () {
    const sidebar = yield* openOverview();
    assert.deepEqual(sidebar.initial, []);
    const owner = yield* openView({ threadId: THREAD, spectator: OWNER });
    assert.deepEqual(yield* Queue.take(sidebar.updates), [
      { threadId: THREAD, spectators: [OWNER] },
    ]);
    const friend = yield* openView({ threadId: OTHER_THREAD, spectator: FRIEND });
    const both = [
      { threadId: THREAD, spectators: [OWNER] },
      { threadId: OTHER_THREAD, spectators: [FRIEND] },
    ];
    assert.deepEqual(yield* Queue.take(sidebar.updates), both);
    const lateSidebar = yield* openOverview();
    assert.deepEqual(lateSidebar.initial, both);
    assert.equal(yield* Queue.size(owner.updates), 0);
    assert.equal(yield* Queue.size(sidebar.updates), 0);
    const duplicate = yield* openView({ threadId: OTHER_THREAD, spectator: FRIEND });
    assert.equal(yield* Queue.size(sidebar.updates), 0);
    yield* friend.close;
    assert.equal(yield* Queue.size(sidebar.updates), 0);
    yield* duplicate.close;
    assert.deepEqual(yield* Queue.take(sidebar.updates), [
      { threadId: THREAD, spectators: [OWNER] },
    ]);
    const moved = yield* openView({ threadId: THREAD, spectator: FRIEND });
    assert.deepEqual(yield* Queue.take(sidebar.updates), [
      { threadId: THREAD, spectators: [OWNER, FRIEND] },
    ]);
    yield* owner.close;
    assert.deepEqual(yield* Queue.take(sidebar.updates), [
      { threadId: THREAD, spectators: [FRIEND] },
    ]);
    yield* moved.close;
    assert.deepEqual(yield* Queue.take(sidebar.updates), []);
    assert.deepEqual((yield* openOverview()).initial, []);
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
    const overviewMethod = ORCHESTRATION_V2_WS_METHODS.subscribeThreadPresenceOverview;
    const group = WsRpcGroup.omit(
      ...[...WsRpcGroup.requests.keys()].filter(
        (
          tag,
        ): tag is Exclude<
          keyof typeof RpcAuthorization.RPC_REQUIRED_SCOPES,
          typeof method | typeof overviewMethod
        > => tag !== method && tag !== overviewMethod,
      ),
    );
    const rpcLayer = Layer.mergeAll(
      group.toLayerHandler(method, (input) => presence.subscribe(input)),
      group.toLayerHandler(overviewMethod, () => presence.observe()),
      RpcAuthorization.layer([AuthOrchestrationReadScope]),
    );
    const host = yield* RpcTest.makeClient(group).pipe(Effect.provide(rpcLayer));
    const visitor = yield* RpcTest.makeClient(group).pipe(Effect.provide(rpcLayer));
    const overviewReceived = yield* Queue.unbounded<ThreadPresenceSnapshot>();
    yield* host[overviewMethod]({}).pipe(
      Stream.runForEach((snapshot) => Queue.offer(overviewReceived, snapshot)),
      Effect.forkScoped,
    );
    assert.deepEqual(yield* Queue.take(overviewReceived), []);
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
    assert.deepEqual(yield* Queue.take(overviewReceived), [
      { threadId: THREAD, spectators: [FRIEND] },
    ]);
    yield* Scope.close(visitorScope, Exit.void);
    assert.deepEqual(yield* Queue.take(received), []);
    assert.deepEqual(yield* Queue.take(overviewReceived), []);
  }).pipe(Effect.scoped, Effect.provide(layer)),
);
