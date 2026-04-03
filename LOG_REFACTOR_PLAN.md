# M001 — Unified Log Stream Component with Pretext height prediction

## Vision

Replace two divergent log implementations with a single shared component stack.
Install `@chenglou/pretext` (on npm at 0.0.4) and write the tiny two-phase
height prediction pattern ourselves — no Prelayout package needed. Both
`Logs.tsx` and `RecentLogs.tsx` are wired to this stack. Both get the
`log:history` backlog-on-mount behaviour.

---

## What we take from Prelayout — and what we skip

Prelayout is a general schema DSL for arbitrary component layouts. We only
need one specific case: **a log row**. A log row has fixed-width columns
(timestamp, badge, [name]) and one variable-width text field (`msg`) that
may wrap. That's the simplest possible case in Prelayout's model.

**What we keep from Prelayout's ideas:**
- The two-phase split: *prepare once* (canvas text measurement) vs *layout
  on every width change* (pure arithmetic)
- Caching the prepared handle on the item so repeated `estimateSize` calls
  are O(1) arithmetic — no repeat canvas work
- A `ResizeObserver` to feed the current container width into `estimateSize`

**What we skip:**
- The full schema DSL (`schema()`, `fixed()`, `text()`, `row()`, etc.)
- `prepareItem()` / `layoutItem()` generic walkers
- The `usePrelayout` / `useVirtualLayout` hooks
- All the `conditional`, `flexWrap`, `aspectRatio`, `group` complexity

**What we write ourselves (30 lines):**
```ts
// lib/logRowHeight.ts

import { prepare, layout, type PreparedText } from '@chenglou/pretext'

// Font must match the actual CSS: font-mono text-xs
// Geist Mono at 12px, line-height 20px, padding 2px top+bottom
export const LOG_ROW_FONT = '12px ui-monospace, "Geist Mono", monospace'
export const LOG_ROW_LINE_HEIGHT = 20
export const LOG_ROW_PADDING_Y = 4           // 2px top + 2px bottom (py-0.5)
export const LOG_ROW_MIN_HEIGHT = LOG_ROW_LINE_HEIGHT + LOG_ROW_PADDING_Y

// Fixed column widths (px) — sum these to get the offset for msg column width
const TIMESTAMP_W = 68   // "12:34:56 AM"
const BADGE_W     = 40   // "WARN"
const NAME_W      = 80   // "[hub]"
const GAP_W       = 8    // gap-2 between each column
export const LOG_ROW_FIXED_WIDTH = TIMESTAMP_W + BADGE_W + NAME_W + GAP_W * 3

// Cache the PreparedText handle on the LogLine object itself.
// prepare() is called once per unique msg string; layout() is pure arithmetic.
const prepCache = new WeakMap<object, PreparedText>()

export function prepareLogLine(line: { msg: string }): void {
  if (!prepCache.has(line) && line.msg.length > 0) {
    prepCache.set(line, prepare(line.msg, LOG_ROW_FONT))
  }
}

export function logRowHeight(line: { msg: string }, msgColumnWidth: number): number {
  const prepared = prepCache.get(line)
  if (!prepared || msgColumnWidth <= 0) return LOG_ROW_MIN_HEIGHT
  const { lineCount } = layout(prepared, msgColumnWidth, LOG_ROW_LINE_HEIGHT)
  return Math.max(lineCount, 1) * LOG_ROW_LINE_HEIGHT + LOG_ROW_PADDING_Y
}
```

That's the entirety of what we need from Prelayout's ideas. The hook and
virtualizer wiring use this directly.

---

## Boundary map

```
hub/web/src/
  lib/
    logRowHeight.ts          ← NEW  prepare/layout wrapper (uses @chenglou/pretext)
  hooks/
    useLogStream.ts          ← NEW  shared WS state (history + live + dedup + maxLines)
  components/
    LogRow.tsx               ← NEW  shared row renderer (timestamp | badge | [name] | msg)
    LogList.tsx              ← NEW  virtualizer with ResizeObserver → pretext estimateSize
    RecentLogs.tsx           ← MOD  thin wrapper: LogList compact mode
  pages/
    Logs.tsx                 ← MOD  thin wrapper: LogList + filter controls

New dep:
  @chenglou/pretext@0.0.4   ← on npm, install to hub/web
```

---

## Slices

### S01 · Install @chenglou/pretext + smoke test
**Risk:** low — it's on npm  
**Depends on:** nothing

```bash
cd hub/web && pnpm add @chenglou/pretext
```

Write `src/lib/logRowHeight.ts` (the ~30-line file above).  
Run `tsc --noEmit` — must pass clean.

**Done when:** `tsc --noEmit` exits 0 with logRowHeight.ts in place.

---

### S02 · `useLogStream` hook
**Risk:** low  
**Depends on:** nothing (pure logic, no pretext usage)

```ts
// hooks/useLogStream.ts
export function useLogStream(maxLines: number, pausedRef?: RefObject<boolean>): LogLine[]
```

Behaviour:
- `log:history` → seeds buffer with `history.slice(-maxLines)`, calls
  `prepareLogLine(line)` on each so canvas work is front-loaded at mount
- `log:line` → deduplicates by `seq`, calls `prepareLogLine` on new line,
  appends, caps at `maxLines`
