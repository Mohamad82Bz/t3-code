import { useGT } from "gt-react";
import { isWindowsPlatform } from "../../lib/utils";
import { updateClientSettings, useClientSettings } from "../../hooks/useSettings";
import { isElectron } from "../../env";
import { Switch } from "../ui/switch";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { DraftInput } from "../ui/draft-input";
import { SettingsRow, SettingsSection } from "./settingsLayout";
import { useSearchableSetting } from "./settingsSearch";

export function QwenDictationSettings() {
  const gt = useGT();
  const searchableSetting = useSearchableSetting();
  const settings = useClientSettings();
  if (!isElectron || !isWindowsPlatform(navigator.platform)) return null;
  return (
    <SettingsSection id={searchableSetting("dictation").id} title={gt("Qwen dictation")}>
      <SettingsRow
        title={gt("Use local Qwen for voice input")}
        description={gt(
          "Use this PC's Qwen Dictation service with T3's microphone and dictation shortcuts. Turn off to use the transcription destination below. Audio stays on this PC; T3's transcript cleanup is bypassed.",
        )}
        control={
          <Switch
            checked={settings.dictationEnabled}
            onCheckedChange={(checked) =>
              void updateClientSettings({ dictationEnabled: Boolean(checked) })
            }
            aria-label={gt("Use local Qwen for voice input")}
          />
        }
      />
      <SettingsRow
        {...searchableSetting("qwen-punctuation")}
        title={gt("Automatic punctuation")}
        description={gt(
          "Keep punctuation from Qwen, such as periods, commas, and question marks. Off by default so pauses do not punctuate your sentences. Punctuation you type yourself is never removed.",
        )}
        control={
          <Switch
            checked={settings.dictationPunctuation}
            disabled={!settings.dictationEnabled}
            onCheckedChange={(checked) =>
              void updateClientSettings({ dictationPunctuation: Boolean(checked) })
            }
            aria-label={gt("Qwen automatic punctuation")}
          />
        }
      />
      {settings.dictationEnabled ? (
        <>
          <SettingsRow
            title={gt("Live insertion")}
            description={gt(
              "Insert stable words while you speak. You can keep editing and add your own punctuation during recording.",
            )}
            control={
              <Switch
                checked={settings.dictationLiveMode}
                onCheckedChange={(checked) =>
                  void updateClientSettings({ dictationLiveMode: Boolean(checked) })
                }
                aria-label={gt("Live dictation insertion")}
              />
            }
          />
          <SettingsRow
            title={gt("Global shortcut")}
            description={gt(
              "Start or finish voice input from anywhere on the desktop. T3's regular dictation shortcut also works.",
            )}
            control={
              <DraftInput
                size="sm"
                className="w-full sm:w-44"
                value={settings.dictationShortcut}
                onCommit={(value) => void updateClientSettings({ dictationShortcut: value })}
                placeholder="ctrl+shift+d"
                spellCheck={false}
                aria-label={gt("Dictation shortcut")}
              />
            }
          />
          <SettingsRow
            title={gt("Global shortcut activation")}
            description={gt(
              "Toggle starts and stops recording; hold records while the global shortcut is held.",
            )}
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
                  aria-label={gt("Dictation activation")}
                >
                  <SelectValue>
                    {settings.dictationActivationMode === "hold" ? gt("Hold") : gt("Toggle")}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem value="toggle">{gt("Toggle")}</SelectItem>
                  <SelectItem value="hold">{gt("Hold")}</SelectItem>
                </SelectPopup>
              </Select>
            }
          />
          <SettingsRow
            title={gt("Language")}
            description={gt("Language sent to Qwen Dictation for recognition.")}
            control={
              <Select
                value={settings.dictationLanguage}
                onValueChange={(value) => {
                  if (value === "English" || value === "Persian" || value === "Auto")
                    void updateClientSettings({ dictationLanguage: value });
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="w-full sm:w-40"
                  aria-label={gt("Dictation language")}
                >
                  <SelectValue>{settings.dictationLanguage}</SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem value="English">{gt("English")}</SelectItem>
                  <SelectItem value="Persian">{gt("Persian")}</SelectItem>
                  <SelectItem value="Auto">{gt("Automatic")}</SelectItem>
                </SelectPopup>
              </Select>
            }
          />
          <SettingsRow
            title={gt("Vocabulary")}
            description={gt("Optional names and technical terms sent as recognition context.")}
            control={
              <DraftInput
                size="sm"
                className="w-full sm:w-72"
                value={settings.dictationContext}
                onCommit={(value) => void updateClientSettings({ dictationContext: value })}
                placeholder={gt("Names, products, technical terms")}
                spellCheck={false}
                aria-label={gt("Dictation vocabulary")}
              />
            }
          />
          <SettingsRow
            title={gt("Qwen Dictation path")}
            description={gt(
              "The local installation that provides the authenticated streaming API.",
            )}
            control={
              <DraftInput
                size="sm"
                className="w-full sm:w-72"
                value={settings.dictationPath}
                onCommit={(value) => void updateClientSettings({ dictationPath: value })}
                spellCheck={false}
                aria-label={gt("Qwen Dictation path")}
              />
            }
          />
        </>
      ) : null}
    </SettingsSection>
  );
}
