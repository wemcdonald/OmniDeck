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
  return <span className="text-sm shrink-0">{name}</span>;
}
