# Writing an OmniDeck Plugin

This guide walks through building a plugin from scratch. By the end, you'll have a plugin that registers actions, exposes live state, and provides one-click presets — all with a schema-driven config UI.

## Concepts

A plugin can provide three things:

| Concept | What it is | Example |
|---------|-----------|---------|
| **Action** | Something a button press triggers | "Toggle light", "Send keystroke" |
| **State Provider** | Live data that drives button visuals | Light brightness, mute status, current temperature |
| **Preset** | A pre-packaged button config (action + state provider + defaults) | "Light" preset = toggle action + light state + lightbulb icon |

Users compose buttons from these building blocks. Presets are the easy path — one click in the plugin browser. Actions and state providers are the power-user path for custom combinations.

## File Structure

An external plugin lives in the hub's `plugins/` directory:

```
plugins/my-plugin/
  manifest.yaml  # Plugin metadata (required)
  hub.ts         # Hub-side entry point (actions, state providers, presets)
  agent.ts       # Agent-side code (runs on Mac/Windows/Linux)
```

Both `hub.ts` and `agent.ts` are optional — a plugin can be hub-only, agent-only, or both. The hub automatically loads and registers hub-side code, and bundles and distributes agent-side code to connected agents.

Builtin plugins (shipped with OmniDeck) live in `hub/src/plugins/builtin/` and are imported directly in the hub source code.

## Installing Plugins

