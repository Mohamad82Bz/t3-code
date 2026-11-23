import {
  DEFAULT_CLIENT_SETTINGS,
  type SidebarCodexQuotaDisplay,
  type SidebarCodexQuotaTextSize,
} from "@t3tools/contracts/settings";
import { msg, useGT, useMessages } from "gt-react";

import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { useSearchableSetting } from "./settingsSearch";
import { SettingResetButton, SettingsRow, SettingsSection } from "./settingsLayout";
import { useScopedSettings, useUpdateScopedSettings } from "./useScopedSettings";

const DISPLAY_LABELS: Record<SidebarCodexQuotaDisplay, string> = {
  detailed: msg("Detailed"),
  percentages: msg("Percentages only"),
  hidden: msg("Hidden"),
};

const TEXT_SIZE_LABELS: Record<SidebarCodexQuotaTextSize, string> = {
  small: msg("Small"),
  standard: msg("Standard"),
  large: msg("Large"),
};

export function SidebarCodexQuotaSettings() {
  const gt = useGT();
  const m = useMessages();
  const searchableSetting = useSearchableSetting();
  const { sidebarCodexQuotaDisplay, sidebarCodexQuotaTextSize } = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const displaySetting = searchableSetting("sidebar-codex-quota-display");
  const sizeSetting = searchableSetting("sidebar-codex-quota-size");

  return (
    <SettingsSection id="sidebar-codex-quota" title={gt("Sidebar Codex quota")}>
      <SettingsRow
        {...displaySetting}
        description={gt(
          "Show quota percentages with reset details, only percentages, or nothing in the sidebar.",
        )}
        resetAction={
          sidebarCodexQuotaDisplay !== DEFAULT_CLIENT_SETTINGS.sidebarCodexQuotaDisplay ? (
            <SettingResetButton
              ariaLabel={gt("Reset quota display to default")}
              onClick={() =>
                updateSettings({
                  sidebarCodexQuotaDisplay: DEFAULT_CLIENT_SETTINGS.sidebarCodexQuotaDisplay,
                })
              }
            />
          ) : null
        }
        control={
          <Select<SidebarCodexQuotaDisplay>
            value={sidebarCodexQuotaDisplay}
            onValueChange={(value) => value && updateSettings({ sidebarCodexQuotaDisplay: value })}
          >
            <SelectTrigger size="sm" className="w-full sm:w-44" aria-label={displaySetting.title}>
              <SelectValue>{m(DISPLAY_LABELS[sidebarCodexQuotaDisplay])}</SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              {Object.entries(DISPLAY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {m(label)}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        }
      />
      <SettingsRow
        {...sizeSetting}
        description={gt("Change the text size of the sidebar quota summary.")}
        resetAction={
          sidebarCodexQuotaTextSize !== DEFAULT_CLIENT_SETTINGS.sidebarCodexQuotaTextSize ? (
            <SettingResetButton
              ariaLabel={gt("Reset quota text size to default")}
              onClick={() =>
                updateSettings({
                  sidebarCodexQuotaTextSize: DEFAULT_CLIENT_SETTINGS.sidebarCodexQuotaTextSize,
                })
              }
            />
          ) : null
        }
        control={
          <Select<SidebarCodexQuotaTextSize>
            value={sidebarCodexQuotaTextSize}
            onValueChange={(value) => value && updateSettings({ sidebarCodexQuotaTextSize: value })}
          >
            <SelectTrigger size="sm" className="w-full sm:w-44" aria-label={sizeSetting.title}>
              <SelectValue>{m(TEXT_SIZE_LABELS[sidebarCodexQuotaTextSize])}</SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false}>
              {Object.entries(TEXT_SIZE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {m(label)}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        }
      />
    </SettingsSection>
  );
}
