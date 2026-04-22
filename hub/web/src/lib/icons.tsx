import { Icon } from "@iconify/react";

/**
 * Renders a Material Symbols icon from an "ms:icon-name" string,
 * or falls back to rendering the raw string as a small emoji/text span.
 */
export function msIcon(name?: string) {
  if (!name) return null;
  if (name.startsWith("ms:")) {
    return (
      <Icon
        icon={`material-symbols:${name.slice(3)}`}
        className="w-4 h-4 shrink-0"
      />
    );
  }
  if (name.startsWith("plugin:")) {
    const rest = name.slice("plugin:".length);
    const slash = rest.indexOf("/");
    if (slash > 0) {
      const pluginId = rest.slice(0, slash);
      const iconName = rest.slice(slash + 1);
      // ?color= substitutes currentColor in the SVG server-side so monochrome
      // logos (Slack, Claude Code, etc.) are visible on dark surfaces.
      // Brand-colored SVGs with hardcoded fills (Spotify, Discord) are
      // unaffected.
      return (
        <img
          src={`/api/plugin-icons/${encodeURIComponent(pluginId)}/${encodeURIComponent(iconName)}?color=%23ffffff`}
          alt={iconName}
          className="w-4 h-4 shrink-0 object-contain"
        />
      );
    }
  }
  return <span className="text-sm shrink-0">{name}</span>;
}
