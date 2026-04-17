import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type DeckInfo, type DisplayAreaInfo } from "../lib/api.ts";
import { useWebSocket } from "../hooks/useWebSocket.tsx";
import { Card, CardContent } from "@/components/ui/card";

export default function DeckPreview() {
  const [images, setImages] = useState<Record<number, string>>({});
  const [displayAreaImages, setDisplayAreaImages] = useState<Record<string, string>>({});
  const [deckInfo, setDeckInfo] = useState<DeckInfo | null>(null);
  const { subscribe } = useWebSocket();

  const { data: deckInfoData } = useQuery({
    queryKey: ["status", "deck"],
    queryFn: () => api.status.deck().catch(() => null),
  });

  const { data: previewData } = useQuery({
    queryKey: ["status", "deckPreview"],
    queryFn: () => api.status.deckPreview().catch(() => ({ images: {}, displayAreaImages: {} } as { images: Record<number, string>; displayAreaImages: Record<string, string> })),
  });

  useEffect(() => { if (deckInfoData) setDeckInfo(deckInfoData); }, [deckInfoData]);

  useEffect(() => {
    if (previewData) {
      setImages((previewData as { images: Record<number, string> }).images ?? {});
      setDisplayAreaImages((previewData as { displayAreaImages: Record<string, string> }).displayAreaImages ?? {});
    }
  }, [previewData]);

  useEffect(() => {
    const unsub = subscribe("deck:update", (msg) => {
      const data = msg.data as { images: Record<number, string>; displayAreaImages: Record<string, string> };
      setImages(data.images ?? {});
      setDisplayAreaImages(data.displayAreaImages ?? {});
    });
    const unsubInfo = subscribe("deck:info", (msg) => {
      setDeckInfo(msg.data as DeckInfo);
    });
    const unsubReload = subscribe("config:reloaded", () => {
      api.status.deckPreview().then((p) => {
        const preview = p as { images: Record<number, string>; displayAreaImages: Record<string, string> };
        setImages(preview.images ?? {});
        setDisplayAreaImages(preview.displayAreaImages ?? {});
      }).catch(() => {});
    });
    return () => { unsub(); unsubInfo(); unsubReload(); };
  }, [subscribe]);

  const keyCount = deckInfo?.keyCount ?? Object.keys(images).length;
  const keyColumns = deckInfo?.keyColumns ?? 5;
  const displayAreas: DisplayAreaInfo[] = deckInfo?.displayAreas ?? [];

  if (keyCount === 0) {
    return (
      <Card className="bg-surface-container rounded border border-outline-variant dark:border-outline">
        <div className="px-6 pt-6 pb-2">
          <h3 className="text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground">Deck Preview</h3>
        </div>
        <CardContent>
          <p className="text-sm text-muted-foreground">No deck connected</p>
        </CardContent>
      </Card>
    );
  }

  const totalCols = keyColumns + displayAreas.length;

  return (
    <Card className="bg-surface-container rounded border border-outline-variant dark:border-outline">
      <div className="px-6 pt-6 pb-2">
        <h3 className="text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground">Deck Preview</h3>
      </div>
      <CardContent>
        <div className="flex gap-1">
          {/* Main button grid */}
          <div className="grid gap-1 flex-1" style={{ gridTemplateColumns: `repeat(${keyColumns}, 1fr)` }}>
            {Array.from({ length: keyCount }, (_, i) => (
              <button
                key={i}
                onClick={() => { void api.deck.press(i); }}
                className="aspect-square rounded overflow-hidden border border-outline-variant dark:border-outline hover:ring-2 ring-primary"
                title={`Key ${i}`}
              >
                {images[i] && (
                  <img src={`data:image/jpeg;base64,${images[i]}`} alt={`Key ${i}`} className="w-full h-full object-cover" />
                )}
              </button>
            ))}
          </div>

          {/* Display area columns (e.g. Mirabox side strip) */}
          {displayAreas.map((area) => (
            <div key={area.id} className="flex flex-col gap-1" style={{ width: `calc(100% / ${totalCols})` }}>
              {Array.from({ length: area.rows }, (_, row) => (
                <div
                  key={row}
                  className="rounded overflow-hidden border border-outline-variant/50 dark:border-outline/50"
                  style={{ aspectRatio: `${area.segments[0]?.width ?? 82} / ${area.segments[0]?.height ?? 82}` }}
                >
                  {displayAreaImages[`${area.id}:${row}`] && (
                    <img
                      src={`data:image/jpeg;base64,${displayAreaImages[`${area.id}:${row}`]}`}
                      alt={`${area.id} row ${row}`}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
