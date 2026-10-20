import { describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_SERVER_SETTINGS,
  EnvironmentId,
  SubscribeThreadPresenceInput,
  ThreadId,
  type EnvironmentMachineKind,
  type ThreadSpectator,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { BearerConnectionTarget, PrimaryConnectionTarget } from "../connection/model.ts";
import type {
  EnvironmentPresentation,
  EnvironmentServerConfig,
} from "../connection/presentation.ts";
import {
  presentThreadSpectators,
  threadPresenceInput,
  threadPresenceTarget,
} from "./threadPresence.ts";

const HOST = EnvironmentId.make("mamd");
const FRIEND = EnvironmentId.make("syrent");
const THREAD = ThreadId.make("thread");
const isPresenceInput = Schema.is(SubscribeThreadPresenceInput);

function environment(
  environmentId: EnvironmentId,
  primary: boolean,
  label: string,
  machine: EnvironmentMachineKind,
): EnvironmentPresentation {
  return {
    entry: {
      target: primary
        ? new PrimaryConnectionTarget({
            environmentId,
            label: "This machine",
            httpBaseUrl: "https://example.test",
            wsBaseUrl: "wss://example.test",
          })
        : new BearerConnectionTarget({ environmentId, label, connectionId: environmentId }),
      profile: Option.none(),
      enabled: true,
    },
    connection: { phase: "connected", error: null, traceId: null },
    serverConfig: {
      environment: {
        environmentId,
        label,
        platform: { os: "linux", arch: "x64", machine: "server" },
        serverVersion: "0.1.0",
        capabilities: { repositoryIdentity: true, threadPresence: true },
      },
      settings: { ...DEFAULT_SERVER_SETTINGS, environmentIcon: machine },
    } as EnvironmentServerConfig,
  };
}

const spectator: ThreadSpectator = {
  environmentId: FRIEND,
  label: "Remote name",
  machine: "server",
};

describe("thread spectator identity", () => {
  it("never creates a presence subscription for stock or explicitly unsupported servers", () => {
    const modern = environment(FRIEND, false, "syrent", "linux");
    expect(threadPresenceTarget(FRIEND, THREAD, new Map([[FRIEND, modern]]), true)).not.toBeNull();
    for (const capabilities of [
      { repositoryIdentity: true },
      { repositoryIdentity: true, threadPresence: false },
    ]) {
      const legacy = {
        ...modern,
        serverConfig:
          modern.serverConfig === null
            ? null
            : {
                ...modern.serverConfig,
                environment: { ...modern.serverConfig.environment, capabilities },
              },
      };
      expect(threadPresenceTarget(FRIEND, THREAD, new Map([[FRIEND, legacy]]), true)).toBeNull();
    }
  });

  it("does not subscribe for hidden views, drafts, disconnected or unknown destinations", () => {
    const modern = environment(FRIEND, false, "syrent", "linux");
    const environments = new Map([[FRIEND, modern]]);
    expect(threadPresenceTarget(FRIEND, THREAD, environments, false)).toBeNull();
    expect(threadPresenceTarget(FRIEND, null, environments, true)).toBeNull();
    expect(threadPresenceTarget(HOST, THREAD, environments, true)).toBeNull();
    expect(
      threadPresenceTarget(
        FRIEND,
        THREAD,
        new Map([
          [
            FRIEND,
            {
              ...modern,
              connection: { phase: "reconnecting", error: null, traceId: null },
            },
          ],
        ]),
        true,
      ),
    ).toBeNull();
  });

  it("announces the primary machine, never the destination being watched", () => {
    const environments = new Map([
      [FRIEND, environment(FRIEND, false, "syrent", "linux")],
      [HOST, environment(HOST, true, "Mamd", "desktop")],
    ]);
    expect(threadPresenceInput(THREAD, environments)).toEqual({
      threadId: THREAD,
      spectator: { environmentId: HOST, label: "Mamd", machine: "desktop" },
    });
  });

  it("does not invent a machine identity for a client without a primary", () => {
    const environments = new Map([[FRIEND, environment(FRIEND, false, "syrent", "linux")]]);
    expect(threadPresenceInput(THREAD, environments)).toEqual({ threadId: THREAD });
  });

  it("uses the connection name and configured machine icon for a known visitor", () => {
    const environments = new Map([[FRIEND, environment(FRIEND, false, "syrent", "linux")]]);
    expect(presentThreadSpectators([spectator], environments)).toEqual([
      { environmentId: FRIEND, label: "syrent", machine: "linux" },
    ]);
    expect(presentThreadSpectators([spectator], new Map())).toEqual([spectator]);
  });

  it("keeps the visitor in their own list with their environment name instead of 'This machine'", () => {
    const environments = new Map([[FRIEND, environment(FRIEND, true, "syrent", "linux")]]);
    expect(presentThreadSpectators([spectator], environments)).toEqual([
      { environmentId: FRIEND, label: "syrent", machine: "linux" },
    ]);
  });

  it("bounds advertised names to the wire contract", () => {
    const environments = new Map([[HOST, environment(HOST, true, "m".repeat(200), "desktop")]]);
    const input = threadPresenceInput(THREAD, environments);
    expect(input.spectator?.label).toHaveLength(120);
    expect(isPresenceInput(input)).toBe(true);
  });
});
