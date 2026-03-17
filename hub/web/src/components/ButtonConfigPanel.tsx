import { useState, useEffect } from "react";
import type { ButtonConfig } from "../lib/api.ts";
import { Button } from "@/components/ui/button";
import ReactCodeMirror from "@uiw/react-codemirror";
import { yaml as yamlExtension } from "@codemirror/lang-yaml";
import { stringify as stringifyYaml, parse as parseYaml } from "yaml";

interface ButtonConfigPanelProps {
  pos: [number, number];
  button: ButtonConfig | undefined;
  onSave(button: ButtonConfig): void;
  onClear(): void;
}

type Tab = "preset" | "custom" | "yaml";

export default function ButtonConfigPanel({
  pos,
  button,
  onSave,
  onClear,
}: ButtonConfigPanelProps) {
  const [tab, setTab] = useState<Tab>("preset");
  const [yamlText, setYamlText] = useState("");
  const [yamlError, setYamlError] = useState<string | null>(null);

  // Local state for custom tab fields
  const [label, setLabel] = useState("");
  const [topLabel, setTopLabel] = useState("");
  const [icon, setIcon] = useState("");
  const [action, setAction] = useState("");
  const [preset, setPreset] = useState("");
  const [presetLabel, setPresetLabel] = useState("");

  const current: ButtonConfig = button ?? { pos };

  useEffect(() => {
    setYamlText(stringifyYaml(current));
    setYamlError(null);
    setLabel(current.label ?? "");
    setTopLabel(current.top_label ?? "");
    setIcon(current.icon ?? "");
    setAction(current.action ?? "");
    setPreset(current.preset ?? "");
    setPresetLabel(current.label ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos[0], pos[1], button]);

  function handleYamlSave() {
    try {
      const parsed = parseYaml(yamlText) as ButtonConfig;
      if (!parsed || typeof parsed !== "object") {
        setYamlError("Invalid YAML: must be a mapping");
        return;
      }
      // Ensure pos is preserved
      parsed.pos = pos;
      setYamlError(null);
      onSave(parsed);
    } catch (e) {
      setYamlError(String(e));
    }
  }

  function handlePresetSave() {
    const updated: ButtonConfig = { ...current, pos };
    if (preset) updated.preset = preset;
    if (presetLabel) updated.label = presetLabel;
    onSave(updated);
  }

  function handleCustomSave() {
    const updated: ButtonConfig = { ...current, pos };
    if (label) updated.label = label;
    else delete updated.label;
    if (topLabel) updated.top_label = topLabel;
    else delete updated.top_label;
    if (icon) updated.icon = icon;
    else delete updated.icon;
    if (action) updated.action = action;
    else delete updated.action;
    onSave(updated);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">
          Button [{pos[0]}, {pos[1]}]
        </h3>
        {button && (
          <button
            onClick={onClear}
            className="text-xs text-destructive hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-3 border-b">
        {(["preset", "custom", "yaml"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs capitalize transition-colors ${
              tab === t
                ? "border-b-2 border-primary text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto space-y-3">
        {tab === "preset" && (
          <>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Preset
              </label>
              <input
                className="w-full rounded border px-2 py-1 text-sm bg-background"
                placeholder="e.g. home-assistant.light_toggle"
                value={preset}
                onChange={(e) => setPreset(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Label (optional override)
              </label>
              <input
                className="w-full rounded border px-2 py-1 text-sm bg-background"
                placeholder="Button label"
                value={presetLabel}
                onChange={(e) => setPresetLabel(e.target.value)}
              />
            </div>
            <Button size="sm" className="w-full" onClick={handlePresetSave}>
              Apply
            </Button>
          </>
        )}

        {tab === "custom" && (
          <>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Label
              </label>
              <input
                className="w-full rounded border px-2 py-1 text-sm bg-background"
                placeholder="Button label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Top Label
              </label>
              <input
                className="w-full rounded border px-2 py-1 text-sm bg-background"
                placeholder="Small text above icon"
                value={topLabel}
                onChange={(e) => setTopLabel(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Icon (emoji or text)
              </label>
              <input
                className="w-full rounded border px-2 py-1 text-sm bg-background"
                placeholder="e.g. 💡"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Action
              </label>
              <input
                className="w-full rounded border px-2 py-1 text-sm bg-background"
                placeholder="e.g. plugin.action_name"
                value={action}
                onChange={(e) => setAction(e.target.value)}
              />
            </div>
            <Button size="sm" className="w-full" onClick={handleCustomSave}>
              Apply
            </Button>
          </>
        )}

        {tab === "yaml" && (
          <>
            <ReactCodeMirror
              value={yamlText}
              extensions={[yamlExtension()]}
              onChange={(val) => setYamlText(val)}
              height="260px"
              className="text-xs border rounded overflow-hidden"
              basicSetup={{ lineNumbers: true, foldGutter: false }}
            />
            {yamlError && (
              <p className="text-xs text-destructive mt-1">{yamlError}</p>
            )}
            <Button size="sm" className="w-full" onClick={handleYamlSave}>
              Apply YAML
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
