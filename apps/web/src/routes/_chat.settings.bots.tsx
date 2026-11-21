import { createFileRoute } from "@tanstack/react-router";
import { BotsSettingsPanel } from "../components/settings/BotsSettingsPanel";

export const Route = createFileRoute("/_chat/settings/bots")({
  component: BotsSettingsPanel,
});
