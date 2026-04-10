interface BrowserWs {
  readyState: number;
  send(data: string): void;
}

export type BroadcastMessage =
  | { type: "config:reloaded" }
  | { type: "agent:update"; data: unknown }
  | { type: "plugin:status"; data: unknown }
  | { type: "deck:update"; data: { page: string; images: Record<number, string> } }
  | { type: "deck:disconnected" }
  | {
      type: "deck:info";
      data: {
        driver: string;
        model: string;
        keyCount: number;
        keyColumns: number;
        keySize: { width: number; height: number };
        capabilities: { hasKeyUp: boolean; hasHardwareLongPress: boolean; hasDisplay: boolean };
      };
    }
  | {
      type: "log:line";
      data: { ts: string; level: string; name: string; msg: string; [k: string]: unknown };
    }
  | {
      type: "mode:change";
      data: {
        from: { id: string; name: string; icon?: string } | null;
        to: { id: string; name: string; icon?: string } | null;
      };
    }
  | {
      type: "action:response";
      data: {
        action: string;
        target: string;
        success: boolean;
        error?: string;
      };
    }
  | {
      type: "config:reload_failed";
      data: { file: string; error: string };
    };

export class Broadcaster {
  private clients = new Set<BrowserWs>();

  add(ws: BrowserWs): void {
    this.clients.add(ws);
  }

  remove(ws: BrowserWs): void {
    this.clients.delete(ws);
  }

  send(msg: BroadcastMessage): void {
    const data = JSON.stringify(msg);
    for (const client of this.clients) {
      if (client.readyState === 1 /* OPEN */) {
        client.send(data);
      } else {
        this.clients.delete(client);
      }
    }
  }

  get size(): number {
    return this.clients.size;
  }

  clear(): void {
    this.clients.clear();
  }
}
