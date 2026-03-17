interface BrowserWs {
  readyState: number;
  send(data: string): void;
}

export type BroadcastMessage =
  | { type: "config:reloaded" }
  | { type: "agent:update"; data: unknown }
  | { type: "plugin:status"; data: unknown }
  | { type: "deck:update"; data: { page: string; images: Record<number, string> } }
  | {
      type: "log:line";
      data: { ts: string; level: string; name: string; msg: string; [k: string]: unknown };
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