- `paused` gates `setLines` via an optional ref (same pattern as current
  `Logs.tsx` `pausedRef`) so the hook can be used by both consumers

Note: `prepareLogLine` is called here, in the hook, as lines arrive — not
in `estimateSize`. This keeps `estimateSize` as pure O(1) arithmetic with
no side effects.

**Done when:** hook compiles; both maxLines variants work; tsc clean.

---

### S03 · `LogRow` component
**Risk:** low  
**Depends on:** nothing (pure rendering)

Single shared row renderer. Unifies the two existing level-colour approaches:
```ts
// Full Logs page used Badge variants; dashboard used className colours.
// We use Badge everywhere — it's already the richer implementation.
const LEVEL_VARIANT = {
  info: 'success', warn: 'warning', error: 'error', debug: 'secondary',
} satisfies Record<string, BadgeVariant>
```

Renders: `[timestamp] [Badge] [[name]] [msg]`  
Matches the fixed column widths declared in `logRowHeight.ts`.

**Done when:** LogRow visually matches current Logs.tsx rows; tsc clean.

---

### S04 · `LogList` virtualizer component
**Risk:** medium (ResizeObserver + pretext wiring)  
**Depends on:** S01, S03

```ts
interface LogListProps {
  lines: LogLine[]
  paused?: boolean        // suppress auto-scroll
  maxHeight?: string      // e.g. 'max-h-48' for widget mode; absent = flex-1
  className?: string
}
```

Internals:
1. `scrollContainerRef` on outer `<div>`
2. `ResizeObserver` → `containerWidth` state
3. `msgColumnWidth = Math.max(0, containerWidth - LOG_ROW_FIXED_WIDTH)`
4. `useVirtualizer({ count, getScrollElement, estimateSize: (i) => logRowHeight(lines[i], msgColumnWidth), overscan: 20 })`
5. `useEffect` on `lines` + `paused` → `virtualizer.scrollToIndex(lines.length - 1, { align: 'end' })`
6. Virtual items render `<LogRow>`

**No `measureElement` ref.** Heights come from pretext arithmetic.

ResizeObserver detail: we debounce the width update with
`requestAnimationFrame` to avoid thrashing on continuous resize. When width
changes, the virtualizer automatically re-runs `estimateSize` for all items.

**Done when:** LogList renders at multiple widths; wrapping msgs expand rows;
auto-scroll works; tsc clean.

---

### S05 · Wire `Logs.tsx`
**Risk:** low  
**Depends on:** S02, S04

```tsx
export default function Logs() {
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(paused)
  useEffect(() => { pausedRef.current = paused }, [paused])

  const lines = useLogStream(MAX_LINES, pausedRef)
  // filter state unchanged ...
  const filtered = useMemo(() => { /* same logic */ }, [lines, ...filters])

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* filter bar — level, name, search, pause, download — unchanged */}
      <LogList lines={filtered} paused={paused} className="flex-1" />
    </div>
  )
}
```

Delete `LogVirtualList`.

**Done when:** All filters work, pause/resume works, download works,
history loads on mount; tsc clean; `LogVirtualList` deleted.

---

### S06 · Wire `RecentLogs.tsx`
**Risk:** low  
**Depends on:** S02, S04

```tsx
export default function RecentLogs() {
  const lines = useLogStream(50)
  return (
    <Card>
      <div className="px-6 pt-6 pb-2 flex items-center justify-between">
        <h3 ...>Recent Activity</h3>
        <Link to="/logs">View all →</Link>
      </div>
      <CardContent>
        <LogList lines={lines} maxHeight="max-h-48" className="font-mono text-xs" />
      </CardContent>
    </Card>
  )
}
```

Delete: `useLayoutEffect` scroll hack, `flex-col-reverse`, manual subscribe
calls, per-line colour logic.

**Done when:** Dashboard widget shows live lines, newest at bottom, history
loads on mount; tsc clean; all old code deleted.

---

## Key risk: font string accuracy

The only real failure mode is if `LOG_ROW_FONT` in `logRowHeight.ts` doesn't
match the actual rendered CSS font exactly. If it's off, predicted heights will
be wrong for wrapping lines (single-line messages are always right because they
just return `LOG_ROW_MIN_HEIGHT`).

**Mitigation:** In S04, add a dev-only calibration check: after the first
render, compare `estimateSize(i)` against `getBoundingClientRect().height` for
the first 5 visible rows and log a warning if they differ by more than 2px.
This makes any font mismatch immediately visible in development.

The font string to verify against the CSS:
- CSS: `font-mono text-xs` = `font-family: ui-monospace, SFMono-Regular, ...`; 
  `font-size: 0.75rem` = 12px at default root font size
- Canvas string: `'12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'`

We should read the actual Tailwind config / CSS var to get the exact stack.

---

## Definition of Done

- [ ] `@chenglou/pretext` in package.json; no prelayout package
- [ ] `logRowHeight.ts` is the only height-prediction code — no `estimateSize: () => 22`
- [ ] `useLogStream` is the single WS subscription source
- [ ] `LogRow` is the single row renderer
- [ ] Both surfaces load `log:history` backlog on mount
- [ ] `LogVirtualList` deleted
- [ ] `flex-col-reverse` + `useLayoutEffect` scroll hack deleted
- [ ] `tsc --noEmit` clean
