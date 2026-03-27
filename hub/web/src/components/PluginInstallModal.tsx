import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "./ui/button.tsx";
import { cn } from "../lib/utils.ts";
import { PluginBrowseTab } from "./PluginBrowseTab.tsx";
import { PluginGitHubTab } from "./PluginGitHubTab.tsx";
import { PluginZipTab } from "./PluginZipTab.tsx";

type Tab = "browse" | "github" | "zip";

interface PluginInstallModalProps {
  open: boolean;
  onClose: () => void;
}

export function PluginInstallModal({ open, onClose }: PluginInstallModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>("browse");

  if (!open) return null;

  const tabs: { id: Tab; label: string }[] = [
    { id: "browse", label: "Browse" },
    { id: "github", label: "GitHub URL" },
    { id: "zip", label: "Upload Zip" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-2xl max-h-[80vh] flex flex-col bg-surface-container rounded border border-outline-variant shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-lg font-display font-semibold">Install Plugin</h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 py-2 border-b border-outline-variant">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={cn(
                "px-3 py-2 text-xs font-display font-semibold uppercase tracking-wide rounded transition-colors",
                activeTab === t.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-auto p-4">
          {activeTab === "browse" && <PluginBrowseTab onClose={onClose} />}
          {activeTab === "github" && <PluginGitHubTab onClose={onClose} />}
          {activeTab === "zip" && <PluginZipTab onClose={onClose} />}
        </div>
      </div>
    </div>
  );
}
