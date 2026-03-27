import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { useWebSocket } from "../hooks/useWebSocket.tsx";
import { Card, CardContent } from "@/components/ui/card";

export default function DeckPreview() {
  const [images, setImages] = useState<Record<number, string>>({});
  const { subscribe } = useWebSocket();

  async function loadPreview() {
    try {
      const data = await api.status.deckPreview();
      setImages(data);
    } catch {
      // hub may not have deck connected in dev
    }
  }

  useEffect(() => {
    loadPreview();
    const unsub = subscribe("deck:update", (msg) => {
      const data = msg.data as { images: Record<number, string> };
      setImages(data.images);
    });
    const unsubReload = subscribe("config:reloaded", () => { void loadPreview(); });
    return () => { unsub(); unsubReload(); };
  }, [subscribe]);

  const keys = Object.keys(images).map(Number).sort((a, b) => a - b);

  return (
    <Card className="bg-surface-container rounded border border-outline-variant dark:border-outline">
      <div className="px-6 pt-6 pb-2">
        <h3 className="text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground">
          Deck Preview
        </h3>
      </div>
      <CardContent>
        {keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No deck connected</p>
        ) : (
          <div className="grid gap-1" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
            {keys.map((key) => (
              <button
                key={key}
                onClick={() => { void api.deck.press(key); }}
                className="aspect-square rounded overflow-hidden border border-outline-variant dark:border-outline hover:ring-2 ring-primary"
                title={`Key ${key}`}
              >
                <img
                  src={`data:image/jpeg;base64,${images[key]}`}
                  alt={`Key ${key}`}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
