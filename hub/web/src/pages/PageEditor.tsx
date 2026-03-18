import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, type PageConfig, type ButtonConfig } from "../lib/api.ts";
import ButtonGrid from "../components/ButtonGrid.tsx";
import ButtonConfigPanel from "../components/ButtonConfigPanel.tsx";

export default function PageEditor() {
  const { id } = useParams<{ id: string }>();
  const [page, setPage] = useState<PageConfig | null>(null);
  const [selectedPos, setSelectedPos] = useState<[number, number] | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});

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

  async function saveButtons(newButtons: ButtonConfig[]) {
    if (!page || !id) return;
    const newPage = { ...page, buttons: newButtons };
    setPage(newPage);
    try {
      await api.pages.save(id, newPage);
      api.pages.preview(id).then(setPreviews).catch(console.error);
    } catch (e) {
      alert(`Save failed: ${e}`);
    }
  }

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

  if (!page) return <p className="text-muted-foreground">Loading...</p>;

  const columns = page.columns ?? 5;
  const rows = 3;

  return (
    <div className="flex gap-4 h-full">
      {/* Left: Page info */}
      <div className="w-40 shrink-0">
        <h2 className="font-semibold mb-3">{page.name ?? page.page}</h2>
        <p className="text-xs text-muted-foreground">{page.buttons.length} buttons</p>
      </div>

      {/* Center: Button grid */}
      <div className="flex-1">
        <ButtonGrid
          buttons={page.buttons}
          columns={columns}
          rows={rows}
          selectedPos={selectedPos}
          onSelect={setSelectedPos}
          previews={previews}
        />
      </div>

      {/* Right: Config panel */}
      {selectedPos && (
        <div className="w-80 min-w-80 shrink-0 border-l pl-4 overflow-y-auto">
          <ButtonConfigPanel
            pos={selectedPos}
            button={getSelectedButton()}
            onSave={updateButton}
            onClear={clearButton}
          />
        </div>
      )}
    </div>
  );
}
