# OmniDeck - Architecture Specification

> An open-source, plugin-driven macro deck system that bridges a physical Stream Deck (or virtual touchscreen) across multiple computers, cloud services, and home automation — controlled from a Raspberry Pi.

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Hub (Pi)](#hub-pi)
4. [Agent (Mac/Windows)](#agent-macwindows)
5. [Plugin System](#plugin-system)
6. [Communication Protocol](#communication-protocol)
7. [Configuration Format](#configuration-format)
8. [Button Rendering](#button-rendering)
9. [Orchestration Engine](#orchestration-engine)
10. [Security Model](#security-model)
11. [Project Structure](#project-structure)
12. [Implementation Phases](#implementation-phases)
13. [Future Roadmap](#future-roadmap)

---

## Overview

### What OmniDeck Does

OmniDeck lets a single Stream Deck control multiple computers and networked services through a Raspberry Pi hub. It handles dynamic context switching — when you shift focus from your Mac to your Windows PC, the deck adapts. Media controls route to whichever machine is playing. Discord voice activity triggers hardware mic switching. Home Assistant entities show live state on buttons.

### Design Principles

1. **Plugin-first**: All integrations (HA, Spotify, Discord, OS control) are plugins. The core is a thin orchestration layer.
2. **Config-as-code**: YAML is the source of truth. An AI agent or human can author config. No GUI required (but a web UI can come later).
3. **Multi-computer native**: The system is designed from the ground up for one deck controlling N machines, with focus-aware context switching.
4. **Extensible**: Third parties can write plugins. Each plugin defines its own actions, state providers, config schema, and button presets.
5. **Offline-resilient**: Machines come and go. The deck degrades gracefully — buttons for offline machines dim or show status, never crash.

### Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Hub language | TypeScript (Node.js) | WebSocket/API glue code; shares types with future web UI; Pi already runs Node for ecosystem compatibility |
| Agent language | TypeScript (Bun) | Single compiled binary via `bun build --compile`; same language as hub; plugin ecosystem shared across sides |
| Stream Deck HID | `@elgato-stream-deck/node` | Battle-tested library (used by Bitfocus Companion); headless udev rules included |
| Button rendering | `sharp` (libvips) | Fast image compositing on Pi's ARM; JPEG output for Stream Deck keys |
| Config format | YAML | Human-readable, AI-writable, supports complex nested structures |
| Package manager | pnpm | Fast, disk-efficient, no monorepo tooling needed yet |
| Communication | WebSocket (JSON) | Persistent, bidirectional, low-latency (~1-5ms message delivery on LAN) |
| Protocol types | Hand-maintained TypeScript interfaces | JSON on the wire; types shared via `@omnideck/plugin-schema` workspace package |
| Plugin system | TypeScript classes with declarative manifests | Familiar pattern; plugins can use any npm package |
| No Bitfocus Companion | Custom system | We use &lt;1% of Companion's modules; the bridge/translation layer adds complexity without value for our multi-computer use case |

---

## System Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Raspberry Pi 4                         │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │                  OmniDeck Hub                     │  │
│  │                                                    │  │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────────┐  │  │
│  │  │ Stream   │  │  Plugin  │  │  Orchestration │  │  │
│  │  │ Deck HID │  │  Host    │  │  Engine        │  │  │
│  │  │          │  │          │  │                │  │  │
│  │  │ Keys in  │  │ HA       │  │ Focus tracker  │  │  │
│  │  │ Images   │  │ Spotify  │  │ Media router   │  │  │
│  │  │ out      │  │ Discord  │  │ Presence mgr   │  │  │
│  │  │          │  │ Slack    │  │ CEC control    │  │  │
│  │  │          │  │ OS Ctrl  │  │ USB switch     │  │  │
│  │  └──────────┘  │ ...      │  └────────────────┘  │  │
│  │                │          │                       │  │
│  │  ┌──────────┐  └──────────┘  ┌────────────────┐  │  │
│  │  │ Button   │                │  Config        │  │  │
│  │  │ Renderer │                │  Manager       │  │  │
│  │  │ (sharp)  │                │  (YAML → state)│  │  │
│  │  └──────────┘                └────────────────┘  │  │
│  │                                                    │  │
│  │  ┌──────────────────────────────────────────────┐ │  │
│  │  │          WebSocket Server (:9210)             │ │  │
│  │  │  Agent connections (LAN, TLS)                │ │  │
│  │  └──────────────────────────────────────────────┘ │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────┬───────────────────────────────┘
                           │
              ┌────────────┼────────────────┐
              │ WSS        │ WSS            │
         ┌────┴─────┐ ┌───┴──────┐   (cloud APIs from hub)
         │ Mac Agent │ │ Win Agent│    Spotify Web API
         │ (Go)      │ │ (Go)     │    Discord Gateway
         │           │ │          │    Slack Web API
         │ OS ctrl   │ │ OS ctrl  │    HA WebSocket API
         │ Discord   │ │ Discord  │
         │  local RPC│ │  local   │
         │ State     │ │  RPC     │
         │ stream    │ │ State    │
         └──────────┘ │ stream   │
                       └──────────┘
```

### Data Flow: Button Press

```
1. User presses Stream Deck key 5
2. HID layer emits keyDown(5)
3. Hub resolves: key 5 on current page → action "spotify.play_pause"
4. Plugin Host routes to Spotify plugin
5. Spotify plugin calls Web API: PUT /v1/me/player/pause
6. Spotify plugin state updates: is_playing = false
7. Button Renderer re-renders key 5 with pause icon
8. HID layer writes new JPEG to key 5
```

### Data Flow: State Change (External)

```
1. HA WebSocket pushes: light.office state → "on", brightness → 80%
2. HA plugin updates its state store
3. Orchestration engine evaluates: any buttons bound to light.office?
4. Button Renderer re-renders affected buttons (yellow icon, "80%" text)
5. HID layer writes new JPEGs to affected keys
```

### Data Flow: Focus Switch

```
1. Mac Agent reports: user_idle = true (no input for 30s)
2. Win Agent reports: user_idle = false (keyboard activity)
3. Orchestration engine: focus shifted Mac → Windows
4. Hub switches active page context (if configured)
5. Media routing updates: Spotify controls now target Windows
6. All agent-bound buttons re-render for new context
```

---

## Hub (Pi)

The hub is a single Node.js process running on the Raspberry Pi. It is the brain of the system.

### Core Modules

#### Stream Deck HID (`hub/src/deck/`)

Manages USB connection to the physical Stream Deck.

```typescript
interface DeckManager {
  // Lifecycle
  connect(): Promise<void>;           // Open HID connection
  disconnect(): Promise<void>;
  onConnect(cb: () => void): void;     // Stream Deck plugged in
  onDisconnect(cb: () => void): void;  // Stream Deck unplugged

  // Input
  onKeyDown(cb: (key: number) => void): void;
  onKeyUp(cb: (key: number) => void): void;
  onRotate(cb: (encoder: number, delta: number) => void): void;  // SD+ dials
  onLcdPress(cb: (x: number, y: number) => void): void;          // SD+ LCD strip

  // Output
  setKeyImage(key: number, buffer: Buffer): Promise<void>;  // JPEG/BMP
  setBrightness(percent: number): Promise<void>;
  setLcdImage(buffer: Buffer): Promise<void>;  // SD+ LCD strip

  // Info
  readonly model: string;        // "StreamDeckXL", "StreamDeckMini", etc.
  readonly keyCount: number;     // 6, 15, 32
  readonly keySize: { width: number; height: number };  // e.g. 96x96
  readonly keyColumns: number;
  readonly keyRows: number;
}
```

Supports all Stream Deck models via `@elgato-stream-deck/node`. The hub adapts its grid layout to the connected model.

**Future**: A `VirtualDeck` implementation will provide the same interface over WebSocket, for the touchscreen UI.

#### Config Manager (`hub/src/config/`)

Reads YAML config files, validates them against plugin schemas, and maintains the runtime state model.

```typescript
interface ConfigManager {
  load(configDir: string): Promise<void>;   // Read & validate YAML
  reload(): Promise<void>;                  // Hot-reload on file change
  getPages(): Page[];
  getPage(id: string): Page;
  getButton(pageId: string, position: [number, number]): ButtonConfig;
  getPluginConfig(pluginId: string): Record<string, unknown>;
  getDevices(): DeviceConfig[];
  getOrchestratorConfig(): OrchestratorConfig;
}
```

Watches the config directory for changes (via `chokidar`) and hot-reloads without restarting the hub. Validation uses Zod schemas — each plugin registers its own config schema.

#### Button Renderer (`hub/src/renderer/`)

Composites button images from layers: background color/image → icon → text → badge.

```typescript
interface ButtonRenderer {
  render(button: ButtonState): Promise<Buffer>;  // Returns JPEG
  renderAll(page: PageState): Promise<Map<number, Buffer>>;
}

interface ButtonState {
  background?: string | Buffer;    // Hex color or image buffer
  icon?: string | Buffer;          // Named icon, plugin icon, or image buffer
  label?: string;                  // Primary text (bottom of button)
  topLabel?: string;               // Secondary text (top of button)
  badge?: string | number;         // Corner badge (e.g. unread count)
  badgeColor?: string;
  opacity?: number;                // 0-1, for dimming offline/unavailable buttons
  progress?: number;               // 0-1, progress bar at bottom
  style?: ButtonStyle;             // Font size, alignment, colors
}
```

Uses `sharp` for image compositing. Renders at the native key resolution (e.g., 96x96 for SD XL, 72x72 for SD Original). Caches rendered images and only re-renders when state changes.

**Icon sources**:
- Built-in icon pack (Material Design Icons or similar, bundled as SVGs)
- Plugin-provided icons (each plugin can ship its own icon set)
- User-provided images (PNG/SVG in config directory)
- Dynamic images (e.g., album art fetched at runtime)

#### Plugin Host (`hub/src/plugins/`)

Loads, initializes, and manages plugin lifecycle. See [Plugin System](#plugin-system) for full details.

#### WebSocket Server (`hub/src/server/`)

Accepts connections from agents and (future) virtual deck clients.

```typescript
interface HubServer {
  start(port: number): Promise<void>;
  onAgentConnect(cb: (agent: AgentConnection) => void): void;
  onAgentDisconnect(cb: (agentId: string) => void): void;
  broadcast(message: HubMessage): void;
  sendTo(agentId: string, message: HubMessage): void;
}
```

Listens on port 9210 (configurable). TLS with self-signed certs for LAN security. Agents authenticate with a shared secret exchanged during pairing.

#### Orchestration Engine (`hub/src/orchestrator/`)

The "smart" layer that makes OmniDeck more than a dumb button grid. See [Orchestration Engine](#orchestration-engine).

---

## Agent (Mac/Windows)

A native desktop application built with Tauri v2 that wraps a Bun-compiled TypeScript agent binary. Runs as a system tray / menu bar app on macOS, Windows, and Linux. Distributed as `.dmg` (macOS), `.msi`/`.exe` (Windows), and `.deb`/`.AppImage` (Linux) via [GitHub Releases](https://github.com/wemcdonald/OmniDeck/releases). On macOS, also installable via `brew install --cask omnideck-agent`.

The Tauri shell handles system tray UI, `omnideck://` deep link pairing, and auto-start on login. The agent binary connects to the hub via WebSocket, executes OS-level commands via built-in primitives, and dynamically loads TypeScript plugins distributed from the hub.

### Architecture

```
┌────────────────────────────────────────┐
│           OmniDeck Agent (Bun)        │
│                                        │
│  ┌──────────────┐  ┌───────────────┐  │
│  │  WS Client   │  │  Built-in     │  │
│  │  (to Hub)    │◄─►│  Primitives   │  │
│  │              │  │               │  │
│  └──────────────┘  │  exec()       │  │
│                    │  active window│  │
│  ┌──────────────┐  │  idle time    │  │
│  │  Plugin      │  │  volume       │  │
│  │  Loader      │  └───────────────┘  │
│  │              │                     │
│  │  - Download  │  ┌───────────────┐  │
│  │    bundles   │  │  Agent        │  │
│  │  - Cache     │  │  Plugins      │  │
│  │    (~/.omni) │  │  (TypeScript) │  │
│  │  - Dynamic   │  │               │  │
│  │    import()  │  │  os-control   │  │
│  └──────────────┘  │  btt, obs...  │  │
│                    └───────────────┘  │
│  ┌──────────────┐                     │
│  │  mDNS        │                     │
│  │  Advertiser  │                     │
│  └──────────────┘                     │
└────────────────────────────────────────┘
```

### Plugin Distribution Flow

The hub distributes agent-side plugin code at connection time:

1. Agent connects → sends `state_update` with platform info
2. Hub responds with `plugin_manifest` listing available plugins + sha256 hashes
3. Agent checks local cache (`~/.omnideck/plugins/{id}/{sha256}.mjs`)
4. Cache miss → `plugin_download_request` → hub sends bundled JS via `plugin_download_response`
5. Agent dynamic-imports the bundle, calls `plugin.init(omnideck)`
6. Agent reports `plugin_status` (active/failed) to hub

Plugin config is pushed from hub → agent via `plugin_config_update` messages whenever the user changes plugin settings. Plugins handle this via `omnideck.onReloadConfig()`.

### Built-in Primitives

These are always available to agent plugins via the `OmniDeck` object, without any distribution:

- `exec(command, args)` — run any shell command, returns stdout/stderr/exitCode
- `setState(key, value)` — push state to hub state store (fire-and-forget)
- `platform` — `"darwin" | "windows" | "linux"`
- `setInterval(fn, ms)` / `clearInterval(handle)` — managed timers cleared on plugin unload
- `log.info/warn/error` — forwarded to hub logs

### Supported Commands

These are the commands the agent can execute, requested by the hub. Platform-specific implementations live behind a common interface.

```go
// Commander is the platform-agnostic command interface.
// Implementations: darwin.go, windows.go
type Commander interface {
    // Application management
    LaunchApp(appName string) error
    FocusApp(appName string) error
    IsAppRunning(appName string) (bool, error)
    ListRunningApps() ([]AppInfo, error)

    // System
    Sleep() error
    Lock() error

    // Audio
    GetVolume() (int, error)              // 0-100
    SetVolume(level int) error
    GetMicVolume() (int, error)
    SetMicVolume(level int) error
    GetAudioOutputDevices() ([]AudioDevice, error)
    SetAudioOutputDevice(id string) error
    GetAudioInputDevices() ([]AudioDevice, error)
    SetAudioInputDevice(id string) error

    // Input simulation
    SendKeystroke(keys ...Key) error      // e.g. Ctrl+Shift+M
    TypeText(text string) error

    // State
    GetActiveWindow() (WindowInfo, error)
    GetIdleTime() (time.Duration, error)
}
```

**Mac implementation**: Uses `osascript` (AppleScript) for app management, CoreAudio via cgo for volume, CGEvent API for keystrokes, NSWorkspace for active window.

**Windows implementation**: Uses PowerShell or Win32 API (via `w32` Go packages) for app management, Windows Audio Session API for volume, SendInput for keystrokes, GetForegroundWindow for active window.

### State Streaming

The agent periodically pushes local state to the hub (default 5s interval):

```typescript
interface AgentStateData {
  hostname: string;
  platform: "darwin" | "windows" | "linux";
  active_window_title?: string;
  active_window_app?: string;
  idle_time_ms?: number;
  volume?: number;
  mic_volume?: number;
  is_muted?: boolean;
  mic_muted?: boolean;
  agent_version: string;
}
```

Agent plugins can extend this by calling `omnideck.setState(key, value)` to push plugin-specific state (e.g., Spotify playback, BTT trigger list) into the hub's state store.

### Discord Local RPC

Each agent connects to the local Discord client's RPC socket (`discord-ipc-0`) to detect:
- Whether the local Discord client is connected
- Whether the user is in a voice channel (and which one)
- Local mute/deafen state

This is how the hub knows *which machine* Discord voice is active on (since the Discord bot API can't distinguish between two desktop clients).

### Agent Lifecycle

1. **Start**: Check for stored credentials in `~/.omnideck-agent/credentials.json`
2. **Discover**: If no stored hub address, browse for `_omnideck-hub._tcp` via mDNS (or use `OMNIDECK_HUB_URL` env var)
3. **Pair** (first boot): Prompt for pairing code, connect via `wss://`, send `pair_request`, save returned credentials
4. **Authenticate** (subsequent boots): Connect via `wss://` with pinned CA cert, send `authenticate` message with stored token
5. **Hello**: After auth, send `state_update` as initial hello
6. **Plugin Init**: Receive `plugin_manifest`, download/cache missing plugins, load them
7. **Stream**: Begin periodic state push (5s default)
8. **Listen**: Execute commands from hub, route to plugin action handlers
9. **Reconnect**: Auto-reconnect with 5s delay on disconnect
10. **Revocation**: If token is rejected, delete stored credentials and prompt for re-pairing

---

## Plugin System

Plugins are the primary extension mechanism. All integrations — including first-party ones like Home Assistant and Spotify — are implemented as plugins. There is no "built-in" integration code in the core.

### Plugin Types

**Hub-only plugins** — talk to cloud/network APIs directly from the Pi (HA, Spotify, Slack). Only a `hub.ts` is needed.

**Hub+Agent plugins** — need local OS access on the target machine (os-control, BetterTouchTool, OBS). Include both `hub.ts` (deck/button side) and `agent.ts` (local execution side). The hub is always the coordinator; agents are workers.

### Plugin Package Format

```
plugins/my-plugin/
├── manifest.yaml     # Identity and targeting metadata
├── hub.ts            # Hub-side: registers actions, state providers, presets
└── agent.ts          # Agent-side: optional, runs on Mac/Windows via plugin loader
```

**manifest.yaml** — metadata only:
```yaml
id: bettertouchtool
name: "BetterTouchTool"
version: "0.1.0"
platforms: [darwin]        # omit for all platforms
hub: hub.ts
agent: agent.ts            # omit for hub-only plugins
```

Config schemas and action param schemas live in `hub.ts` as Zod schemas — not in the manifest.

**Agent plugin entry point** — a default-exported `init` function:
```typescript
import type { OmniDeck } from "@omnideck/agent-sdk";

export default function init(omnideck: OmniDeck) {
  // Plugin config from hub YAML (readonly, pushed by hub)
  const port = omnideck.config.port ?? 12345;

  // Managed polling timer
  omnideck.setInterval(async () => {
    const data = await fetch(`http://localhost:${port}/status`).then(r => r.json());
    omnideck.setState("status", data);   // fire-and-forget push to hub
  }, 2000);

  // Handle hub-triggered actions (from button presses)
  omnideck.onAction("run_trigger", async (params) => {
    await fetch(`http://localhost:${port}/trigger/${params.name}`, { method: "POST" });
    return { success: true };
  });

  // Hot-reload config without restarting
  omnideck.onReloadConfig((newConfig) => { /* reconnect, adjust timers, etc. */ });

  // Cleanup on unload
  omnideck.onDestroy(() => { /* close connections */ });
}
```

Agent plugins are **pre-bundled by the hub** (esbuild) before distribution. Agents never run `npm install` — they receive a single resolved `.js` file and dynamic-import it.

### Hub Plugin Interface

```typescript
interface Plugin {
  /** Unique identifier, e.g. "home-assistant", "spotify", "os-control" */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Plugin version (semver) */
  readonly version: string;

  /** Zod schema for plugin-specific YAML configuration */
  readonly configSchema: z.ZodType;

  /** Called once on hub startup. Receives validated config. */
  init(context: PluginContext): Promise<void>;

  /** Called on hub shutdown. Clean up connections, timers, etc. */
  destroy(): Promise<void>;

  /** Called on config hot-reload with new config. */
  onConfigChange?(newConfig: unknown): Promise<void>;
}

interface PluginContext {
  /** Plugin's validated config from YAML */
  config: unknown;

  /** Read/write plugin state. Changes trigger button re-renders. */
  state: StateStore;

  /** Access agent connections */
  agents: AgentManager;

  /** Log with plugin prefix */
  log: Logger;

  /** Register actions that buttons can trigger */
  registerAction(action: ActionDefinition): void;

  /** Register state providers that buttons can display */
  registerStateProvider(provider: StateProviderDefinition): void;

  /** Register icon packs shipped with this plugin */
  registerIcons(icons: IconSet): void;

  /** Register button presets (pre-configured button templates) */
  registerPreset(preset: ButtonPreset): void;

  /** Subscribe to orchestrator events (focus change, etc.) */
  onOrchestratorEvent(event: string, cb: (data: unknown) => void): void;

  /** Emit events for other plugins or the orchestrator */
  emit(event: string, data: unknown): void;
}
```

### Action Definition

An action is something a button press can trigger.

```typescript
interface ActionDefinition {
  /** Unique within plugin, e.g. "toggle" */
  id: string;

  /** Human-readable, e.g. "Toggle Entity" */
  name: string;

  /** Zod schema for action parameters in YAML */
  paramsSchema: z.ZodType;

  /** Execute the action. Called on button press. */
  execute(params: unknown, context: ActionContext): Promise<void>;
}

interface ActionContext {
  /** Which agent (if any) this action targets */
  targetAgent?: string;

  /** The orchestrator's current focus device */
  focusedAgent?: string;

  /** Trigger another action (for chaining) */
  triggerAction(pluginId: string, actionId: string, params: unknown): Promise<void>;
}
```

### State Provider Definition

A state provider exposes data that buttons can display.

```typescript
interface StateProviderDefinition {
  /** Unique within plugin, e.g. "entity_state" */
  id: string;

  /** Zod schema for provider parameters in YAML (e.g., which entity) */
  paramsSchema: z.ZodType;

  /** Resolve current ButtonState for these params. Called on render. */
  resolve(params: unknown): ButtonState | Partial<ButtonState>;
}
```

### Button Presets

Presets are pre-configured button templates that plugins can offer. They simplify config authoring — instead of specifying every detail, a user can reference a preset.

```typescript
interface ButtonPreset {
  /** Unique within plugin, e.g. "light_toggle" */
  id: string;

  /** Human-readable, e.g. "Light Toggle Button" */
  name: string;

  /** Description for config tooling / AI */
  description: string;

  /** Required user-provided params, e.g. { entity_id: "light.office" } */
  paramsSchema: z.ZodType;

  /** Generate full button config from params */
  generate(params: unknown): ButtonConfig;
}
```

Example: The HA plugin's `light_toggle` preset takes an `entity_id` and generates a complete button with:
- Yellow lightbulb icon when on, gray when off
- Entity friendly name as label
- Brightness percentage as top label
- Toggle action on press
- Long-press to set brightness to 100%

### First-Party Plugins

These ship with OmniDeck but are implemented as standard plugins:

#### `home-assistant`

Connects to HA via WebSocket API. Provides rich state feedback for any entity domain.

**Config**:
```yaml
plugins:
  home-assistant:
    url: ws://homeassistant.local:8123/api/websocket
    token: "eyJ0eXAiOi..."
```

**Actions**: `call_service`, `toggle`, `turn_on`, `turn_off`, `trigger_automation`, `run_script`

**State providers**: `entity_state` — resolves to button visuals based on entity domain:
- **Lights**: On/off icon, brightness %, color indication
- **Switches**: On/off icon
- **Sensors**: Current value with unit, color thresholds
- **Climate**: Temperature, mode icon, target temp
- **Media players**: Play state, media title, volume
- **Covers**: Open/closed/partial icon
- **Locks**: Locked/unlocked icon
- **Binary sensors**: On/off with domain-appropriate icons (motion, door, window, etc.)
- **Scenes**: Static icon, activates on press

**Presets**: `light_toggle`, `switch_toggle`, `scene_activate`, `climate_control`, `media_control`, `sensor_display`

**Icons**: Ships with domain-specific icon sets (lightbulb, thermometer, lock, motion sensor, etc.)

#### `spotify`

Connects to Spotify Web API. Manages OAuth token refresh.

**Config**:
```yaml
plugins:
  spotify:
    client_id: "abc123"
    client_secret: "def456"
    refresh_token: "ghi789"    # obtained via one-time OAuth flow
    poll_interval: 2s           # playback state poll frequency
```

**Actions**: `play_pause`, `next`, `previous`, `set_volume`, `transfer_playback`, `toggle_shuffle`, `toggle_repeat`, `play_playlist`, `play_album`

**State providers**:
- `now_playing` — track name, artist, album art (fetched and cached), progress bar
- `playback_state` — play/pause icon, shuffle/repeat indicators
- `device_list` — which devices are available, which is active

**Presets**: `play_pause_button`, `now_playing_display`, `skip_controls`, `volume_control`

**Icons**: Play, pause, skip, shuffle, repeat, Spotify logo

#### `discord`

Hybrid: Discord Gateway bot (on hub) + local RPC (on agents).

**Config**:
```yaml
plugins:
  discord:
    bot_token: "MTIz..."
    guild_id: "456..."           # your server
    voice_channel_ids:           # channels to monitor
      - "789..."
```

**Actions**: `toggle_mute`, `toggle_deafen`, `disconnect_voice`

**State providers**:
- `voice_channel` — list of users in channel, their mute/deafen state
- `self_voice_state` — am I muted, deafened, in voice, on which machine
- `user_avatar` — fetch and cache user avatars for button display

**Presets**: `mute_toggle`, `voice_channel_display`, `user_volume_control`

**Agent interaction**: Hub asks agents for local Discord RPC state to determine which machine is in voice.

#### `slack`

Connects to Slack Web API.

**Config**:
```yaml
plugins:
  slack:
    bot_token: "xoxb-..."
    user_token: "xoxp-..."      # for user-specific data like unreads
    poll_interval: 10s
```

**Actions**: `set_status`, `set_presence`, `mark_read`

**State providers**:
- `unread_summary` — total unreads, DM count, mention count, as badge numbers
- `channel_unreads` — unreads for specific channels

**Presets**: `unread_badge`, `status_toggle` (e.g., toggle "In a meeting" status)

#### `os-control`

Routes commands to agents. This plugin is the bridge between the hub and agent capabilities.

**Config**:
```yaml
plugins:
  os-control:
    default_target: auto         # "auto" = focused machine, or a device ID
```

**Actions**: `launch_app`, `focus_app`, `send_keystroke`, `set_volume`, `set_mic_volume`, `sleep`, `lock`, `switch_audio_output`, `switch_audio_input`

**State providers**:
- `active_window` — title and app name from target machine
- `volume_level` — current volume as progress bar or number
- `mic_level` — current mic volume
- `app_running` — whether a specific app is running (for on/off button states)

**Presets**: `app_launcher`, `volume_slider`, `mic_mute_toggle`

**Target resolution**: Actions accept an optional `target` param. If omitted, uses the orchestrator's current focused device (or `default_target` from config).

#### `omnideck-core`

Built-in actions for deck management. Not really a "plugin" in the external sense, but implemented as one for consistency.

**Actions**: `change_page`, `go_back`, `set_brightness`, `sleep_deck`, `reload_config`

**State providers**: `page_indicator`, `deck_brightness`, `connection_status`

---

## Communication Protocol

All hub ↔ agent communication uses WebSocket with JSON messages. The protocol is simple, typed, and versioned.

### Message Envelope

```typescript
interface Message {
  /** Protocol version */
  v: 1;

  /** Message type */
  type: string;

  /** Unique message ID (for request/response correlation) */
  id?: string;

  /** Payload */
  data: unknown;

  /** Timestamp (ISO 8601) */
  ts: string;
}
```

### Hub → Agent Messages

```typescript
// Execute a command on the agent
interface CommandRequest {
  type: "command";
  id: string;                    // for response correlation
  data: {
    command: string;             // e.g. "launch_app", "set_volume"
    params: Record<string, unknown>;
  };
}

// Request current state snapshot
interface StateRequest {
  type: "state_request";
  id: string;
}

// Pairing response (after successful pair_request)
interface PairResponse {
  type: "pair_response";
  data: {
    success: boolean;
    agent_id?: string;           // UUID assigned to agent
    token?: string;              // long-lived auth token (sent once)
    ca_cert?: string;            // CA certificate PEM for TLS pinning
    ca_fingerprint?: string;     // SHA-256 of CA cert
    hub_name?: string;
    error?: string;
  };
}

// Authentication response
interface AuthenticateResponse {
  type: "authenticate_response";
  data: {
    success: boolean;
    error?: string;
  };
}
```

### Agent → Hub Messages

```typescript
// Command response
interface CommandResponse {
  type: "command_response";
  id: string;                    // matches CommandRequest.id
  data: {
    success: boolean;
    result?: unknown;
    error?: string;
  };
}

// State update (pushed on change or at poll interval)
interface StateUpdate {
  type: "state_update";
  data: AgentState;              // full or partial state
}

// Pairing request (first-time connection)
interface PairRequest {
  type: "pair_request";
  data: {
    hostname: string;
    platform: string;
    agent_version: string;
    pairing_code: string;        // code from hub web UI, e.g. "DECK-7F3A"
  };
}

// Token authentication (subsequent connections)
interface Authenticate {
  type: "authenticate";
  data: {
    agent_id: string;
    token: string;
  };
}
```

### Protocol Design Notes

- **No binary protocol**: JSON is human-debuggable, and the message sizes are tiny. The only large payloads are album art, which are fetched directly by the hub via HTTP, not sent through agents.
- **Request/response via `id`**: Commands that need responses use a UUID `id` field. The agent includes the same `id` in its response. The hub times out unmatched requests after 5 seconds.
- **Partial state updates**: Agents can send only changed fields to minimize traffic. The hub merges partials into its full state model.

---

## Configuration Format

YAML files in a config directory (default: `~/.omnideck/config/`). The hub reads all `.yaml` files in this directory.

### Directory Structure

```
~/.omnideck/
├── config/
│   ├── main.yaml           # Core config: devices, plugins, orchestrator
│   ├── pages/
│   │   ├── home.yaml       # Home page buttons
│   │   ├── media.yaml      # Media control page
│   │   ├── ha.yaml         # Home Assistant page
│   │   └── work.yaml       # Work tools page
│   └── icons/              # Custom user icons
│       ├── my-app.png
│       └── my-logo.svg
├── secrets.yaml            # API tokens, passwords (gitignored)
├── agents.yaml             # Paired agent registry (hub side)
├── tls/                    # Auto-generated TLS certificates
│   ├── ca.key              # CA private key (mode 0600)
│   ├── ca.crt              # CA certificate (downloadable from web UI)
│   ├── server.key          # Server private key (mode 0600)
│   └── server.crt          # Server certificate (auto-renewed)
└── data/                   # Runtime data (caches, DB)
    ├── icon-cache/
    └── state.db            # SQLite for persistent state

# Agent side (on Mac/Windows):
~/.omnideck-agent/
└── credentials.json        # Stored pairing credentials (mode 0600)
```

### Main Config (`main.yaml`)

```yaml
# OmniDeck Configuration
deck:
  brightness: 80                # 0-100
  idle_dim_after: 5m            # dim after 5 minutes idle
  idle_dim_brightness: 20
  wake_on_touch: true
  default_page: home

devices:
  - id: macbook
    name: "Will's MacBook"
    platform: darwin
    # address discovered via mDNS, or manually:
    # address: 192.168.1.50:9210

  - id: windows-pc
    name: "Will's PC"
    platform: windows

plugins:
  home-assistant:
    url: !secret ha_url
    token: !secret ha_token

  spotify:
    client_id: !secret spotify_client_id
    client_secret: !secret spotify_client_secret
    refresh_token: !secret spotify_refresh_token

  discord:
    bot_token: !secret discord_bot_token
    guild_id: "123456789"
    voice_channel_ids:
      - "987654321"

  slack:
    user_token: !secret slack_user_token
    poll_interval: 15s

  os-control:
    default_target: auto

hub:
  name: "My OmniDeck"             # mDNS display name (default: "OmniDeck")

auth:
  password_hash: !secret hub_password_hash  # bcrypt hash (optional)
  tls_redirect: false             # redirect HTTP → HTTPS after CA cert install

orchestrator:
  focus:
    strategy: idle_time          # "idle_time" | "manual" | "active_window"
    idle_threshold: 30s          # machine is "unfocused" after 30s idle
    switch_page_on_focus: true   # auto-switch to device-specific page
  media:
    route_to: active_player      # "active_player" | "focused" | "manual"
  discord:
    mic_switch:
      enabled: true
      ha_entity: switch.usb_mic_switch    # HA-controlled USB switch
      mac_position: "a"                    # USB switch port for Mac
      windows_position: "b"
  cec:
    enabled: true                # requires cec-utils and HDMI connection
    mac_input: HDMI1
    windows_input: HDMI2
```

### Secrets (`secrets.yaml`)

```yaml
ha_url: "ws://homeassistant.local:8123/api/websocket"
ha_token: "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUz..."
spotify_client_id: "abc123"
spotify_client_secret: "def456"
spotify_refresh_token: "ghi789"
discord_bot_token: "MTIzNDU2Nzg5..."
slack_user_token: "xoxp-123-456-..."
```

Referenced from main config via `!secret key_name` (similar to Home Assistant's secrets pattern).

### Page Config (`pages/home.yaml`)

```yaml
page: home
name: "Home"
columns: 4                      # override grid columns (default: match deck)

buttons:
  # Position is [column, row], 0-indexed from top-left
  - pos: [0, 0]
    preset: home-assistant.light_toggle
    params:
      entity_id: light.office

  - pos: [1, 0]
    preset: home-assistant.light_toggle
    params:
      entity_id: light.living_room

  - pos: [2, 0]
    preset: home-assistant.scene_activate
    params:
      entity_id: scene.movie_time
      icon: movie

  - pos: [3, 0]
    preset: slack.unread_badge
    params:
      show_dms: true

  # Row 2: Media controls
  - pos: [0, 1]
    preset: spotify.play_pause_button

  - pos: [1, 1]
    preset: spotify.now_playing_display

  - pos: [2, 1]
    action: spotify.previous
    icon: skip-previous

  - pos: [3, 1]
    action: spotify.next
    icon: skip-next

  # Row 3: Computer controls
  - pos: [0, 2]
    label: "Mac"
    action: os-control.focus_app
    params:
      target: macbook
      app: Finder
    state:
      provider: os-control.active_window
      params: { target: macbook }
    style:
      show_active_window: true

  - pos: [1, 2]
    label: "PC"
    action: os-control.focus_app
    params:
      target: windows-pc
      app: explorer
    state:
      provider: os-control.active_window
      params: { target: windows-pc }

  - pos: [2, 2]
    preset: discord.mute_toggle

  - pos: [3, 2]
    action: omnideck-core.change_page
    params:
      page: ha
    icon: home-automation
    label: "Lights"

  # Fully custom button (no preset)
  - pos: [0, 3]
    label: "Deploy"
    icon: rocket
    background: "#1a1a2e"
    action: os-control.send_keystroke
    params:
      target: macbook
      keys: ["ctrl", "shift", "d"]
    state:
      provider: os-control.app_running
      params:
        target: macbook
        app: Docker
      when_true:
        icon: rocket
        background: "#16a34a"
      when_false:
        icon: rocket
        background: "#dc2626"
        opacity: 0.5
```

### Button Config Schema (Full)

```yaml
# Every field is optional except pos. A button can be as simple as:
#   - pos: [0, 0]
#     preset: home-assistant.light_toggle
#     params: { entity_id: light.office }
#
# Or as detailed as:

- pos: [column, row]

  # --- Appearance ---
  label: "Text"                  # Bottom text
  top_label: "Text"              # Top text
  icon: "icon-name"              # From built-in or plugin icon sets
  image: "./icons/custom.png"    # Path relative to config dir
  background: "#hex"             # Background color
  opacity: 1.0                   # 0-1
  style:
    font_size: 12                # Points
    label_color: "#ffffff"
    label_align: center          # left | center | right

  # --- Action (what happens on press) ---
  action: "plugin.action_id"     # e.g. "home-assistant.toggle"
  params: {}                     # Action-specific parameters

  # Long-press action (optional, >500ms hold)
  long_press_action: "plugin.action_id"
  long_press_params: {}

  # --- State (dynamic appearance) ---
  state:
    provider: "plugin.provider_id"
    params: {}
    # Conditional overrides:
    when_true:                   # Applied when provider returns truthy
      icon: "..."
      background: "..."
      label: "..."
    when_false:
      icon: "..."
      background: "..."

  # --- Preset (shorthand for the above) ---
  preset: "plugin.preset_id"    # Generates all of the above from params
  params: {}                    # Preset-specific parameters

  # --- Targeting ---
  target: "device_id"           # Override default target for os-control actions
                                # "auto" = orchestrator decides
```

---

## Button Rendering

### Rendering Pipeline

```
ButtonConfig (YAML)
       │
       ▼
PluginHost.resolve(state provider + params)
       │
       ▼
ButtonState (merged: config defaults + state overrides + conditional overrides)
       │
       ▼
Renderer.render(ButtonState)
       │
       ├─ Layer 1: Background (solid color or image, scaled to key size)
       ├─ Layer 2: Icon (centered, scaled with padding)
       ├─ Layer 3: Label text (bottom, with shadow for readability)
       ├─ Layer 4: Top label text (top)
       ├─ Layer 5: Badge (top-right corner, colored circle with number)
       ├─ Layer 6: Progress bar (bottom edge, thin horizontal bar)
       └─ Layer 7: Opacity overlay (for dimming unavailable buttons)
       │
       ▼
JPEG Buffer (at deck's native key resolution)
       │
       ▼
DeckManager.setKeyImage(key, buffer)
```

### Rendering Optimization

- **Dirty tracking**: Only re-render buttons whose state has actually changed
- **Image cache**: Cache rendered JPEGs keyed by a hash of the ButtonState. Same state = same image, skip rendering.
- **Batch updates**: When multiple buttons change simultaneously (e.g., page switch), render all in parallel and write to deck in one batch
- **Icon pre-processing**: SVG icons are pre-rendered to PNG at key resolution on startup
- **Album art cache**: Spotify album art is fetched once, resized, and cached to disk

---

## Orchestration Engine

The orchestrator is the "intelligence" layer that makes multi-computer control seamless.

### Focus Tracking

Determines which machine the user is currently using.

```typescript
interface FocusTracker {
  /** Currently focused device ID, or null if all idle */
  readonly focused: string | null;

  /** All device states */
  readonly devices: Map<string, DeviceFocusState>;

  /** Subscribe to focus changes */
  onFocusChange(cb: (from: string | null, to: string | null) => void): void;
}

interface DeviceFocusState {
  online: boolean;
  idleTime: number;           // seconds since last input
  lastActivity: Date;
  isFocused: boolean;
}
```

**Strategies**:
- `idle_time` (default): The machine with the shortest idle time is focused. A machine becomes "unfocused" after `idle_threshold` (default 30s) of no keyboard/mouse input.
- `manual`: User explicitly switches focus via a deck button.
- `active_window`: Focus follows whichever machine most recently had a window focus change.

### Media Router

Routes media-related button presses to the correct machine.

```typescript
interface MediaRouter {
  /** Where should media commands go? */
  resolveMediaTarget(): string | "hub";  // device ID or "hub" for cloud API
}
```

**Strategies**:
- `active_player`: Route to whichever device Spotify reports as active (via Spotify Web API `is_active` field). Falls back to focused device.
- `focused`: Always route to the focused machine.
- `manual`: User pins media controls to a specific machine.

### Presence Manager

Tracks which agents are online and handles graceful degradation.

- Agents that disconnect have their buttons dimmed (opacity: 0.5)
- Actions targeting offline agents show a brief error flash on the button
- When an agent reconnects, its buttons immediately refresh

### Discord Mic Switch

Automated workflow:
1. Agent reports: "Discord voice active on [machine]"
2. Orchestrator triggers HA service call: `switch.usb_mic_switch` → position for that machine
3. Button updates to show which machine has the mic

### HDMI CEC Control

If the Pi is connected to the monitor via HDMI, it can send CEC commands to switch inputs.

```typescript
interface CecController {
  switchInput(input: string): Promise<void>;  // e.g. "HDMI1", "HDMI2"
}
```

Uses `cec-client` (from `cec-utils` package) via child process. Triggered by focus changes or manual button press.

---

## Security Model

### TLS Certificate Infrastructure

On first startup, the hub generates a self-signed CA and server certificate, stored in `~/.omnideck/tls/`:

- **CA certificate** (`ca.crt`, `ca.key`): 4096-bit RSA, 10-year validity, CN=`OmniDeck CA`
- **Server certificate** (`server.crt`, `server.key`): 2048-bit RSA, signed by CA, 1-year validity, SANs include `localhost`, `omnideck.local`, and the machine hostname
- Server certs are auto-renewed when within 30 days of expiry
- CA fingerprint (SHA-256) is advertised via mDNS TXT records and exchanged during pairing

### Agent Pairing

1. User clicks "Pair New Agent" in the Hub web UI (Security page)
2. Hub generates a short-lived pairing code (`DECK-XXXX`, 6 alphanumeric characters, expires in 5 minutes)
3. User starts the agent on Mac/Windows — agent discovers the hub via mDNS (`_omnideck-hub._tcp`)
4. Agent prompts for the pairing code on the command line
5. Agent connects via `wss://` and sends a `pair_request` message with the code
6. Hub validates and consumes the code, registers the agent, and responds with:
   - A unique `agent_id` (UUID)
   - A long-lived authentication token (32-byte random hex)
   - The CA certificate PEM (for TLS pinning on future connections)
   - The CA fingerprint and hub name
7. Agent stores credentials in `~/.omnideck-agent/credentials.json` (mode 0600)
8. On subsequent connections, the agent sends an `authenticate` message with its token
9. Hub verifies the token hash against its registry (`~/.omnideck/agents.yaml`)

**Agent revocation**: The hub web UI lists all paired agents with last-seen timestamps. Revoking an agent invalidates its token immediately — the agent is disconnected and must re-pair.

**Future**: Native Mac/Windows apps can handle `omnideck://pair?hub=<address>&code=<code>` URIs for one-click pairing from the web UI.

### Transport Security

- **Agent ↔ Hub**: All WebSocket connections use TLS (`wss://` on port 9210). The agent pins the CA certificate received during pairing for future connections.
- **Web UI (browser)**: HTTP on port 9211 by default. HTTPS available on port 9443 but opt-in — the user must install the hub's CA certificate on their device first, then set `auth.tls_redirect: true` in config to enable automatic HTTP → HTTPS redirection. This avoids browser self-signed certificate warnings.
- The CA certificate is downloadable from the web UI at `/api/tls/ca.crt` (always accessible over HTTP).
- `OMNIDECK_HUB_URL` env var on the agent still works as an override. `wss://` = TLS, `ws://` = plain (dev mode).

### Web UI Password Protection

Optional password protection for the web interface:

1. Generate a bcrypt hash: `echo "mypassword" | npx tsx hub/scripts/hash-password.ts`
2. Store in `secrets.yaml`: `hub_password_hash: "$2a$10$..."`
3. Reference in config: `auth.password_hash: !secret hub_password_hash`
4. Hub serves a login page — sessions use HTTP-only cookies (in-memory, cleared on hub restart)
5. When no password is configured, the web UI is open (suitable for trusted LANs)

### Hub Discovery (mDNS)

The hub advertises as `_omnideck-hub._tcp` via Bonjour/mDNS with TXT records:
- `name`: Hub display name (configurable via `hub.name`, default `"OmniDeck"`)
- `fp`: CA certificate fingerprint (SHA-256, colon-separated hex)

Agents browse for this service on startup. If multiple hubs are found, the agent uses the first discovered. The `OMNIDECK_HUB_URL` env var bypasses discovery.

### Secret Management

- API tokens stored in `secrets.yaml`, separate from main config
- `secrets.yaml` should be gitignored
- Tokens are never logged or exposed via any API
- Agent credentials (`~/.omnideck-agent/credentials.json`) have restricted file permissions (0600)
- TLS private keys (`~/.omnideck/tls/*.key`) have restricted file permissions (0600)
- Pairing tokens are only sent once (during `pair_response`) — the hub stores only the SHA-256 hash

---

## Project Structure

```
omnideck/
├── hub/                            # Hub (TypeScript, Node.js)
│   ├── src/
│   │   ├── index.ts                # Entry point
│   │   ├── deck/                   # Stream Deck HID interface
│   │   │   ├── manager.ts          # DeckManager implementation
│   │   │   ├── virtual.ts          # VirtualDeck (future: touchscreen)
│   │   │   └── models.ts           # Device model definitions
│   │   ├── renderer/               # Button image rendering
│   │   │   ├── renderer.ts         # Compositor (sharp-based)
│   │   │   ├── icons.ts            # Icon loading and caching
│   │   │   └── text.ts             # Text layout helpers
│   │   ├── config/                 # YAML config loading
│   │   │   ├── loader.ts           # File reading, !secret resolution
│   │   │   ├── validator.ts        # Zod schema validation
│   │   │   └── watcher.ts          # Hot-reload via chokidar
│   │   ├── plugins/                # Plugin host
│   │   │   ├── host.ts             # Plugin lifecycle management
│   │   │   ├── types.ts            # Plugin, Action, StateProvider interfaces
│   │   │   └── builtin/            # First-party plugins
│   │   │       ├── home-assistant/
│   │   │       │   ├── index.ts
│   │   │       │   ├── actions.ts
│   │   │       │   ├── state.ts
│   │   │       │   ├── presets.ts
│   │   │       │   └── icons/      # HA-specific icons
│   │   │       ├── spotify/
│   │   │       ├── discord/
│   │   │       ├── slack/
│   │   │       ├── os-control/
│   │   │       └── core/           # Page nav, brightness, etc.
│   │   ├── server/                 # WebSocket server for agents
│   │   │   ├── server.ts           # Agent WS server (wss://, auth gating)
│   │   │   ├── protocol.ts         # Message types, serialization
│   │   │   ├── tls.ts              # TLS cert generation and management
│   │   │   ├── pairing.ts          # Pairing code generation, agent registry
│   │   │   └── discovery.ts        # mDNS advertisement with TXT records
│   │   ├── orchestrator/           # Intelligence layer
│   │   │   ├── orchestrator.ts     # Main orchestrator
│   │   │   ├── focus.ts            # Focus tracking
│   │   │   ├── media.ts            # Media routing
│   │   │   ├── presence.ts         # Device presence
│   │   │   ├── discord-mic.ts      # Discord mic switching
│   │   │   └── cec.ts              # HDMI CEC control
│   │   └── state/                  # Global state management
│   │       ├── store.ts            # Reactive state store
│   │       └── persistence.ts      # SQLite for persistent state
│   ├── package.json
│   ├── tsconfig.json
│   └── vitest.config.ts
│
├── agent/                          # Agent (Go)
│   ├── cmd/
│   │   └── omnideck-agent/
│   │       └── main.go             # Entry point
│   ├── internal/
│   │   ├── agent/                  # Core agent logic
│   │   │   ├── agent.go            # Lifecycle, reconnection
│   │   │   └── config.go           # TOML config loading
│   │   ├── ws/                     # WebSocket client
│   │   │   ├── client.go
│   │   │   └── protocol.go         # Message types (mirrors hub)
│   │   ├── commands/               # Command executor
│   │   │   ├── commander.go        # Interface
│   │   │   ├── commander_darwin.go
│   │   │   └── commander_windows.go
│   │   ├── state/                  # State streamer
│   │   │   ├── streamer.go
│   │   │   ├── streamer_darwin.go
│   │   │   └── streamer_windows.go
│   │   ├── discord/                # Local Discord RPC
│   │   │   └── rpc.go
│   │   ├── discovery/              # mDNS
│   │   │   └── mdns.go
│   │   └── tray/                   # System tray (optional)
│   │       ├── tray_darwin.go
│   │       └── tray_windows.go
│   ├── go.mod
│   └── go.sum
│
├── docs/                           # Documentation
│   ├── ARCHITECTURE.md             # This file
│   ├── PLAN.md                     # Original project plan (historical)
│   ├── plugin-guide.md             # How to write a plugin (future)
│   └── *.md                        # Research documents
│
├── config-examples/                # Example configurations
│   ├── minimal/                    # Bare minimum to get started
│   ├── home-automation/            # HA-focused setup
│   ├── developer/                  # Dev tools setup
│   └── multi-pc/                   # Multi-computer setup
│
├── scripts/                        # Build and deployment scripts
│   ├── build-agent.sh              # Compile Bun agent for all platforms
│   ├── build-plugins.sh            # Bundle plugin agent.ts files
│   ├── pi-setup.sh                 # Pi initial setup
│   └── install.sh                  # Install hub on Pi
│
├── deploy/
│   ├── omnideck-hub.service       # systemd service for hub
│   └── udev/
│       └── 50-stream-deck.rules    # udev rules for Stream Deck
│
├── plugins/                        # Standalone plugin packages
│   ├── os-control/                 # Reference migration (hub + agent sides)
│   │   ├── manifest.yaml
│   │   ├── hub.ts
│   │   └── agent.ts
│   └── bettertouchtool/            # Example third-party plugin (darwin)
│       ├── manifest.yaml
│       ├── hub.ts
│       └── agent.ts
│
└── packages/                       # Shared TypeScript packages (pnpm workspace)
    ├── agent-sdk/                  # @omnideck/agent-sdk — OmniDeck interface types
    │   └── src/
    │       ├── types.ts
    │       └── index.ts
    └── plugin-schema/              # @omnideck/plugin-schema — Zod manifest schemas
        └── src/
            ├── manifest.ts
            └── index.ts
```

---

## Developer Guide

### Toolchain Requirements

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 22+ (LTS) | Hub runtime |
| pnpm | 9+ | Hub package management (workspace) |
| Bun | latest | Agent runtime + compilation |

### System Dependencies (Pi)

The hub runs on a Raspberry Pi and requires these OS-level packages:

| Package | Purpose |
|---------|---------|
| `fontconfig` | Font discovery for `sharp`/libvips text rendering. Without it: `Cannot load default config file` errors. |

Install via: `sudo apt install fontconfig`

### Hub TypeScript Configuration

- **ESM-only**: `"type": "module"` in `package.json`. No CommonJS.
- **tsconfig target**: `ES2023`, **Module**: `Node16`, **Strict mode**: enabled
- **Dev runner**: `tsx watch src/index.ts`
- **Production build**: `tsup src/index.ts --format esm`

### Hub npm Dependencies

| Package | Purpose |
|---------|---------|
| `@elgato-stream-deck/node` | Stream Deck USB HID communication |
| `sharp` | Image compositing for button rendering (libvips, prebuilt ARM64 binaries) |
| `esbuild` | Bundles agent plugin code for distribution |
| `ws` | WebSocket server (agent connections) and client (HA API) |
| `yaml` (v2) | YAML 1.2 parsing with custom `!secret` tag support |
| `zod` | Schema validation for plugin configs and YAML structure |
| `chokidar` | Config file watching for hot-reload |
| `pino` | Structured JSON logging |
| `bonjour-service` | mDNS browse (discover agents) and advertise (let agents find hub) |
| `@peculiar/x509` | X.509 certificate generation for self-signed TLS |
| `bcryptjs` | Password hash verification for web UI authentication |

### Agent Dependencies

The agent has minimal npm dependencies:
- **Bun built-ins**: `Bun.spawn` for process execution, `fetch` for HTTP, `WebSocket` global
- **`@omnideck/agent-sdk`**: TypeScript types for the plugin OmniDeck interface
- **`@omnideck/plugin-schema`**: Zod schemas for manifest validation
- **`bonjour-service`**: mDNS browsing to discover the hub on the local network

Platform-specific logic uses shell commands:
- **Mac**: `osascript` for AppleScript, `ioreg` for idle time, `pmset` for sleep
- **Windows**: PowerShell via `exec()`

### Protocol

All hub ↔ agent communication uses WebSocket with JSON messages. Types are hand-maintained in `hub/src/server/protocol.ts` and mirrored in `agent/src/ws/protocol.ts`. Both sides are TypeScript so no codegen tooling is needed.

**Why JSON on the wire**: Human-debuggable with `wscat` or `jq`. Payloads are small (<1KB). The `shared/proto/` directory contains historical Protobuf definitions from the original Go agent and is no longer used.

### State Store

The central nervous system. Plugins write state, the renderer subscribes to changes.

```typescript
interface StateStore {
  // Plugins set state under their namespace
  set(pluginId: string, key: string, value: unknown): void;
  get(pluginId: string, key: string): unknown;
  getAll(pluginId: string): Map<string, unknown>;

  // Renderer/orchestrator subscribe to changes
  onChange(cb: (pluginId: string, key: string, value: unknown) => void): void;

  // Batch updates (suppress change events until commit)
  batch(fn: () => void): void;
}
```

Implementation: simple `EventEmitter`-based. No Redux, no Zustand, no middleware. When a plugin calls `state.set("home-assistant", "light.office", { state: "on", brightness: 80 })`, the store emits a change event. The renderer checks if any visible buttons depend on that key and re-renders only those.

### Developing Without a Stream Deck

Two mechanisms for hardware-free development:

**1. MockDeck** — A `DeckManager` implementation that:
- Logs key images to `~/.omnideck/data/mock-deck/` as PNG files
- Accepts key presses via stdin (type a key number + enter to simulate press)
- Enabled via `OMNIDECK_MOCK_DECK=1` environment variable or `--mock-deck` CLI flag

**2. Web Emulator** — A lightweight dev-only web page served by the hub:
- Shows the button grid as an HTML img grid at `http://localhost:9210/dev`
- Clicking a button simulates a key press
- Images update in real-time via WebSocket
- ~100 lines of HTML/JS, only served when `NODE_ENV=development`

Both implement the same `DeckManager` interface, so all hub code works identically with real hardware, mock, or emulator.

### Error Handling

**Plugin errors**:
- Actions should `throw` on failure. The plugin host wraps every `action.execute()` in try/catch.
- On action error: log the error, flash the button red briefly, continue running.
- Background task errors (e.g., HA WebSocket disconnect) are caught by the host and logged. The plugin is responsible for reconnection.
- A plugin that throws >10 errors in 60 seconds is automatically disabled with a warning log. It can be re-enabled by config reload.

**Button rendering errors**:
- If a state provider throws or returns invalid data, the button renders with a fallback: dimmed icon, "Error" label.
- Rendering never crashes the hub. Every render call is wrapped in try/catch.

**Agent errors**:
- Command execution failures return `{ success: false, error: "message" }` over the WebSocket.
- Agent disconnection: hub marks device offline, dims associated buttons, orchestrator updates focus state.
- Agent reconnection: automatic with exponential backoff (1s, 2s, 4s, 8s, max 30s).

### Logging

`pino` with structured JSON output.

- **Levels**: `debug`, `info`, `warn`, `error`
- **Default**: `info` in production, `debug` in development
- **Plugin loggers**: Each plugin gets a child logger with `{ plugin: "home-assistant" }` context
- **Agent logging**: Go stdlib `log/slog` with JSON handler, same levels
- **Sensitive data**: Never log tokens, secrets, or pairing codes

### Hot Reload

On config file change (detected by `chokidar`):

1. Re-read and validate all YAML files
2. **Validation fails** → log error with details, keep running with old config
3. **Validation passes** → diff against current config:
   - **Plugin configs changed** → call `plugin.onConfigChange(newConfig)` on affected plugins. If plugin doesn't implement `onConfigChange`, fall back to `destroy()` then `init()` (full plugin restart).
   - **Page/button configs changed** → update state store, re-render affected buttons
   - **Device configs changed** → update orchestrator's device list
4. Never restart the hub process. All changes applied in-place.

`onConfigChange` is **optional** in the plugin interface. Simple plugins don't implement it and get a clean restart. Plugins with expensive connections (HA WebSocket, Discord Gateway) implement it to surgically update without dropping their connection.

### Agent Configuration

Agent credentials are stored automatically during pairing in `~/.omnideck-agent/credentials.json`:

```json
{
  "agent_id": "a1b2c3d4-...",
  "token": "hex-encoded-32-byte-token",
  "hub_address": "wss://192.168.1.10:9210",
  "hub_name": "OmniDeck",
  "ca_cert": "-----BEGIN CERTIFICATE-----\n..."
}
```

This file is created during the pairing flow and should not be edited manually. To re-pair, delete it and restart the agent.

**Environment variables**:
- `OMNIDECK_HUB_URL`: Override hub address (skips mDNS discovery). Use `wss://` for TLS, `ws://` for dev mode.
- `OMNIDECK_HOSTNAME`: Override the agent's hostname (used for identification).

### Icons

**Icon set**: [Material Symbols & Icons](https://fonts.google.com/icons) (Google's current icon system, successor to Material Design Icons). MIT licensed, variable-weight SVGs, 3000+ icons.

**Icon references in config**: `"symbol:lightbulb"`, `"symbol:play_arrow"`, `"symbol:discord"` (prefix distinguishes from plugin icons and custom images).

**Pipeline**:
1. At hub startup, scan config for all referenced icon names
2. Render referenced SVGs to PNG at the deck's native key resolution (e.g., 96x96) via `sharp`
3. Cache rendered PNGs to `~/.omnideck/data/icon-cache/`
4. Plugins register their own icons (e.g., Spotify logo, Discord logo) via `registerIcons()`
5. Custom user icons go in `~/.omnideck/config/icons/` as PNG or SVG

### Testing

**Hub** (`vitest`):
- Unit tests for renderer, config loader, state store, plugin host, protocol serialization
- Integration tests using MockDeck (simulate button presses, verify rendered images)
- `pnpm test` / `pnpm test:watch`

**Agent** (Go stdlib `testing`):
- Unit tests for commander implementations (mock OS calls), protocol serialization, state streamer
- `go test ./...`

**No E2E tests initially** — manual testing with real hardware. Add E2E with web emulator later if needed.

### Build & Deployment

**Hub development**:
```bash
cd hub
pnpm install
pnpm dev                    # tsx watch src/index.ts
```

**Hub production build**:
```bash
cd hub
pnpm build                  # tsup → dist/index.js
node dist/index.js          # or via systemd
```

**Agent cross-compilation**:
```bash
# scripts/build-agent.sh
GOOS=darwin  GOARCH=arm64 go build -o dist/omnideck-agent-mac-arm64   ./cmd/omnideck-agent
GOOS=darwin  GOARCH=amd64 go build -o dist/omnideck-agent-mac-amd64   ./cmd/omnideck-agent
GOOS=windows GOARCH=amd64 go build -o dist/omnideck-agent-win-amd64.exe ./cmd/omnideck-agent
GOOS=linux   GOARCH=arm64 go build -o dist/omnideck-agent-linux-arm64 ./cmd/omnideck-agent
```

**Pi deployment**:
```bash
# On Pi
scp -r hub/ pi@omnideck.local:~/omnideck/hub/
ssh pi@omnideck.local "cd ~/omnideck/hub && pnpm install --prod && sudo systemctl restart omnideck-hub"
```

Future: proper install script and/or Docker image.

---

## Implementation Phases

### Phase 1: Core Loop (Week 1-2)

**Goal**: Press a Stream Deck button → see it do something.

- Hub skeleton: entry point, config loader (minimal YAML), state store
- Stream Deck HID: connect, read key presses, write solid-color images
- Button renderer: solid background + text label → JPEG
- `omnideck-core` plugin: `change_page` action, basic page navigation
- Config: minimal YAML with pages and labeled/colored buttons
- Run on Pi, confirm HID works with udev rules

**Deliverable**: Deck shows colored buttons with labels, page navigation works.

### Phase 2: Plugin System + OS Control (Week 2-3)

**Goal**: Plugins work. Buttons can control a remote machine.

- Plugin host: load, init, register actions/state/presets
- Agent skeleton: WebSocket client, connect to hub, command executor
- Mac agent: `launch_app`, `set_volume`, `send_keystroke`, `get_active_window`
- Windows agent: same commands, Windows implementations
- `os-control` plugin: routes commands to agents
- mDNS discovery for agents
- Pairing flow (basic: manual shared secret in config)
- State streaming: agent pushes active window, idle time

**Deliverable**: Press button → app launches on Mac. Button shows active window title.

### Phase 3: Home Assistant (Week 3-4)

**Goal**: Full HA integration with rich button visuals.

- `home-assistant` plugin: WebSocket client, entity state subscription
- State providers: domain-specific button rendering (lights, switches, sensors, etc.)
- Presets: `light_toggle`, `switch_toggle`, `scene_activate`
- Icon set: domain-specific icons
- Conditional button states (on/off visuals, brightness display)

**Deliverable**: HA entity buttons with live state, toggle on press.

### Phase 4: Spotify + Media (Week 4-5)

**Goal**: Now playing display, playback controls, device-aware routing.

- `spotify` plugin: OAuth token management, Web API client
- Playback state polling, device list
- Album art fetching and rendering on button
- Play/pause, skip, volume controls
- Media router in orchestrator: route to active Spotify device
- Progress bar rendering on now-playing button

**Deliverable**: Album art on button, play/pause works, controls follow active device.

### Phase 5: Orchestration (Week 5-6)

**Goal**: Smart multi-computer behavior.

- Focus tracker: idle-time based focus detection
- Auto page switching on focus change
- Presence manager: dim offline device buttons
- Discord plugin (basic): local RPC integration in agents, voice state detection
- Discord mic switch: HA USB switch automation
- HDMI CEC: input switching via `cec-client`

**Deliverable**: Focus switches between machines. Mic follows Discord voice. Monitor input switches.

### Phase 6: Discord + Slack Full Integration (Week 6-7)

**Goal**: Rich Discord and Slack button content.

- Discord bot: voice channel member list, user avatars on buttons
- Discord: mute/deafen toggle, volume per user
- Slack plugin: unread counts as badges, DM indicators
- Badge rendering on buttons

**Deliverable**: Discord voice users on buttons, Slack unread badge.

### Phase 7: Polish + Config Tooling (Week 7-8)

**Goal**: Production-ready.

- Hot-reload config on file change
- Robust error handling and graceful degradation
- Auto-start via systemd
- Agent auto-update mechanism
- Config validation with helpful error messages
- Example config packs
- Plugin documentation and guide for third-party authors

**Deliverable**: Reliable system that starts on boot, handles failures gracefully, and is documented for extension.

---

## Future Roadmap

Planned but not in initial scope:

### Virtual Deck (Touchscreen)

A `VirtualDeck` implementation of the `DeckManager` interface that renders buttons to a web-based touch UI (served by the hub) or a native UI on the Magedok T101f touchscreen.

- Same plugin system, same config format, same button rendering
- Additional capabilities: arbitrary grid sizes, non-square buttons, sliders, custom widgets
- Displayed via Chromium kiosk mode on the touchscreen or any browser

### Web Configuration UI

A browser-based visual editor for OmniDeck configuration.

- View current deck layout with live button states
- Drag-and-drop button arrangement
- Visual button editor (icon picker, color picker, action selector)
- Plugin browser with preset gallery
- Reads/writes the same YAML config files
- Served by the hub at `http://omnideck.local:9210/config`

### Additional Plugin Ideas

- **OBS Studio**: Scene switching, recording control, streaming indicators
- **GitHub**: PR count badges, CI status indicators
- **Calendar**: Next meeting countdown, join meeting button
- **System Monitor**: CPU/RAM/temp display from agents
- **Philips Hue**: Direct Hue bridge control (bypassing HA)
- **Audio Mixer**: Per-application volume control on Windows (WASAPI)
- **Clipboard**: Shared clipboard between machines
- **Screenshot**: Capture and display recent screenshot on button

### Multi-Deck Support

Multiple physical Stream Decks and/or virtual decks, each with their own page sets but shared state and plugins.

### Community Plugin Registry

An npm-like registry for third-party OmniDeck plugins, installable via CLI.