**From the Web UI:** Open the OmniDeck web interface, go to the Plugins page, and click "Install Plugin". You can:
- **Browse** curated plugins from the [OmniDeck-plugins](https://github.com/wemcdonald/OmniDeck-plugins) repository
- **Install from GitHub** by pasting a repository URL (e.g., `https://github.com/user/repo/tree/main/my-plugin`)
- **Upload a zip file** containing the plugin

Installed plugins are immediately active — no hub restart needed.

**Manually:** Drop the plugin directory into `plugins/` and restart the hub. For development, you can symlink your plugin directory instead.

## Minimal Plugin

Here's the smallest possible plugin:

```
plugins/my-plugin/
  manifest.yaml
  hub.ts
```

**manifest.yaml:**
```yaml
id: my-plugin
name: "My Plugin"
version: "1.0.0"
hub: hub.ts
```

**hub.ts:**
```typescript
import type { OmniDeckPlugin, PluginContext } from "@omnideck/plugin-schema";

export const myPlugin: OmniDeckPlugin = {
  id: "my-plugin",
  name: "My Plugin",
  version: "1.0.0",
  icon: "ms:extension",

  async init(ctx: PluginContext) {
    ctx.setHealth({ status: "ok" });

    ctx.registerAction({
      id: "greet",
      name: "Greet",
      description: "Log a greeting",
      icon: "ms:waving-hand",
      async execute(params) {
        ctx.log.info("Hello from my plugin!");
      },
    });
  },

  async destroy() {},
};
```

Drop the plugin folder into the hub's `plugins/` directory and restart the hub. The hub automatically detects, loads, and registers it — no code changes needed.

## Actions

An action is triggered by a button press. It receives typed params and an action context.

### Defining Params with Zod

Use Zod schemas with the `field()` helper to define params. The schema serves double duty: runtime validation in `execute()` and automatic form generation in the web UI.

```typescript
import { z } from "zod";
import { field } from "@omnideck/plugin-schema";
import type { ActionDefinition } from "../../types.js";

const SetColorSchema = z.object({
  entity_id: field(z.string(), {
    label: "Entity",
    fieldType: "ha_entity",
    domain: "light",
  }),
  color: field(z.string(), {
    label: "Color",
    fieldType: "color",
  }),
  brightness: field(z.number().min(0).max(100).optional(), {
    label: "Brightness",
    description: "0-100, leave blank for current brightness",
  }),
});

const setColorAction: ActionDefinition = {
  id: "set_color",
  name: "Set Light Color",
  description: "Set a light's color and optional brightness",
  icon: "ms:palette",
  paramsSchema: SetColorSchema,

  async execute(params, context) {
    const { entity_id, color, brightness } = SetColorSchema.parse(params);
    // ... do something with the validated params
  },
};
```

### Field Types

The `fieldType` in the `field()` helper controls which UI widget renders in the config editor:

| fieldType | UI Widget | Use for |
|-----------|-----------|---------|
| `"ha_entity"` | Searchable entity picker dropdown | Home Assistant entity IDs |
| `"agent"` | Agent/device picker | Target machine selection |
| `"page"` | Page picker | OmniDeck page navigation |
| `"icon"` | Icon picker (emoji + Material Symbols) | Custom icons |
| `"color"` | Native color picker | Colors |
| `"action_list"` | Ordered action list editor | Multi-action composition |
| `"condition"` | Condition builder | If-then-else logic |
| *(omitted)* | Inferred from Zod type | Most fields |

When `fieldType` is omitted, the UI infers the widget from the Zod type:

- `z.string()` → text input
- `z.number()` → number input (respects `.min()`, `.max()`)
- `z.boolean()` → checkbox
- `z.enum([...])` → dropdown

### The Action Context

The `execute` function receives an `ActionContext` with:

```typescript
interface ActionContext {
  targetAgent?: string;                    // Which agent this action targets
  focusedAgent?: string;                   // Currently focused machine
  triggerAction(pluginId, actionId, params): Promise<void>;  // Chain actions
  resolveState?(qualifiedId, params): StateProviderResult;   // Read state
}
```

Use `triggerAction` to call other plugins' actions. Use `resolveState` to read state provider values (useful for conditional logic).

## State Providers

A state provider supplies live data that drives button visuals. The hub calls `resolve()` every time a button needs rendering.

```typescript
import type { StateProviderDefinition, StateProviderResult } from "../../types.js";

const batteryProvider: StateProviderDefinition = {
  id: "battery_level",
  name: "Battery Level",
  description: "Shows device battery with color-coded progress bar",
  icon: "ms:battery-full",
  providesIcon: true,

  paramsSchema: z.object({
    device: field(z.string(), { label: "Device", fieldType: "agent" }),
  }),

  templateVariables: [
    { key: "percent", label: "Battery %", example: "85" },
    { key: "charging", label: "Charging", example: "true" },
  ],

  resolve(params): StateProviderResult {
    const { device } = params as { device: string };
    const battery = getBatteryData(device);  // your logic here

    return {
      state: {
        icon: battery.charging ? "ms:battery-charging-full" : "ms:battery-full",
        iconColor: battery.percent > 20 ? "#22c55e" : "#ef4444",
        label: `${battery.percent}%`,
        progress: battery.percent / 100,
        background: "#1e293b",
      },
      variables: {
        percent: String(battery.percent),
        charging: String(battery.charging),
      },
    };
  },
};
```

### ButtonStateResult Properties

Everything returned in `state` is optional:

| Property | Type | Description |
|----------|------|-------------|
| `icon` | `string \| Buffer` | `"ms:icon-name"` for Material Symbols, emoji string, or raw image buffer |
| `iconColor` | `string` | Hex color for the icon (only applies to `ms:` icons) |
| `label` | `string` | Bottom text |
| `topLabel` | `string` | Top text |
| `background` | `string` | Hex background color |
| `progress` | `number` | 0-1, renders a thin bar at the bottom |
| `badge` | `string \| number` | Corner badge (e.g., unread count) |
| `badgeColor` | `string` | Badge background color |
| `opacity` | `number` | 0-1, dims the entire button |

### Template Variables

The `variables` map in `StateProviderResult` contains string values that users can reference in button labels using Mustache syntax: `{{percent}}`.

The `templateVariables` array on the provider definition declares what's available — the web UI shows these as clickable chips that insert the variable into label fields.

Always return empty string for unavailable values, never `undefined`.

### `providesIcon`

Set `providesIcon: true` when your state provider dynamically controls the button icon. This tells the config editor to show a hint: "Icon is dynamically set by this state provider." Users can still override it with an explicit icon.

## Presets

A preset bundles an action + state provider + default appearance into a one-click button template. Users browse presets in the plugin sidebar and drag them onto buttons.

```typescript
import type { ButtonPreset } from "../../types.js";

const presets: ButtonPreset[] = [
  {
    id: "battery",
    name: "Battery",
    description: "Show device battery level with progress bar",
    category: "Monitoring",
    icon: "ms:battery-full",

    action: "alert_low_battery",        // Action ID within this plugin
    stateProvider: "battery_level",     // State provider ID within this plugin

    defaults: {
      icon: "ms:battery-full",
      label: "{{percent}}%",
      topLabel: "{{device_name}}",
      background: "#1e293b",
    },

    longPressAction: "refresh_battery", // Optional long-press action
    longPressDefaults: {},
  },
];
```

### How Presets Work

A preset **owns no param schema**. When a user assigns a preset to a button, the config editor shows the combined param fields from the referenced action and state provider (deduplicated by key). All user params are forwarded to both.

For example, if your action needs `{ device: string }` and your state provider also needs `{ device: string }`, the user fills it in once.

The `defaults` contain appearance values that are applied when the user doesn't override them. Labels can use Mustache templates: `"{{percent}}%"`.

### Preset Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique within the plugin |
| `name` | Yes | Shown in the plugin browser |
| `description` | No | Tooltip in the browser |
| `category` | No | Grouping in the browser (e.g., "Lighting", "Media") |
| `icon` | No | Icon in the browser (falls back to `defaults.icon`) |
| `action` | No | Action ID within this plugin (omit for display-only presets) |
| `stateProvider` | No | State provider ID within this plugin |
| `defaults` | Yes | Default appearance (`icon`, `label`, `topLabel`, `background`, colors) |
| `longPressAction` | No | Action ID for long-press |
| `longPressDefaults` | No | Default params for the long-press action |

## Icons

Use [Material Symbols](https://fonts.google.com/icons) with the `ms:` prefix. Icon names use **hyphens**, not underscores:

```typescript
// Correct
icon: "ms:volume-up"
icon: "ms:local-fire-department"
icon: "ms:mode-fan"

// Wrong — won't render
icon: "ms:volume_up"
```

Browse available icons at [fonts.google.com/icons](https://fonts.google.com/icons) — the icon name in the URL maps directly (spaces become hyphens).

## State Store

The `ctx.state` object is a key-value store namespaced by plugin ID:

```typescript
// Write state (triggers button re-renders if any buttons depend on it)
ctx.state.set("my-plugin", "temperature", 72.5);
ctx.state.set("my-plugin", "device:macbook:status", { online: true });

// Read state (usually in state providers)
const temp = ctx.state.get("my-plugin", "temperature") as number;

// Read another plugin's state
const haEntity = ctx.state.get("home-assistant", "entity:light.office");

// Batch writes (suppresses change events until the batch completes)
ctx.state.batch(() => {
  ctx.state.set("my-plugin", "a", 1);
  ctx.state.set("my-plugin", "b", 2);
  // Single re-render after batch, not two
});
```

State changes trigger debounced button re-renders — only buttons whose resolved visual state actually changed get re-rendered.

## Plugin Health

Report your plugin's config health so the UI can warn users about missing setup:

```typescript
async init(ctx: PluginContext) {
  const config = ctx.config as MyConfig;

  if (!config.api_key) {
    ctx.setHealth({
      status: "misconfigured",
      message: "Missing API key",
      configKey: "plugins.my-plugin.api_key",
      settingsUrl: "/settings/plugins/my-plugin",
    });
    return;  // Register actions/providers but don't start polling
  }

  ctx.setHealth({ status: "ok" });
  // ... normal init
}
```

Health status values:

| Status | Meaning |
|--------|---------|
| `"ok"` | Everything working |
| `"misconfigured"` | Missing required config — show warning, still browsable in UI |
| `"error"` | Runtime error — plugin actions may fail |
| `"degraded"` | Partially working (e.g., API intermittently failing) |

In the web UI, misconfigured plugins show a yellow warning badge and their presets/actions are dimmed.

## Logging

Use the plugin logger (`ctx.log`) for structured logging. Logs are streamed to the web UI in real-time.

```typescript
ctx.log.info("Connected to service");
ctx.log.info({ entityId, state }, "Entity state changed");
ctx.log.warn({ err }, "Connection lost, will retry");
ctx.log.error({ err }, "Fatal: unable to authenticate");
```

Never log secrets or tokens.

## Hub + Agent Plugins

Some plugins need to run code on the user's Mac or Windows machine (e.g., launch apps, read system state). These have both a hub side and an agent side.

### Agent Entry Point

```typescript
// agent.ts
import type { OmniDeck } from "@omnideck/agent-sdk";

export default function init(omnideck: OmniDeck) {
  // Plugin config from hub YAML (readonly, pushed by hub)
  const port = omnideck.config.port ?? 12345;

  // Managed polling timer (cleared on plugin unload)
  omnideck.setInterval(async () => {
    const data = await fetch(`http://localhost:${port}/status`).then(r => r.json());
    omnideck.setState("status", data);  // Push to hub state store
  }, 2000);

  // Handle commands from the hub (triggered by button presses)
  omnideck.onAction("do_thing", async (params) => {
    await fetch(`http://localhost:${port}/do`, { method: "POST" });
    return { success: true };
  });

  omnideck.onReloadConfig((newConfig) => { /* reconnect, adjust timers */ });
  omnideck.onDestroy(() => { /* cleanup */ });
}
```

Agent plugins are bundled by the hub (esbuild) and distributed to agents over WebSocket. Agents never run `npm install`.

### Native Libraries (FFI)

Agent plugins can call native platform libraries directly using `omnideck.ffi.open()`. This uses Bun's FFI under the hood and runs in the agent process — no child process spawning, no accessibility permission issues.

```typescript
// Example: macOS MediaRemote.framework for media playback control
if (omnideck.platform === "darwin") {
  const lib = omnideck.ffi.open(
    "/System/Library/PrivateFrameworks/MediaRemote.framework/MediaRemote",
    {
      MRMediaRemoteSendCommand: { args: ["i32", "ptr"], returns: "bool" },
    },
  );

  omnideck.onAction("play_pause", async () => {
    lib.call("MRMediaRemoteSendCommand", 2, null);  // 2 = toggle play/pause
    return { success: true };
  });

  omnideck.onDestroy(() => lib.close());
}
```

**Available FFI types:** `void`, `bool`, `i8`, `i16`, `i32`, `i64`, `u8`, `u16`, `u32`, `u64`, `f32`, `f64`, `ptr`

**Tips:**
- Always gate FFI calls behind `omnideck.platform` checks — libraries are platform-specific
- Use `omnideck.onDestroy()` to close library handles on plugin unload
- Pass `null` for null pointer arguments (e.g., optional `NSDictionary *` params)
- FFI calls are synchronous — they block the event loop briefly, which is fine for simple function calls

### Manifest

```yaml
# manifest.yaml
id: my-plugin
name: "My Plugin"
version: "1.0.0"
platforms: [darwin, windows]  # Omit for all platforms
hub: hub.ts
agent: agent.ts              # Omit for hub-only plugins
```

## Complete Example: Weather Plugin

Here's a realistic hub-only plugin that polls a weather API and exposes temperature on buttons:

```typescript
import { z } from "zod";
import { field } from "@omnideck/plugin-schema";
import type { OmniDeckPlugin, PluginContext } from "@omnideck/plugin-schema";

