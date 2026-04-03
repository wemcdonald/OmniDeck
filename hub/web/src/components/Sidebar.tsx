import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Layers,
  SlidersHorizontal,
  Puzzle,
  Monitor,
  ScrollText,
  Users,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "../hooks/useTheme.tsx";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/pages", icon: Layers, label: "Pages" },
  { to: "/modes", icon: SlidersHorizontal, label: "Modes" },
  { to: "/plugins", icon: Puzzle, label: "Plugins" },
  { to: "/devices", icon: Monitor, label: "Devices" },
  { to: "/logs", icon: ScrollText, label: "Logs" },
  { to: "/agents", icon: Users, label: "Agents" },
] as const;

interface SidebarProps {
  /** Whether the sidebar is open as an overlay (mobile/tablet) */
  mobileOpen?: boolean;
  /** Called when the mobile overlay should close */
  onMobileClose?: () => void;
}

export default function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const { sidebarCollapsed, setSidebarCollapsed } = useTheme();

  const sidebarContent = (
    <aside
      className={cn(
        "flex flex-col h-full bg-sidebar border-r border-sidebar-border transition-all duration-200 shrink-0",
        sidebarCollapsed ? "w-14" : "w-52"
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          "flex items-center shrink-0 border-b border-sidebar-border",
          sidebarCollapsed ? "justify-center px-2 py-4" : "gap-2.5 px-4 py-4"
        )}
      >
        <img
          src="/logo.svg"
          alt="OmniDeck"
          className="h-6 w-6 shrink-0"
        />
        {!sidebarCollapsed && (
          <span className="text-xs font-semibold font-display uppercase tracking-widest text-sidebar-foreground">
            OmniDeck
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className={cn("flex flex-col gap-0.5 flex-1 py-3", sidebarCollapsed ? "px-1.5" : "px-2")}>
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            onClick={onMobileClose}
            title={sidebarCollapsed ? label : undefined}
            className={({ isActive }) =>
              cn(
                "flex items-center rounded text-sm transition-colors relative group",
                sidebarCollapsed
                  ? "justify-center p-2.5"
                  : "gap-3 px-3 py-2",
                isActive
                  ? cn(
                      "text-sidebar-primary font-medium",
                      sidebarCollapsed
                        ? "bg-sidebar-accent"
                        : "bg-sidebar-accent border-l-2 border-sidebar-primary -ml-px"
                    )
                  : "text-on-surface-variant hover:bg-sidebar-accent hover:text-sidebar-foreground"
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!sidebarCollapsed && label}
            {/* Tooltip for collapsed state */}
            {sidebarCollapsed && (
              <span className="absolute left-full ml-2 px-2 py-1 rounded bg-surface-container-highest text-foreground text-xs font-medium whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 shadow-md">
                {label}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle (hidden on mobile overlay) */}
      <div className={cn("border-t border-sidebar-border py-2", sidebarCollapsed ? "px-1.5" : "px-2")}>
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className={cn(
            "flex items-center rounded text-sm text-on-surface-variant hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors w-full",
            sidebarCollapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2"
          )}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="h-4 w-4 shrink-0" />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4 shrink-0" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop sidebar — always visible at lg+ */}
      <div className="hidden lg:flex h-full">{sidebarContent}</div>

      {/* Mobile/tablet overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={onMobileClose}
          />
          {/* Drawer */}
          <div className="relative h-full w-52 bg-sidebar shadow-lg flex flex-col">
            {/* Close button */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-sidebar-border">
              <div className="flex items-center gap-2.5">
                <img src="/logo.svg" alt="OmniDeck" className="h-6 w-6 shrink-0" />
                <span className="text-xs font-semibold font-display uppercase tracking-widest text-sidebar-foreground">
                  OmniDeck
                </span>
              </div>
              <button
                onClick={onMobileClose}
                className="p-1 rounded text-on-surface-variant hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="flex flex-col gap-0.5 flex-1 px-2 py-3">
              {navItems.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === "/"}
                  onClick={onMobileClose}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded px-3 py-2.5 text-sm transition-colors",
                      isActive
                        ? "text-sidebar-primary font-medium bg-sidebar-accent border-l-2 border-sidebar-primary -ml-px"
                        : "text-on-surface-variant hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    )
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
