import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Layers,
  Puzzle,
  Monitor,
  ScrollText,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/pages", icon: Layers, label: "Pages" },
  { to: "/plugins", icon: Puzzle, label: "Plugins" },
  { to: "/devices", icon: Monitor, label: "Devices" },
  { to: "/logs", icon: ScrollText, label: "Logs" },
  { to: "/security", icon: Shield, label: "Security" },
] as const;

export default function Sidebar() {
  return (
    <aside className="w-48 border-r flex flex-col py-4 shrink-0">
      <div className="px-4 mb-6">
        <span className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          OmniDeck
        </span>
      </div>
      <nav className="flex flex-col gap-1 px-2">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
