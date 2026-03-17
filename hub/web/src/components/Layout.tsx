import { type ReactNode } from "react";
import Sidebar from "./Sidebar.tsx";
import { useWebSocket } from "../hooks/useWebSocket.tsx";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { connected } = useWebSocket();

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <header className="border-b px-6 py-3 flex items-center justify-between shrink-0">
          <h1 className="text-lg font-semibold">OmniDeck Hub</h1>
          <div className="flex items-center gap-2 text-sm">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                connected ? "bg-green-500" : "bg-red-500"
              )}
            />
            <span className="text-muted-foreground">
              {connected ? "Connected" : "Disconnected"}
            </span>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
