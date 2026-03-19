# Button Config UI Redesign — Implementation Plan

> Stream Deck-style plugin browser + contextual button editor with schema-driven forms,
> template variable interpolation, plugin health awareness, and meta-actions.

---

## Table of Contents

1. [Layout](#1-layout)
2. [Terminology & Data Model](#2-terminology--data-model)
3. [Schema Strategy](#3-schema-strategy)
4. [Template Variable Interpolation](#4-template-variable-interpolation)
5. [Plugin Health Status](#5-plugin-health-status)
6. [Core Meta-Actions](#6-core-meta-actions)
7. [Preset Simplification](#7-preset-simplification)
8. [API Changes](#8-api-changes)
9. [Component Architecture](#9-component-architecture)
10. [UX Flows](#10-ux-flows)
11. [Button Config Editor Detail](#11-button-config-editor-detail)
12. [Implementation Phases](#12-implementation-phases)
13. [Open Questions](#13-open-questions)

---

## 1. Layout

Stream Deck-style three-zone layout:

```
+-------------------------------+-------------------+
|                               |  Plugin Browser   |
|      Deck Grid Preview        |  [Search...]      |
|      (live button states)     |  > Home Assistant  |
|                               |  > Sound           |
|                               |  > Core            |
+-------------------------------+-------------------+
|                                                   |
|         Button Config Editor (drawer)             |
|                                                   |
+---------------------------------------------------+
```

- CSS Grid: `grid-template-columns: 1fr 300px; grid-template-rows: 1fr auto;`
- Bottom editor slides up when a button is selected (~300-350px).
- Plugin browser is scrollable, always visible.
- Deck grid shows live-rendered button previews.

---

## 2. Terminology & Data Model

| Term | Definition |
|------|-----------|
| **Plugin** | A registered module (e.g., `home-assistant`, `sound`, `core`). Contains Actions, State Providers, and Presets. |
| **Action** | Something triggered by a button press. Has typed config fields (a Zod params schema). e.g., HA `toggle`, Core `change_page`, Core `multi_action`. |
| **State Provider** | Supplies dynamic display data. Can provide Mustache template variables (`{{brightness_percent}}`) and dynamic icons. e.g., `light_state`, `volume_level`. |
| **Preset** | Pre-packaged button config: references an Action + State Provider + default appearance. e.g., "Light" = toggle action + light_state provider + lightbulb icon + label=`{{brightness_percent}}`. **A Preset owns no param schema of its own** — its params are the union of its Action's + State Provider's params. |

### Key distinction: "action" (concept) vs "action identifier" (wire format)

The `action` field in ButtonConfig (e.g., `"home-assistant.toggle"`) is the **qualified action identifier** sent across the wire. The Action (capital-A) is the registered object with an `id`, `name`, `paramsSchema`, and `execute()` method.

---

## 3. Schema Strategy

### Goal

Single source of truth: Zod schemas define both validation AND UI rendering hints.
No parallel `paramsUISchema` to maintain. Schemas are shared between backend and frontend
via the pnpm workspace.

### Approach: Zod + `field()` metadata helper

```typescript
// In @omnideck/plugin-schema
import { z } from "zod";

interface FieldMeta {
  label: string;
  description?: string;
  fieldType?: "ha_entity" | "agent" | "page" | "icon" | "color"
            | "action_list" | "condition";
  domain?: string;       // for ha_entity — filter by HA domain
  placeholder?: string;
  group?: string;        // visual grouping in the editor
}

// Attaches metadata to a Zod schema node via a symbol property
const FIELD_META = Symbol.for("omnideck.fieldMeta");

function field<T extends z.ZodType>(schema: T, meta: FieldMeta): T {
  (schema as any)[FIELD_META] = meta;
  return schema;
}

function getFieldMeta(schema: z.ZodType): FieldMeta | undefined {
  return (schema as any)[FIELD_META];
}
```

### Plugin authors define schemas like:

```typescript
const ToggleParamsSchema = z.object({
  entity_id: field(z.string(), {
    label: "Entity",
    fieldType: "ha_entity",
    description: "The entity to toggle",
  }),
});
```

### Catalog extraction utility

A utility function walks a Zod object schema and produces a JSON-serializable
descriptor for the frontend:

```typescript
interface CatalogField {
  key: string;
  zodType: "string" | "number" | "boolean" | "enum" | "array" | "object";
  required: boolean;
  default?: unknown;
  enumValues?: string[];
  // From FieldMeta:
  label: string;
  description?: string;
  fieldType?: string;
  domain?: string;
  placeholder?: string;
  group?: string;
  // From Zod checks:
  min?: number;
  max?: number;
}

function extractFields(schema: z.ZodObject<any>): CatalogField[] { ... }
```

This runs server-side when building the catalog API response. The frontend
receives `CatalogField[]` and renders form fields accordingly.

### Frontend validation

The frontend can also `import { z } from "zod"` (add zod to hub/web deps) and
import the shared schema package for client-side validation before submit.
However, for the initial implementation, the JSON-serialized `CatalogField[]`
is sufficient — the backend always validates on save anyway.

Later: if we want live client-side validation, the frontend can import the
actual Zod schema objects from `@omnideck/plugin-schema` (since hub/web is
a workspace member).

### Migration path

Current state: plugins cast `params as { entity_id: string }` inline.

Migration: replace each cast with a proper Zod schema + `field()` metadata.
The `execute()` method calls `schema.parse(params)` for runtime validation.
The schema is also used to generate the catalog.

---

## 4. Template Variable Interpolation

### Syntax: Mustache `{{var}}`

Using double-brace Mustache syntax. This avoids conflicts with JSON, YAML, and
CSS single braces. We do NOT need full Mustache (no partials, sections, lambdas) —
just simple variable substitution.

Implementation: a small `interpolate(template, vars)` function:

```typescript
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match);
}
```

If the user needs a literal `{{`, they can write `\{\{` (or we document that
unmatched variables are left as-is, which is usually sufficient).

### State provider changes

`StateProviderDefinition.resolve()` return type changes from `ButtonStateResult`
to `StateProviderResult`:

```typescript
interface StateProviderResult {
  /** The visual state (icon, background, progress, etc.) */
  state: ButtonStateResult;
  /** Template variables available for label interpolation */
  variables: Record<string, string>;
}
```

State providers declare their available variables as static metadata:

```typescript
interface TemplateVariable {
  key: string;         // "brightness_percent"
  label: string;       // "Brightness %"
  example?: string;    // "75"
}
```

This metadata is sent to the frontend so the editor can show available
variables as autocomplete/chips when editing label fields.

### Rendering flow

In `resolveButtonState()`:

1. Get state provider result (includes `state` + `variables`).
2. Merge state onto the button state (as before).
3. If the user has set explicit labels, interpolate them:
   ```
   if (button.label) state.label = interpolate(button.label, result.variables);
   if (button.top_label) state.topLabel = interpolate(button.top_label, result.variables);
   ```
4. Explicit button-level icon/background still override state provider values.

---

## 5. Plugin Health Status

Plugins report their configuration health during init and on config change.

```typescript
interface PluginHealth {
  status: "ok" | "misconfigured" | "error" | "degraded";
  message?: string;           // "Missing API token"
  configKey?: string;         // "plugins.home-assistant.token"
  settingsUrl?: string;       // "/settings/plugins/home-assistant"
}
```

Stored on the plugin host, exposed via the catalog API.

### UI behavior

- **Plugin Browser**: Misconfigured plugins show a ⚠️ badge. Presets/actions are
  visible but dimmed. Tooltip shows the message.
- **Button Config Editor**: If the assigned action's plugin is misconfigured,
  a yellow banner appears at top: "Home Assistant is not configured. Missing: API
  token. [Configure →]". The link navigates to the settings page.
- **Deck Grid**: Buttons using a misconfigured plugin render with a warning
  overlay (e.g., small ⚠️ badge in corner, or dimmed).

---

## 6. Core Meta-Actions

The `omnideck-core` plugin provides meta-actions for composition.

### `multi_action`

Executes a list of actions in sequence or parallel.

```typescript
const MultiActionSchema = z.object({
  mode: field(z.enum(["sequential", "parallel"]).default("sequential"), {
    label: "Execution Mode",
  }),
  actions: field(z.array(ActionRefSchema), {
    label: "Actions",
    fieldType: "action_list",
  }),
});

const ActionRefSchema = z.object({
  action: z.string(),                        // qualified action ID
  params: z.record(z.unknown()).optional(),   // action-specific params
});
```

**UI**: The `action_list` field type renders an ordered list. Each row has an
action picker (dropdown of all available actions from the catalog) and inline
param fields for that action. Add/remove/reorder via buttons and drag handles.

**Nesting cap**: The UI caps `action_list` nesting at 2 levels. A multi_action
can contain actions, but the inner actions cannot themselves be multi_actions.
(Backend doesn't enforce this — just a UI guard.)

### `if_then_else`

Conditional action based on state provider output.

```typescript
const IfThenElseSchema = z.object({
  condition: field(ConditionSchema, {
    label: "Condition",
    fieldType: "condition",
  }),
  then_actions: field(z.array(ActionRefSchema), {
    label: "Then",
    fieldType: "action_list",
  }),
  else_actions: field(z.array(ActionRefSchema).optional(), {
    label: "Else",
    fieldType: "action_list",
  }),
});

const ConditionSchema = z.object({
  provider: z.string(),         // qualified state provider ID
  variable: z.string(),         // template variable key
  operator: z.enum(["==", "!=", ">", "<", ">=", "<=", "contains"]),
  value: z.string(),
});
```

**UI**: The `condition` field type renders a row: state provider picker →
variable picker (from that provider's template variables) → operator dropdown →
value input.

---

## 7. Preset Simplification

### Current design

```typescript
interface ButtonPreset {
  id: string;
  name: string;
  defaults: { action?, icon?, label?, background?, stateProvider? };
  mapParams(params): { actionParams?, stateParams? };
}
```

The `mapParams` function translates "preset params" (what the user fills in) into
separate action params and state params. This is an unnecessary indirection layer.

### New design

A Preset is just a reference to an Action + State Provider + default appearance.
It owns no param schema. The user fills in the action's params and the state
provider's params directly (deduplicated — if both need `entity_id`, show it once).

```typescript
interface ButtonPreset {
  id: string;
  name: string;
  description?: string;
  category?: string;
  icon?: string;              // display icon in the browser tree

  /** Which action this preset uses (by id within the same plugin) */
  action?: string;
  /** Which state provider this preset uses (by id within the same plugin) */
  stateProvider?: string;

  /** Default appearance values */
  defaults: {
    icon?: string;
    label?: string;           // can use Mustache: "{{brightness_percent}}"
    topLabel?: string;
    background?: string;
    iconColor?: string;
    labelColor?: string;
    topLabelColor?: string;
  };

  /**
   * Shared params: when the action and state provider share a param key
   * (e.g., both need entity_id), fill it once. This mapping tells the system
   * which params to forward to which consumer.
   *
   * If omitted, all user params are forwarded to both action and state provider.
   * This works for the common case where both need the same entity_id.
   */
  sharedParams?: string[];    // e.g., ["entity_id"]
}
```

### How the UI composes the param form for a preset

1. Look up the preset's `action` → get its `paramsSchema`.
2. Look up the preset's `stateProvider` → get its `paramsSchema`.
3. Take the union of both schemas' fields, deduplicated by `key`.
   - If both have `entity_id`, show it once.
   - If the action has `temperature` and the provider doesn't, show it.
4. Render the combined fields in the editor.

### How `resolveButton` changes

When a button has `preset: "home-assistant.light"`:

1. Look up preset → get `action: "toggle"`, `stateProvider: "light_state"`.
2. The button's `params` are forwarded to both the action and state provider.
   (No `mapParams` transformation needed.)
3. Apply `defaults` for any appearance fields the button doesn't override.

---

## 8. API Changes

### New: `GET /api/status/plugin-catalog`

Returns the full catalog for the frontend plugin browser.

```json
{
  "plugins": [
    {
      "id": "home-assistant",
      "name": "Home Assistant",
      "version": "2.0.0",
      "icon": "ms:home",
      "health": {
        "status": "ok"
      },
      "presets": [
        {
          "qualifiedId": "home-assistant.light",
          "name": "Light",
          "description": "Toggle light with brightness display",
          "category": "Lighting",
          "icon": "ms:lightbulb",
          "action": "home-assistant.toggle",
          "stateProvider": "home-assistant.light_state",
          "defaults": {
            "icon": "ms:lightbulb",
            "label": "{{brightness_percent}}",
            "topLabel": "{{device_name}}"
          }
        }
      ],
      "actions": [
        {
          "qualifiedId": "home-assistant.toggle",
          "name": "Toggle",
          "description": "Toggle any entity on/off",
          "icon": "ms:toggle-on",
          "fields": [
            {
              "key": "entity_id",
              "zodType": "string",
              "required": true,
              "label": "Entity",
              "fieldType": "ha_entity"
            }
          ]
        }
      ],
      "stateProviders": [
        {
          "qualifiedId": "home-assistant.light_state",
          "name": "Light State",
          "icon": "ms:lightbulb",
          "providesIcon": true,
          "templateVariables": [
            { "key": "brightness_percent", "label": "Brightness %", "example": "75" },
            { "key": "device_name", "label": "Device Name", "example": "Living Room" },
            { "key": "state", "label": "State", "example": "on" },
            { "key": "rgb_hex", "label": "Color Hex", "example": "#ff9900" }
          ],
          "fields": [
            {
              "key": "entity_id",
              "zodType": "string",
              "required": true,
              "label": "Entity",
              "fieldType": "ha_entity",
              "domain": "light"
            }
          ]
        }
      ]
    }
  ]
}
```

Implementation:
- Add `getAllCatalog()` to `PluginHost` in `hub/src/plugins/host.ts`.
- Uses `extractFields()` to serialize Zod schemas.
- Wire through a new route in `hub/src/web/routes/status.ts`.

### Existing endpoints (no changes)

- `GET /api/ha/entities` — used by EntityPicker component.
- `GET /api/ha/domains` — used for domain filtering.
- `PUT /api/config/pages/:id` — saves button configs.
- `GET /api/status/presets` — can be deprecated once new UI ships.

---

## 9. Component Architecture

```
PageEditor (redesigned)
├── DeckGrid                             // left panel, supports drop targets
│   └── DeckGridButton[]                 // each: live preview + drop zone + selection
├── PluginBrowser                        // right panel, scrollable
│   ├── PluginBrowserSearch              // filters tree in real-time
│   └── PluginBrowserTree
│       └── PluginBrowserPlugin[]        // collapsible, one per plugin
│           ├── HealthBadge              // ⚠️ if misconfigured, with tooltip
│           ├── Section: "Presets"
│           │   └── BrowserItem[]        // draggable, shows icon + name
│           ├── Section: "Actions"
│           │   └── BrowserItem[]
│           └── Section: "State Providers"
│               └── BrowserItem[]
└── ButtonConfigEditor                   // bottom drawer
    ├── EditorHeader                     // "Light (Home Assistant)" + 🗑 clear button
    ├── PluginHealthBanner               // yellow bar if plugin misconfigured
    ├── ActionTabBar                     // [ Press ] [ Long Press ]
    ├── ParamsSection                    // combined action + state provider params
    │   └── ParamField[]                 // one per schema field
    │       ├── EntityPicker             // for fieldType "ha_entity"
    │       ├── IconPicker               // for fieldType "icon"
    │       ├── ColorField               // for fieldType "color"
    │       ├── ActionListEditor         // for fieldType "action_list"
    │       │   └── ActionRow[]          // each: action picker + inline params
    │       └── ConditionEditor          // for fieldType "condition"
    ├── StateProviderSection             // if state provider assigned
    │   └── TemplateVariableChips        // clickable {{variable}} chips
    ├── AppearanceSection                // universal fields
    │   ├── BackgroundColorField
    │   ├── IconField                    // with "dynamic icon" indicator
    │   ├── LabelFieldWithVariables      // autocomplete from templateVariables
    │   ├── TopLabelFieldWithVariables
    │   └── Color pickers for each text field
    └── AdvancedSection (collapsed)      // raw YAML via CodeMirror
```

### New components to build

| Component | Description |
|-----------|-------------|
| `PluginBrowser` | Fetches catalog, renders searchable tree. Items draggable via HTML5 DnD. |
| `BrowserItem` | Single draggable item. `dataTransfer` carries `{ type: "preset"\|"action"\|"stateProvider", qualifiedId }`. |
| `ButtonConfigEditor` | Replaces `ButtonConfigPanel`. Dynamically renders sections based on what's assigned. |
| `ParamField` | Generic field renderer. Switch on `fieldType` or `zodType`. |
| `EntityPicker` | Searchable dropdown using `/api/ha/entities?domain=X`. Shows entity name, ID, state. |
| `LabelFieldWithVariables` | Text input. On `{{` keystroke, shows autocomplete popup of available template vars. |
| `TemplateVariableChips` | Row of clickable chips: `{{brightness_percent}}`, `{{device_name}}`, etc. Click inserts into focused label field. |
| `ActionListEditor` | For multi_action. Ordered list of action rows. Add/remove/reorder. Each row: action picker + inline params. Cap nesting at 2. |
| `ConditionEditor` | For if_then_else. Provider picker → variable picker → operator → value. |
| `PluginHealthBanner` | Yellow warning bar with message and settings link. |

### Components to modify

| Component | Changes |
|-----------|---------|
| `DeckGrid` / `ButtonGrid` | Add `onDragOver`/`onDrop` for drag-from-browser. Visual feedback on dragover. |
| `PageEditor` | Complete layout restructure to CSS Grid with three zones. |

### Components to retire

| Component | Replaced by |
|-----------|-------------|
| `ButtonConfigPanel` | `ButtonConfigEditor` |
| `PresetPicker` | `PluginBrowser` (presets are items in the tree) |

### New hooks

| Hook | Purpose |
|------|---------|
| `usePluginCatalog()` | Fetches + caches `/api/status/plugin-catalog`. Returns `{ catalog, loading, error }`. |

### Touch device support

HTML5 drag-and-drop has poor mobile/touch support. On the Pi touchscreen or
mobile browsers, the primary workflow is **click-to-assign**:

1. Tap a button slot in the grid (selects it, editor opens).
2. Tap an item in the plugin browser → it's assigned to the selected slot.
3. Fill in params, save.

Drag-and-drop is a progressive enhancement for desktop browsers only.

---

## 10. UX Flows

### Flow 1: Assign preset via drag (desktop)

1. Browse plugins in right sidebar. Expand "Home Assistant > Presets".
2. Drag "Light" onto grid slot [2,1].
3. Bottom editor opens. Shows Entity field (from the action + state provider's
   shared `entity_id` param). User picks `light.living_room`.
4. Appearance section pre-filled from preset defaults.
   - Label: `{{brightness_percent}}` with chips showing available vars.
   - Top label: `{{device_name}}`.
   - Icon: "ms:lightbulb" with note "State provider controls icon dynamically."
5. User tweaks label color, saves.

### Flow 2: Assign preset via click (touch-friendly)

1. Tap empty grid slot (selects it, editor says "No action assigned").
2. Tap "Light" in the plugin browser. Assigned to selected slot.
3. Same editor flow as Flow 1.

### Flow 3: Direct action + state provider (power user)

1. Tap empty slot. Editor opens.
2. Tap `home-assistant.toggle` (action) in the browser. Assigned.
3. Editor shows action params: `entity_id` picker.
4. User optionally taps "Add State Provider" in the State section, picks
   `home-assistant.entity_state`. Its params appear (also `entity_id` — already
   filled, shared).
5. Configures appearance manually. Saves.

### Flow 4: Multi-Action

1. Drag `Core > Multi Action` onto a button.
2. Editor shows "Execution Mode" dropdown + "Actions" list with "Add action" button.
3. User adds actions one by one: each row has action picker + inline params.
4. Reorder with drag handles. Cap at 2 nesting levels.
5. Save.

### Flow 5: Plugin misconfigured

1. Expand "Home Assistant" in browser. Header shows ⚠️ "Not configured".
2. Presets/actions visible but dimmed.
3. Drag "Light" onto a button anyway.
4. Editor shows yellow banner: "Home Assistant is not connected. Missing: API
   token. [Configure →]".
5. Button in deck grid also shows warning overlay.

### Flow 6: Edit existing button

1. Tap an occupied button in the grid.
2. Editor opens pre-populated with current config.
3. Modify, save.

### Flow 7: Replace existing assignment

1. Button already has a Light preset.
2. Drag a different preset/action onto it.
3. Confirmation: "Replace current configuration?"
4. On confirm, editor updates. Compatible field values preserved (e.g., if both
   need `entity_id` and it was already set).

### Flow 8: Configure long-press

1. Select a button that already has a Light preset assigned.
2. In the editor, click the "Long Press" tab.
3. Tab shows "No long-press action. [Add Action]" (or shows the preset default
   if the Light preset specifies one, e.g., `turn_on` with full brightness).
4. User clicks "Add Action" → plugin browser filters to actions. User picks
   `home-assistant.turn_on`.
5. Param fields appear: `entity_id` (pre-filled from primary action), `brightness`
   (number input). User sets brightness to 255.
6. Save. YAML now includes `long_press_action` and `long_press_params`.

### Flow 9: Dynamic icon override

1. Assign Light preset. Icon field shows "ms:lightbulb" with note:
   "Controlled by Light State — sets icon dynamically based on entity state."
2. User sets an explicit icon → note changes: "Overriding state provider icon."
3. Clearing the icon field → returns to dynamic behavior.

---

## 11. Button Config Editor Detail

### Section layout

All sections stacked vertically in a scrollable pane (Stream Deck style).
Grouped with collapsible headers.

### Section: Params

Shows the combined params from the assigned action + state provider, deduplicated.

For each field, renders `ParamField` based on `CatalogField`:
- `zodType: "string"` + no `fieldType` → text input
- `zodType: "string"` + `fieldType: "ha_entity"` → EntityPicker
- `zodType: "string"` + `fieldType: "icon"` → IconPicker (emoji + material symbols)
- `zodType: "string"` + `fieldType: "color"` → color picker
- `zodType: "string"` + `fieldType: "page"` → page dropdown (from config)
- `zodType: "string"` + `fieldType: "agent"` → agent/device dropdown
- `zodType: "number"` → number input (with min/max/step from schema)
- `zodType: "boolean"` → toggle switch
- `zodType: "enum"` → dropdown/select with `enumValues`
- `fieldType: "action_list"` → ActionListEditor
- `fieldType: "condition"` → ConditionEditor

### Section: State Provider

Shows if a state provider is assigned (either via preset or manually).

- Provider name and icon.
- Template variable chips: `{{brightness_percent}}`, `{{device_name}}`, etc.
  Each chip is clickable — inserts the variable at cursor position in the
  last-focused label field.
- "Remove" button to detach the state provider.
- "Change" button to pick a different one.
- If no provider assigned: "Add State Provider" button that opens the browser
  filtered to state providers.

### Section: Appearance

Universal fields for every button:

- **Background**: Color picker. Default from preset or `#000000`.
- **Icon**: Icon picker (emoji + MS combined). If state provider has
  `providesIcon: true`, show info text below the field. Setting an explicit
  icon is always allowed (overrides dynamic).
- **Icon Color**: Color picker. Only enabled when icon starts with `ms:`.
- **Label (bottom)**: Text input with Mustache autocomplete. On typing `{{`,
  show dropdown of available template variables from the state provider.
- **Label Color**: Color picker.
- **Top Label**: Same as label, with Mustache autocomplete.
- **Top Label Color**: Color picker.
- **Opacity**: Slider 0–1.

### Section: Advanced (collapsed by default)

- Raw YAML view (CodeMirror) of the button config.
- "Apply" button to parse YAML and overwrite.
- Target device override field (for multi-agent setups).

### How the editor builds `ButtonConfig` on save

**Preset mode** (most common):
```yaml
pos: [2, 1]
preset: home-assistant.light
params:
  entity_id: light.living_room
# Appearance overrides (only if user changed from preset defaults):
label: "{{brightness_percent}}"
background: "#92400e"
```

**Direct action mode**:
```yaml
pos: [3, 0]
action: home-assistant.toggle
params:
  entity_id: switch.desk_fan
state:
  provider: home-assistant.entity_state
  params:
    entity_id: switch.desk_fan
icon: ms:mode-fan
label: Fan
```

**Multi-Action mode**:
```yaml
pos: [0, 2]
action: core.multi_action
params:
  mode: sequential
  actions:
    - action: home-assistant.toggle
      params: { entity_id: light.office }
    - action: sound.volume_set
      params: { target: MacBook, level: 50 }
icon: ms:playlist-play
label: "Work Mode"
```

---

## 12. Implementation Phases

### Phase 1: Schema infrastructure

**Files**: `packages/plugin-schema/src/field.ts` (new), `hub/src/plugins/types.ts`

- Create `field()` helper, `FieldMeta` interface, `FIELD_META` symbol.
- Create `extractFields()` utility that walks a `z.ZodObject` and produces
  `CatalogField[]`.
- Create `TemplateVariable` type.
- Export everything from `@omnideck/plugin-schema`.
- Update `ActionDefinition`, `StateProviderDefinition`, `ButtonPreset` interfaces
  with new fields (description, icon, name, templateVariables, providesIcon, etc.).
- Change `StateProviderDefinition.resolve()` return type to `StateProviderResult`
  (with `state` + `variables`).

### Phase 2: Migrate plugins to real schemas

**Files**: All plugin files in `hub/src/plugins/builtin/`

- Replace all `params as { ... }` casts with proper Zod schemas + `field()` metadata.
- Each action gets a `paramsSchema` using the new schema infrastructure.
- Each state provider gets a `paramsSchema`, `name`, `description`, `icon`,
  `providesIcon`, and `templateVariables`.
- Update `resolve()` methods to return `{ state, variables }`.
- Add plugin health reporting: each plugin's `init()` checks for required config
  and reports `PluginHealth`.

### Phase 3: Preset simplification

**Files**: `hub/src/plugins/types.ts`, `hub/src/plugins/builtin/*/presets.ts`,
`hub/src/hub.ts`

- Refactor `ButtonPreset` to reference action ID + state provider ID + defaults.
  Remove `mapParams`.
- Update preset definitions in all plugins.
- Update `resolveButton()` in `hub.ts`: look up preset → get action + state
  provider → forward user params directly to both.

### Phase 4: Template interpolation

**Files**: `hub/src/hub.ts` (resolveButtonState), `hub/src/renderer/renderer.ts`

- Add `interpolate(template, vars)` using Mustache `{{var}}` syntax.
- Update `resolveButtonState()`:
  - Call state provider, get `{ state, variables }`.
  - Merge state onto button state.
  - Interpolate user-set labels using variables.
- Update preset defaults to use `{{var}}` syntax in label/topLabel.

### Phase 5: Catalog API

**Files**: `hub/src/plugins/host.ts`, `hub/src/web/routes/status.ts`

- Add `getAllCatalog()` method to `PluginHost`.
- Uses `extractFields()` to serialize action/provider schemas.
- New route: `GET /api/status/plugin-catalog`.
- Include plugin health in response.

### Phase 6: Frontend API layer

**Files**: `hub/web/package.json`, `hub/web/src/lib/api.ts`,
`hub/web/src/hooks/usePluginCatalog.ts` (new)

- Add `zod` and `@omnideck/plugin-schema` to web deps.
- Define `PluginCatalog` TypeScript interfaces.
- Add `api.status.pluginCatalog()` method.
- Create `usePluginCatalog()` hook.

### Phase 7: Plugin Browser

**Files**: `hub/web/src/components/PluginBrowser.tsx` (new),
`hub/web/src/components/BrowserItem.tsx` (new)

- Searchable, collapsible tree of plugins.
- Each plugin: Presets → Actions → State Providers sections.
- Items are draggable (HTML5 DnD, desktop) and clickable (touch).
- Health badges on misconfigured plugins.

### Phase 8: ParamField + specialized editors

**Files**: `hub/web/src/components/ParamField.tsx` (new),
`hub/web/src/components/EntityPicker.tsx` (new),
`hub/web/src/components/LabelFieldWithVariables.tsx` (new),
`hub/web/src/components/TemplateVariableChips.tsx` (new)

- Generic `ParamField` that switches on `fieldType`/`zodType`.
- `EntityPicker`: searchable dropdown via `/api/ha/entities`.
- `LabelFieldWithVariables`: text input with `{{` autocomplete popup.
- `TemplateVariableChips`: clickable chips.

### Phase 9: ButtonConfigEditor

**Files**: `hub/web/src/components/ButtonConfigEditor.tsx` (new)

- Bottom drawer with all sections (Params, State Provider, Appearance, Advanced).
- Dynamic: sections change based on what's assigned.
- Health banner when plugin is misconfigured.
- Save/cancel actions.

### Phase 10: ActionListEditor + ConditionEditor

**Files**: `hub/web/src/components/ActionListEditor.tsx` (new),
`hub/web/src/components/ConditionEditor.tsx` (new)

- For Multi-Action: ordered list of action rows with add/remove/reorder.
  Cap nesting at 2 levels.
- For If-Then-Else: provider picker → variable → operator → value.

### Phase 11: Core meta-actions (backend)

**Files**: `hub/src/plugins/builtin/core/`

- Implement `multi_action` and `if_then_else` action definitions.
- Sequential execution: loop through actions, await each.
- Parallel execution: `Promise.all` the action calls.
- If-then-else: evaluate condition by calling state provider, checking variable.

### Phase 12: PageEditor layout + integration

**Files**: `hub/web/src/pages/PageEditor.tsx`

- Restructure to CSS Grid three-zone layout.
- Wire DeckGrid drop targets (onDragOver/onDrop).
- Wire click-to-assign flow.
- Selection state management.
- Save flow: build ButtonConfig from editor state, PUT to API.

### Phase 13: Long-press support

**Files**: `hub/src/plugins/types.ts`, `hub/src/plugins/builtin/*/presets.ts`,
`hub/web/src/components/ButtonConfigEditor.tsx`

- Add `longPressAction` and `longPressDefaults` to `ButtonPreset` interface.
- Update preset definitions where appropriate (e.g., Light long-press = full brightness).
- Add Press/Long Press tab bar to `ButtonConfigEditor`.
- Long Press tab: action picker + param fields (no state/appearance — shares primary).
- Save produces `long_press_action` + `long_press_params` in ButtonConfig.

### Phase 14: Polish

- Slide-up animation for bottom drawer.
- Confirmation dialog for replacing existing button configs.
- Keyboard shortcuts: Escape to deselect, Delete/Backspace to clear.
- Touch: long-press on grid button for context menu.
- Responsive: on narrow screens, stack vertically (browser above grid).
- Dark theme refinements.

---

## 13. Resolved Decisions

1. **Mustache templates in YAML**: Yes. Preset defaults and user-set labels store
   Mustache syntax directly in YAML (e.g., `label: "{{brightness_percent}}"`).
   Consistent across hand-edited YAML and UI-generated config.

2. **Shared params**: Forward ALL user params to both action and state provider.
   Each uses `.strip()` (Zod) to silently ignore unknown keys. No mapping layer.

3. **Catalog caching**: Cache the catalog on the frontend. Serve with a version
   hash or ETag. Only changes on hub restart or plugin add/remove.

4. **Entity list caching**: Each plugin is responsible for its own entity/resource
   caching strategy. The HA plugin caches entity lists internally and exposes
   them via its existing `/api/ha/entities` endpoint. The frontend caches the
   response per session with a manual refresh button. If HA is unreachable, the
   entity picker falls back to a plain text input.

5. **Long-press actions**: First-class support in the editor. See below.

---

## 14. Long-Press Actions

Long-press is a full action assignment, just like the primary press. The editor
treats it as a second action slot on the same button.

### Data model

Already supported in `ButtonConfig`:

```yaml
pos: [0, 0]
preset: home-assistant.light
params:
  entity_id: light.office
# Long-press: different action
long_press_action: home-assistant.turn_on
long_press_params:
  entity_id: light.office
  brightness: 255
```

### Editor UI

The Button Config Editor gets a **tab bar** at the top of the Params section:

```
[ Press ]  [ Long Press ]
```

- **Press tab** (default): Shows the primary action params, state provider, and
  appearance — everything described in Section 11.
- **Long Press tab**: Shows a secondary action assignment. Same UI as the primary
  action: an action picker (or "Add Action" prompt if none assigned), plus that
  action's param fields.

Long-press does NOT get its own state provider or appearance — it shares
the button's visual state from the primary assignment. It's purely an
alternative action trigger.

### Preset support

Presets can optionally specify a default long-press action:

```typescript
interface ButtonPreset {
  // ... existing fields ...
  longPressAction?: string;        // e.g., "turn_on"
  longPressDefaults?: Record<string, unknown>;  // default params
}
```

Example: The "Light" preset could default long-press to `turn_on` with
`brightness: 255` (full brightness on long-press, toggle on short press).

### Component changes

- `ButtonConfigEditor` adds tab state: `"press" | "longPress"`.
- Press tab: existing sections (Params, State, Appearance, Advanced).
- Long Press tab: just an action picker + param fields. Much simpler.
- If no long-press action is assigned, the tab shows "No long-press action.
  [Add Action]" with a button to open the plugin browser filtered to actions.

### YAML output

Only saved if the user configures a long-press action:

```yaml
pos: [0, 0]
preset: home-assistant.light
params:
  entity_id: light.office
long_press_action: home-assistant.turn_on
long_press_params:
  entity_id: light.office
  brightness: 255
```
