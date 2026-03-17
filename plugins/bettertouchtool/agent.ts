// plugins/bettertouchtool/agent.ts
// Agent-side plugin: polls BTT HTTP API and handles button actions.
import type { OmniDeck } from "@omnideck/agent-sdk";

export default function init(omnideck: OmniDeck) {
  const port = (omnideck.config.port as number) ?? 12345;
  const secret = omnideck.config.secret as string | undefined;
  const pollInterval = parseDuration((omnideck.config.poll_interval as string) ?? "2s");

  const bttUrl = `http://localhost:${port}`;
  const headers: Record<string, string> = {};
  if (secret) headers["shared_secret"] = secret;

  // Poll BTT for trigger list and push to hub state.
  const intervalHandle = omnideck.setInterval(async () => {
    try {
      const res = await fetch(`${bttUrl}/get_triggers/`, { headers });
      if (res.ok) {
        const triggers = await res.json();
        omnideck.setState("triggers", triggers);
      }
    } catch {
      // BTT not running — silently skip until next poll.
    }
  }, pollInterval);

  // Execute a named BTT trigger (e.g. a named trigger set up in BTT prefs).
  omnideck.onAction("run_trigger", async (params) => {
    const name = params.name as string;
    if (!name) return { success: false, error: "missing trigger name" };
    try {
      const res = await fetch(
        `${bttUrl}/trigger_named/${encodeURIComponent(name)}`,
        { method: "POST", headers },
      );
      return { success: res.ok };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  // Execute a BTT action by action-identifier string.
  omnideck.onAction("run_action", async (params) => {
    const action = params.action as string;
    if (!action) return { success: false, error: "missing action identifier" };
    try {
      const res = await fetch(
        `${bttUrl}/trigger_action/${encodeURIComponent(action)}`,
        { method: "POST", headers },
      );
      return { success: res.ok };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  omnideck.onReloadConfig((_newConfig) => {
    // Port / secret changes require re-initialisation of the interval.
    // The plugin loader will call destroy() then re-run init(), so we just
    // warn operators who expect live-reload without a restart.
    omnideck.log.warn(
      "bettertouchtool config changed — restart agent to apply new port/secret",
    );
  });

  omnideck.onDestroy(() => {
    omnideck.clearInterval(intervalHandle);
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a human-readable duration string into milliseconds.
 * Accepts: "500ms", "2s", "1m"
 */
function parseDuration(s: string): number {
  const match = s.match(/^(\d+)(ms|s|m)$/);
  if (!match) return 2000;
  const [, num, unit] = match;
  const n = parseInt(num, 10);
  if (unit === "ms") return n;
  if (unit === "s") return n * 1000;
  if (unit === "m") return n * 60_000;
  return 2000;
}
