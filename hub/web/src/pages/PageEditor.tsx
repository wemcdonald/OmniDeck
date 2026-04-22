import { useState, useCallback, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { api, type PageConfig, type ButtonConfig, type DisplayAreaInfo } from "../lib/api";
import { usePluginCatalog } from "../hooks/usePluginCatalog";
import ButtonGrid from "../components/ButtonGrid";
import ButtonConfigEditor from "../components/ButtonConfigEditor";
import PluginBrowser, { type BrowserDropData } from "../components/PluginBrowser";
import { cn } from "@/lib/utils";

const BROWSER_KEY = "omnideck-editor-browser";

export default function PageEditor() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [page, setPage] = useState<PageConfig | null>(null);
  const [selectedPos, setSelectedPos] = useState<[number, number] | null>(null);
  const { catalog, loading: catalogLoading } = usePluginCatalog();
  const [browserOpen, setBrowserOpen] = useState(() => {
    const stored = localStorage.getItem(BROWSER_KEY);
    if (stored !== null) return stored !== "false";
    return window.innerWidth >= 768;
  });

  function toggleBrowser() {
    const next = !browserOpen;
    setBrowserOpen(next);
    localStorage.setItem(BROWSER_KEY, String(next));
  }

  const { data: pageData } = useQuery({
    queryKey: ["config", "page", id],
    queryFn: () => api.pages.get(id!),
    enabled: !!id,
  });

  const { data: previews = {} } = useQuery({
    queryKey: ["deck", "preview", id],
    queryFn: () => api.pages.preview(id!),
    enabled: !!id,
  });

  const { data: deckInfo } = useQuery({
    queryKey: ["status", "deck"],
    queryFn: () => api.status.deck().catch(() => null),
  });
  const displayAreas: DisplayAreaInfo[] = deckInfo?.displayAreas ?? [];

  // Sync page data from query to local state for optimistic editing
  useEffect(() => {
    if (pageData) setPage(pageData);
  }, [pageData]);

  const saveMutation = useMutation({
    mutationFn: ({ pageId, newPage }: { pageId: string; newPage: PageConfig }) =>
      api.pages.save(pageId, newPage),
    onSuccess: () => {
      if (id) {
        queryClient.invalidateQueries({ queryKey: ["deck", "preview", id] });
      }
    },
  });

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "Escape") {
        setSelectedPos(null);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedPos) {
        clearButton();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

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
      saveMutation.mutate({ pageId: id, newPage });
    } catch (e) {
      alert(`Save failed: ${e}`);
    }
  }, [page, id, saveMutation]);

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

  function handleDrop(pos: [number, number], data: BrowserDropData) {
    setSelectedPos(pos);
    const btn: ButtonConfig = { pos };
    if (data.type === "preset") {
      btn.preset = data.qualifiedId;
    } else if (data.type === "action") {
      btn.action = data.qualifiedId;
    }
    updateButton(btn);
  }

  function handleBrowserItemClick(data: BrowserDropData) {
    if (!selectedPos) return;
    handleDrop(selectedPos, data);
  }

  if (!page) return <p className="text-muted-foreground p-4">Loading...</p>;

  const columns = page.columns ?? deckInfo?.keyColumns ?? 5;
  const rows = deckInfo ? Math.ceil(deckInfo.keyCount / columns) : 3;

  return (
    <div className="h-full flex flex-col lg:flex-row overflow-hidden -m-4 md:-m-6">
      {/* Left panel: Plugin browser (collapsible) */}
      <div
        className={cn(
          "border-b lg:border-b-0 lg:border-r transition-all duration-200 shrink-0 flex flex-col",
          browserOpen ? "w-full lg:w-64" : "w-full lg:w-10"
        )}
      >
        <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
          {browserOpen && (
            <h3 className="text-xs font-semibold font-display text-muted-foreground uppercase tracking-wide">
              Plugins
            </h3>
          )}
          <button
            onClick={toggleBrowser}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-surface-container-high transition-colors"
            title={browserOpen ? "Collapse plugin browser" : "Expand plugin browser"}
          >
            {browserOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
          </button>
        </div>
        {browserOpen && (
          <div className="flex-1 overflow-hidden flex flex-col min-h-0 max-h-48 lg:max-h-none">
            {catalogLoading || !catalog ? (
              <p className="text-xs text-muted-foreground p-3">Loading catalog...</p>
            ) : (
              <PluginBrowser catalog={catalog} onItemClick={handleBrowserItemClick} />
            )}
          </div>
        )}
      </div>

      {/* Center panel: Deck grid */}
      <div className="flex-1 p-4 flex flex-col gap-3 overflow-auto min-w-0">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold font-display">{page.name ?? page.page}</h2>
          <span className="text-xs text-muted-foreground font-mono">
            {page.buttons.length} / {columns * rows + displayAreas.reduce((s, a) => s + a.rows, 0)}
          </span>
        </div>
        <div className="flex-1 flex items-start min-h-0">
          <div className="w-full max-w-lg">
            <ButtonGrid
              buttons={page.buttons}
              columns={columns}
              rows={rows}
              selectedPos={selectedPos}
              onSelect={setSelectedPos}
              onDrop={handleDrop}
              previews={previews}
              displayAreas={displayAreas}
              keySize={deckInfo?.keySize}
            />
          </div>
        </div>
      </div>

      {/* Right panel: Config editor */}
      {selectedPos && catalog && (
        <div className="border-t lg:border-t-0 lg:border-l w-full lg:w-80 overflow-y-auto shrink-0 max-h-[50vh] lg:max-h-none">
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
