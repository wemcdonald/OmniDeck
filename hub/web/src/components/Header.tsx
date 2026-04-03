import { Menu, Moon, Sun } from "lucide-react";
import { useWebSocket } from "../hooks/useWebSocket.tsx";
import { useTheme } from "../hooks/useTheme.tsx";
import { cn } from "@/lib/utils";

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const { connected } = useWebSocket();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="border-b border-border bg-background px-4 h-14 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-container-high transition-colors"
          aria-label="Toggle menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-sm font-semibold font-display uppercase tracking-widest text-foreground">
          OmniDeck Hub
        </h1>
      </div>

      <div className="flex items-center gap-3">
        {/* WebSocket status */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              connected ? "bg-success" : "bg-destructive"
            )}
          />
          <span className="text-muted-foreground hidden sm:inline">
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-container-high transition-colors"
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>
      </div>
    </header>
  );
}
