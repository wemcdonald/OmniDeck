import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { api, type PageConfig, type ButtonConfig } from "../lib/api";
import { usePluginCatalog } from "../hooks/usePluginCatalog";
import ButtonGrid from "../components/ButtonGrid";
import ButtonConfigEditor from "../components/ButtonConfigEditor";
import PluginBrowser, { type BrowserDropData } from "../components/PluginBrowser";

export default function PageEditor() {
  const { id } = useParams<{ id: string }>();
  const [page, setPage] = useState<PageConfig | null>(null);
  const [selectedPos, setSelectedPos] = useState<[number, number] | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const { catalog, loading: catalogLoading } = usePluginCatalog();

  useEffect(() => {
    if (!id) return;
    api.pages.get(id)
      .then((p) => { setPage(p); return api.pages.preview(id); })
      .then(setPreviews)
      .catch(console.error);
  }, [id]);

  function getSelectedButton(): ButtonConfig | undefined {
    if (!selectedPos || !page) return undefined;
    return page.buttons.find(
      (b) => b.pos[0] === selectedPos[0] && b.pos[1] === selectedPos[1]
    );
  }

  const saveButtons = useCallback(async (newButtons: ButtonConfig[]) => {
    if (!page || !id) return;
    const newPage = { ...page, buttons: newButtons };
    setPage(newPage);
    try {
      await api.pages.save(id, newPage);
      api.pages.preview(id).then(setPreviews).catch(console.error);
    } catch (e) {
      alert(`Save failed: ${e}`);
    }
  }, [page, id]);

  function updateButton(updated: ButtonConfig) {
    if (!page) return;
    const existing = page.buttons.findIndex(
      (b) => b.pos[0] === updated.pos[0] && b.pos[1] === updated.pos[1]
    );
    const newButtons =
      existing >= 0
        ? page.buttons.map((b, i) => (i === existing ? updated : b))
        : [...page.buttons, updated];
    saveButtons(newButtons);
  }

  function clearButton() {
    if (!selectedPos || !page) return;
    const newButtons = page.buttons.filter(
      (b) => !(b.pos[0] === selectedPos[0] && b.pos[1] === selectedPos[1])
    );
    setSelectedPos(null);
    saveButtons(newButtons);
  }

  /** Handle drop from PluginBrowser onto a grid cell. */
  function handleDrop(pos: [number, number], data: BrowserDropData) {
    setSelectedPos(pos);
    const btn: ButtonConfig = { pos };
    if (data.type === "preset") {
      btn.preset = data.qualifiedId;
    } else if (data.type === "action") {
      btn.action = data.qualifiedId;
    }
    // For stateProvider drops, just select the cell — the user can assign
    // the provider in the config editor.
    updateButton(btn);
  }

  /** Handle click-to-assign from PluginBrowser (touch-friendly). */
  function handleBrowserItemClick(data: BrowserDropData) {
    if (!selectedPos) return; // No button selected — ignore
    handleDrop(selectedPos, data);
  }

  if (!page) return <p className="text-muted-foreground p-4">Loading...</p>;

  const columns = page.columns ?? 5;
  const rows = 3;

  return (
    <div className="grid h-full" style={{
      gridTemplateColumns: "1fr 280px",
      gridTemplateRows: "1fr auto",
    }}>
      {/* Top-left: Deck grid */}
      <div className="p-4 flex flex-col gap-3 overflow-hidden">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{page.name ?? page.page}</h2>
          <span className="text-xs text-muted-foreground">{page.buttons.length} buttons</span>
        </div>
        <div className="flex-1 flex items-start">
          <div className="w-full max-w-lg">
            <ButtonGrid
              buttons={page.buttons}
              columns={columns}
              rows={rows}
              selectedPos={selectedPos}
              onSelect={setSelectedPos}
              onDrop={handleDrop}
              previews={previews}
            />
          </div>
        </div>
      </div>

      {/* Top-right: Plugin browser */}
      <div className="border-l overflow-hidden flex flex-col">
        <div className="px-3 py-2 border-b">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Plugins
          </h3>
        </div>
        {catalogLoading || !catalog ? (
          <p className="text-xs text-muted-foreground p-3">Loading catalog...</p>
        ) : (
          <PluginBrowser catalog={catalog} onItemClick={handleBrowserItemClick} />
        )}
      </div>

      {/* Bottom: Config editor (spans both columns) */}
      {selectedPos && catalog && (
        <div className="col-span-2 border-t overflow-y-auto" style={{ maxHeight: "350px" }}>
          <div className="p-4">
            <ButtonConfigEditor
              pos={selectedPos}
              button={getSelectedButton()}
              catalog={catalog}
              onSave={updateButton}
              onClear={clearButton}
            />
          </div>
        </div>
      )}
    </div>
  );
}
