import { DEFAULT_CLIENT_SETTINGS, DesktopDictationSessionConfig } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import * as DesktopClientSettings from "../../settings/DesktopClientSettings.ts";
import * as DesktopDictation from "../../dictation/DesktopDictation.ts";
import * as ElectronWindow from "../../electron/ElectronWindow.ts";

class DictationIpcUnauthorizedSenderError extends Schema.TaggedError<DictationIpcUnauthorizedSenderError>()(
  "DictationIpcUnauthorizedSenderError",
  {},
) {
  override get message(): string {
    return "Dictation session configuration is only available to the main renderer.";
  }
}
import * as IpcChannels from "../channels.ts";
import * as DesktopIpc from "../DesktopIpc.ts";

export const getDictationSessionConfig = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.GET_DICTATION_SESSION_CONFIG_CHANNEL,
  payload: Schema.Void,
  result: DesktopDictationSessionConfig,
  handler: Effect.fn("desktop.ipc.dictation.getSessionConfig")(function* (_input, event) {
    const main = yield* (yield* ElectronWindow.ElectronWindow).main;
    if (
      event === undefined ||
      Option.isNone(main) ||
      main.value.webContents.id !== event.sender.id
    ) {
      return yield* new DictationIpcUnauthorizedSenderError();
    }
    const settings = Option.getOrElse(
      yield* (yield* DesktopClientSettings.DesktopClientSettings).get,
      () => DEFAULT_CLIENT_SETTINGS,
    );
    return yield* (yield* DesktopDictation.DesktopDictation).sessionConfig(settings);
  }),
});
