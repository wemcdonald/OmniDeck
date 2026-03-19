import { useState, useEffect, useMemo, useRef } from "react";
import { Trash2, AlertTriangle, Info } from "lucide-react";
import { Icon } from "@iconify/react";
import ReactCodeMirror from "@uiw/react-codemirror";
import { yaml as yamlExtension } from "@codemirror/lang-yaml";
import { stringify as stringifyYaml, parse as parseYaml } from "yaml";
import { cn } from "@/lib/utils";
import type {
  ButtonConfig,
  PluginCatalog,
  PluginCatalogEntry,
  CatalogAction,
  CatalogStateProvider,
  CatalogPreset,
  CatalogField,
  TemplateVariable,
} from "../lib/api";
import ParamField from "./ParamField";
import TemplateVariableChips from "./TemplateVariableChips";
import EmojiPicker from "./EmojiPicker";
import MaterialSymbolsPicker from "./MaterialSymbolsPicker";

interface ButtonConfigEditorProps {
  pos: [number, number];
  button: ButtonConfig | undefined;
  catalog: PluginCatalog;
  onSave(button: ButtonConfig): void;
  onClear(): void;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function findAction(catalog: PluginCatalog, qualifiedId: string): { action: CatalogAction; plugin: PluginCatalogEntry } | undefined {
  for (const plugin of catalog.plugins) {
    const action = plugin.actions.find((a) => a.qualifiedId === qualifiedId);
    if (action) return { action, plugin };
  }
  return undefined;
}

function findProvider(catalog: PluginCatalog, qualifiedId: string): { provider: CatalogStateProvider; plugin: PluginCatalogEntry } | undefined {
  for (const plugin of catalog.plugins) {
    const provider = plugin.stateProviders.find((s) => s.qualifiedId === qualifiedId);
    if (provider) return { provider, plugin };
  }
  return undefined;
}

function findPreset(catalog: PluginCatalog, qualifiedId: string): { preset: CatalogPreset; plugin: PluginCatalogEntry } | undefined {
  for (const plugin of catalog.plugins) {
    const preset = plugin.presets.find((p) => p.qualifiedId === qualifiedId);
    if (preset) return { preset, plugin };
  }
  return undefined;
}

/** Merge action + provider fields, deduplicating by key. */
function mergeFields(actionFields: CatalogField[], providerFields: CatalogField[]): CatalogField[] {
  const seen = new Set<string>();
  const result: CatalogField[] = [];
  for (const f of actionFields) {
    seen.add(f.key);
    result.push(f);
  }
  for (const f of providerFields) {
    if (!seen.has(f.key)) {
      result.push(f);
    }
  }
  return result;
}

function msIcon(name?: string) {
  if (!name) return null;
  if (name.startsWith("ms:")) {
    return <Icon icon={`material-symbols:${name.slice(3)}`} className="w-4 h-4" />;
  }
  return <span className="text-sm">{name}</span>;
}

type ActionTab = "press" | "longPress";

// ── Main Component ──────────────────────────────────────────────────────────

export default function ButtonConfigEditor({
  pos,
  button,
  catalog,
  onSave,
  onClear,
}: ButtonConfigEditorProps) {
  const current = button ?? { pos };

  // --- Resolve what's assigned ---
  const presetInfo = current.preset ? findPreset(catalog, current.preset) : undefined;
  const actionId = current.action ?? presetInfo?.preset.action;
  const providerId = current.state?.provider ?? presetInfo?.preset.stateProvider;
  const actionInfo = actionId ? findAction(catalog, actionId) : undefined;
  const providerInfo = providerId ? findProvider(catalog, providerId) : undefined;

  // Plugin health
  const pluginId = presetInfo?.plugin ?? actionInfo?.plugin ?? providerInfo?.plugin;
  const isMisconfigured = pluginId && (pluginId.health.status === "misconfigured" || pluginId.health.status === "error");

  // Merged fields
  const fields = useMemo(
    () => mergeFields(actionInfo?.action.fields ?? [], providerInfo?.provider.fields ?? []),
    [actionInfo, providerInfo],
  );

  // Template variables
  const templateVars: TemplateVariable[] = providerInfo?.provider.templateVariables ?? [];
  const providesIcon = providerInfo?.provider.providesIcon ?? false;

  // --- Local state ---
  const [params, setParams] = useState<Record<string, unknown>>(current.params ?? {});
  const [label, setLabel] = useState(current.label ?? "");
  const [labelColor, setLabelColor] = useState(current.label_color ?? "#ffffff");
  const [topLabel, setTopLabel] = useState(current.top_label ?? "");
  const [topLabelColor, setTopLabelColor] = useState(current.top_label_color ?? "#ffffff");
  const [icon, setIcon] = useState(current.icon ?? "");
  const [iconColor, setIconColor] = useState(current.icon_color ?? "#ffffff");
  const [background, setBackground] = useState(current.background ?? "");
  const [activeTab, setActiveTab] = useState<ActionTab>("press");
  const [showYaml, setShowYaml] = useState(false);
  const [yamlText, setYamlText] = useState("");
  const [yamlError, setYamlError] = useState<string | null>(null);

  // Long-press state
  const [longPressAction, setLongPressAction] = useState(current.long_press_action ?? "");
  const [longPressParams, setLongPressParams] = useState<Record<string, unknown>>(current.long_press_params ?? {});

  // Track which label field was last focused (for template var insertion)
  const lastFocusedLabel = useRef<"label" | "topLabel">("label");

  // Reset on button change
  useEffect(() => {
    const c = button ?? { pos };
    setParams(c.params ?? {});
    setLabel(c.label ?? "");
    setLabelColor(c.label_color ?? "#ffffff");
    setTopLabel(c.top_label ?? "");
    setTopLabelColor(c.top_label_color ?? "#ffffff");
    setIcon(c.icon ?? "");
    setIconColor(c.icon_color ?? "#ffffff");
    setBackground(c.background ?? "");
    setLongPressAction(c.long_press_action ?? "");
    setLongPressParams(c.long_press_params ?? {});
    setActiveTab("press");
    setShowYaml(false);
    setYamlText(stringifyYaml(c));
    setYamlError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos[0], pos[1], button]);

  function updateParam(key: string, value: unknown) {
    setParams((prev) => ({ ...prev, [key]: value }));
  }

  function handleInsertVariable(variable: string) {
    if (lastFocusedLabel.current === "topLabel") {
      setTopLabel((prev) => prev + variable);
    } else {
      setLabel((prev) => prev + variable);
    }
  }

  function handleSave() {
    const updated: ButtonConfig = { pos };

    // Preserve preset/action/state from current config
    if (current.preset) updated.preset = current.preset;
    if (current.action) updated.action = current.action;
    if (current.state) updated.state = current.state;

    // Params
    const cleanParams: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") cleanParams[k] = v;
    }
    if (Object.keys(cleanParams).length > 0) updated.params = cleanParams;

    // Appearance (only include if set)
    if (label) { updated.label = label; updated.label_color = labelColor; }
    if (topLabel) { updated.top_label = topLabel; updated.top_label_color = topLabelColor; }
    if (icon) { updated.icon = icon; updated.icon_color = iconColor; }
    if (background) updated.background = background;

    // Long press
    if (longPressAction) {
      updated.long_press_action = longPressAction;
      if (Object.keys(longPressParams).length > 0) {
        updated.long_press_params = longPressParams;
      }
    }

    onSave(updated);
  }