interface WeatherConfig {
  api_key: string;
  city: string;
  poll_interval?: number;
}

interface WeatherData {
  temp_c: number;
  temp_f: number;
  condition: string;
  humidity: number;
  icon: string;
}

export const weatherPlugin: OmniDeckPlugin = {
  id: "weather",
  name: "Weather",
  version: "1.0.0",
  icon: "ms:cloud",

  async init(ctx: PluginContext) {
    const config = ctx.config as WeatherConfig;

    if (!config.api_key || !config.city) {
      ctx.setHealth({
        status: "misconfigured",
        message: `Missing: ${[!config.api_key && "api_key", !config.city && "city"].filter(Boolean).join(", ")}`,
        settingsUrl: "/settings/plugins/weather",
      });
    } else {
      ctx.setHealth({ status: "ok" });
    }

    // ── Action: refresh weather ──

    ctx.registerAction({
      id: "refresh",
      name: "Refresh Weather",
      description: "Force a weather data refresh",
      icon: "ms:refresh",
      async execute() {
        await pollWeather();
      },
    });

    // ── State Provider: current weather ──

    const TempParamsSchema = z.object({
      city: field(z.string().optional(), {
        label: "City",
        placeholder: "Uses default city if blank",
      }),
    });

    ctx.registerStateProvider({
      id: "current",
      name: "Current Weather",
      description: "Temperature, condition, and humidity",
      icon: "ms:thermostat",
      providesIcon: true,
      paramsSchema: TempParamsSchema,

      templateVariables: [
        { key: "temp_c", label: "Temperature (C)", example: "22" },
        { key: "temp_f", label: "Temperature (F)", example: "72" },
        { key: "condition", label: "Condition", example: "Sunny" },
        { key: "humidity", label: "Humidity %", example: "45" },
      ],

      resolve(params) {
        const data = ctx.state.get("weather", "current") as WeatherData | undefined;
        if (!data) {
          return {
            state: { icon: "ms:cloud", label: "...", iconColor: "#9ca3af" },
            variables: { temp_c: "", temp_f: "", condition: "", humidity: "" },
          };
        }

        const conditionIcons: Record<string, string> = {
          sunny: "ms:clear-day",
          cloudy: "ms:cloud",
          rainy: "ms:rainy",
          snowy: "ms:weather-snowy",
        };

        return {
          state: {
            icon: conditionIcons[data.condition.toLowerCase()] ?? "ms:cloud",
            label: `${Math.round(data.temp_f)}°F`,
            topLabel: data.condition,
            iconColor: data.temp_f > 80 ? "#ef4444" : data.temp_f < 40 ? "#3b82f6" : "#ffffff",
          },
          variables: {
            temp_c: String(Math.round(data.temp_c)),
            temp_f: String(Math.round(data.temp_f)),
            condition: data.condition,
            humidity: String(data.humidity),
          },
        };
      },
    });

    // ── Preset ──

    ctx.registerPreset({
      id: "temperature",
      name: "Temperature",
      description: "Current temperature with weather icon",
      category: "Weather",
      icon: "ms:thermostat",
      stateProvider: "current",
      action: "refresh",
      defaults: {
        icon: "ms:thermostat",
        label: "{{temp_f}}°F",
        topLabel: "{{condition}}",
      },
    });

    // ── Polling ──

    async function pollWeather() {
      if (!config.api_key) return;
      try {
        const res = await fetch(
          `https://api.example.com/weather?city=${config.city}&key=${config.api_key}`
        );
        const data = (await res.json()) as WeatherData;
        ctx.state.set("weather", "current", data);
      } catch (err) {
        ctx.log.warn({ err }, "Weather poll failed");
      }
    }

    const interval = config.poll_interval ?? 300_000; // 5 minutes
    if (config.api_key) {
      pollWeather();
      setInterval(pollWeather, interval);
    }
  },

  async destroy() {},
};
```

Users configure it in YAML:

```yaml
plugins:
  weather:
    api_key: !secret weather_api_key
    city: "San Francisco"
```

And use it on a button:

```yaml
buttons:
  - pos: [0, 0]
    preset: weather.temperature
```

Or with custom labels:

```yaml
  - pos: [0, 0]
    preset: weather.temperature
    label: "{{temp_c}}°C"
    top_label: "{{humidity}}% humidity"
```
