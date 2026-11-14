import { isWindowsPlatform } from "../../lib/utils";
import { updateClientSettings, useClientSettings } from "../../hooks/useSettings";
import { isElectron } from "../../env";
import { Switch } from "../ui/switch";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { DraftInput } from "../ui/draft-input";
import { SettingsRow, SettingsSection } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

export function QwenDictationSettings() {
  const settings = useClientSettings();
  if (!isElectron || !isWindowsPlatform(navigator.platform)) return null;
  return (
    <SettingsSection id={searchableSetting("dictation").id} title="Qwen dictation">
      <SettingsRow
        title="Use local Qwen for voice input"
        description="Use this PC's Qwen Dictation service with T3's microphone and dictation shortcuts. Turn off to use the transcription destination below. Audio stays on this PC; T3's transcript cleanup is bypassed."
        control={
          <Switch
            checked={settings.dictationEnabled}
            onCheckedChange={(checked) =>
              void updateClientSettings({ dictationEnabled: Boolean(checked) })
            }
            aria-label="Use local Qwen for voice input"
          />
        }
      />
      <SettingsRow
        {...searchableSetting("qwen-punctuation")}
        title="Automatic punctuation"
        description="Keep punctuation from Qwen, such as periods, commas, and question marks. Off by default so pauses do not punctuate your sentences. Punctuation you type yourself is never removed."
        control={
          <Switch
            checked={settings.dictationPunctuation}
            disabled={!settings.dictationEnabled}
            onCheckedChange={(checked) =>
              void updateClientSettings({ dictationPunctuation: Boolean(checked) })
            }
            aria-label="Qwen automatic punctuation"
          />
        }
      />
      {settings.dictationEnabled ? (
        <>
          <SettingsRow
            title="Live insertion"
            description="Insert stable words while you speak. You can keep editing and add your own punctuation during recording."
            control={
              <Switch
                checked={settings.dictationLiveMode}
                onCheckedChange={(checked) =>
                  void updateClientSettings({ dictationLiveMode: Boolean(checked) })
                }
                aria-label="Live dictation insertion"
              />
            }
          />
          <SettingsRow
            title="Global shortcut"
            description="Start or finish voice input from anywhere on the desktop. T3's regular dictation shortcut also works."
            control={
              <DraftInput
                size="sm"
                className="w-full sm:w-44"
                value={settings.dictationShortcut}
                onCommit={(value) => void updateClientSettings({ dictationShortcut: value })}
                placeholder="ctrl+shift+d"
                spellCheck={false}
                aria-label="Dictation shortcut"
              />
            }
          />
          <SettingsRow
            title="Global shortcut activation"
            description="Toggle starts and stops recording; hold records while the global shortcut is held."
            control={
              <Select
                value={settings.dictationActivationMode}
                onValueChange={(value) => {
                  if (value === "toggle" || value === "hold")
                    void updateClientSettings({ dictationActivationMode: value });
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="w-full sm:w-40"
                  aria-label="Dictation activation"
                >
                  <SelectValue>
                    {settings.dictationActivationMode === "hold" ? "Hold" : "Toggle"}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem value="toggle">Toggle</SelectItem>
                  <SelectItem value="hold">Hold</SelectItem>
                </SelectPopup>
              </Select>
            }
          />
          <SettingsRow
            title="Language"
            description="Language sent to Qwen Dictation for recognition."
            control={
              <Select
                value={settings.dictationLanguage}
                onValueChange={(value) => {
                  if (value === "English" || value === "Persian" || value === "Auto")
                    void updateClientSettings({ dictationLanguage: value });
                }}
              >
                <SelectTrigger size="sm" className="w-full sm:w-40" aria-label="Dictation language">
                  <SelectValue>{settings.dictationLanguage}</SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem value="English">English</SelectItem>
                  <SelectItem value="Persian">Persian</SelectItem>
                  <SelectItem value="Auto">Automatic</SelectItem>
                </SelectPopup>
              </Select>
            }
          />
          <SettingsRow
            title="Vocabulary"
            description="Optional names and technical terms sent as recognition context."
            control={
              <DraftInput
                size="sm"
                className="w-full sm:w-72"
                value={settings.dictationContext}
                onCommit={(value) => void updateClientSettings({ dictationContext: value })}
                placeholder="Names, products, technical terms"
                spellCheck={false}
                aria-label="Dictation vocabulary"
              />
            }
          />
          <SettingsRow
            title="Qwen Dictation path"
            description="The local installation that provides the authenticated streaming API."
            control={
              <DraftInput
                size="sm"
                className="w-full sm:w-72"
                value={settings.dictationPath}
                onCommit={(value) => void updateClientSettings({ dictationPath: value })}
                spellCheck={false}
                aria-label="Qwen Dictation path"
              />
            }
          />
        </>
      ) : null}
    </SettingsSection>
  );
}