  function handleYamlSave() {
    try {
      const parsed = parseYaml(yamlText) as ButtonConfig;
      if (!parsed || typeof parsed !== "object") {
        setYamlError("Invalid YAML");
        return;
      }
      parsed.pos = pos;
      onSave(parsed);
      setYamlError(null);
    } catch (e) {
      setYamlError(String(e));
    }
  }

  // Long-press action fields
  const longPressActionInfo = longPressAction ? findAction(catalog, longPressAction) : undefined;

  // --- What to show in the header ---
  const headerName = presetInfo
    ? `${presetInfo.preset.name} (${presetInfo.plugin.name})`
    : actionInfo
      ? `${actionInfo.action.name} (${actionInfo.plugin.name})`
      : "No action assigned";

  const headerIcon = presetInfo?.preset.icon ?? actionInfo?.action.icon;

  const hasContent = !!(current.preset || current.action);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {msIcon(headerIcon)}
          <h3 className="font-semibold text-sm">{headerName}</h3>
          <span className="text-xs text-muted-foreground">
            [{pos[0]}, {pos[1]}]
          </span>
        </div>
        <div className="flex items-center gap-2">
          {button && (
            <button onClick={onClear} className="text-muted-foreground hover:text-destructive transition-colors" title="Clear button">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Plugin health banner */}
      {isMisconfigured && pluginId && (
        <div className="flex items-center gap-2 text-sm bg-yellow-500/10 border border-yellow-500/30 rounded px-3 py-2">
          <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />
          <span className="flex-1">
            {pluginId.health.message ?? "Plugin not configured."}
          </span>
          {pluginId.health.settingsUrl && (
            <a href={pluginId.health.settingsUrl} className="text-xs text-primary hover:underline shrink-0">
              Configure
            </a>
          )}
        </div>
      )}

      {!hasContent && (
        <p className="text-sm text-muted-foreground">
          Drag a preset or action from the plugin browser, or click one while this button is selected.
        </p>
      )}

      {hasContent && (
        <>
          {/* Press / Long Press tabs */}
          <div className="flex gap-1 border-b">
            {(["press", "longPress"] as ActionTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={cn(
                  "px-3 py-1.5 text-xs transition-colors",
                  activeTab === t
                    ? "border-b-2 border-primary text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t === "press" ? "Press" : "Long Press"}
              </button>
            ))}
          </div>

          {activeTab === "press" && (
            <div className="space-y-4">
              {/* Params section */}
              {fields.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Parameters
                  </h4>
                  {fields.map((f) => (
                    <ParamField
                      key={f.key}
                      field={f}
                      value={params[f.key]}
                      onChange={(v) => updateParam(f.key, v)}
                      catalog={catalog}
                    />
                  ))}
                </div>
              )}

              {/* Template variables */}
              {templateVars.length > 0 && (
                <div>
                  <TemplateVariableChips
                    variables={templateVars}
                    onInsert={handleInsertVariable}
                  />
                </div>
              )}

              {/* Appearance section */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Appearance
                </h4>

                {/* Background */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Background</label>
                  <input
                    type="color"
                    value={background || "#000000"}
                    onChange={(e) => setBackground(e.target.value)}
                    className="w-full h-8 rounded border cursor-pointer p-0.5"
                  />
                </div>

                {/* Icon */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">
                    Icon
                    {providesIcon && (
                      <span className="ml-1 text-[10px] text-blue-400 font-normal inline-flex items-center gap-0.5">
                        <Info className="w-3 h-3" />
                        Dynamic — state provider controls icon
                      </span>
                    )}
                  </label>
                  <div className="flex gap-1">
                    <input
                      className="flex-1 rounded border px-2 py-1 text-sm bg-background"
                      placeholder={providesIcon ? "Leave blank for dynamic icon" : "emoji or ms:icon_name"}
                      value={icon}
                      onChange={(e) => setIcon(e.target.value)}
                    />
                    <EmojiPicker value={icon} onSelect={setIcon} />
                    <MaterialSymbolsPicker value={icon} onSelect={setIcon} />
                    {icon.startsWith("ms:") && (
                      <input
                        type="color"
                        value={iconColor}
                        onChange={(e) => setIconColor(e.target.value)}
                        className="w-9 h-9 shrink-0 rounded border cursor-pointer p-0.5"
                        title="Icon color"
                      />
                    )}
                  </div>
                </div>

                {/* Label */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Label</label>
                  <div className="flex gap-1">
                    <input
                      className="flex-1 rounded border px-2 py-1 text-sm bg-background"
                      placeholder="Button label"
                      value={label}
                      onFocus={() => { lastFocusedLabel.current = "label"; }}
                      onChange={(e) => setLabel(e.target.value)}
                    />
                    <input
                      type="color"
                      value={labelColor}
                      onChange={(e) => setLabelColor(e.target.value)}
                      className="w-9 h-9 shrink-0 rounded border cursor-pointer p-0.5"
                    />
                  </div>
                </div>

                {/* Top Label */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Top Label</label>
                  <div className="flex gap-1">
                    <input
                      className="flex-1 rounded border px-2 py-1 text-sm bg-background"
                      placeholder="Secondary text"
                      value={topLabel}
                      onFocus={() => { lastFocusedLabel.current = "topLabel"; }}
                      onChange={(e) => setTopLabel(e.target.value)}
                    />
                    <input
                      type="color"
                      value={topLabelColor}
                      onChange={(e) => setTopLabelColor(e.target.value)}
                      className="w-9 h-9 shrink-0 rounded border cursor-pointer p-0.5"
                    />
                  </div>
                </div>
              </div>

              {/* Save */}
              <button
                onClick={handleSave}
                className="w-full rounded bg-primary text-primary-foreground py-1.5 text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Save
              </button>
            </div>
          )}

          {activeTab === "longPress" && (
            <div className="space-y-3">
              {!longPressAction ? (
                <p className="text-sm text-muted-foreground">
                  No long-press action. Drag an action from the plugin browser to assign one,
                  or type a qualified action ID below.
                </p>
              ) : (
                <div className="flex items-center gap-2">
                  {msIcon(longPressActionInfo?.action.icon)}
                  <span className="text-sm font-medium">
                    {longPressActionInfo?.action.name ?? longPressAction}
                  </span>
                  <button
                    onClick={() => { setLongPressAction(""); setLongPressParams({}); }}
                    className="text-xs text-destructive hover:underline ml-auto"
                  >
                    Remove
                  </button>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">
                  Long Press Action
                </label>
                <input
                  className="w-full rounded border px-2 py-1.5 text-sm bg-background"
                  placeholder="e.g. home-assistant.turn_on"
                  value={longPressAction}
                  onChange={(e) => setLongPressAction(e.target.value)}
                />
              </div>
              {longPressActionInfo && longPressActionInfo.action.fields.length > 0 && (
                <div className="space-y-3">
                  {longPressActionInfo.action.fields.map((f) => (
                    <ParamField
                      key={f.key}
                      field={f}
                      value={longPressParams[f.key]}
                      onChange={(v) => setLongPressParams((prev) => ({ ...prev, [f.key]: v }))}
                      catalog={catalog}
                    />
                  ))}
                </div>
              )}
              <button
                onClick={handleSave}
                className="w-full rounded bg-primary text-primary-foreground py-1.5 text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Save
              </button>
            </div>
          )}

          {/* Advanced YAML toggle */}
          <div className="border-t pt-2">
            <button
              onClick={() => { setShowYaml(!showYaml); setYamlText(stringifyYaml(current)); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showYaml ? "Hide" : "Show"} raw YAML
            </button>
            {showYaml && (
              <div className="mt-2 space-y-2">
                <ReactCodeMirror
                  value={yamlText}
                  extensions={[yamlExtension()]}
                  onChange={setYamlText}
                  height="200px"
                  className="text-xs border rounded overflow-hidden"
                  basicSetup={{ lineNumbers: true, foldGutter: false }}
                />
                {yamlError && <p className="text-xs text-destructive">{yamlError}</p>}
                <button
                  onClick={handleYamlSave}
                  className="w-full rounded border py-1 text-xs hover:bg-muted transition-colors"
                >
                  Apply YAML
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
