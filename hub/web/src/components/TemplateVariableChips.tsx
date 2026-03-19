import type { TemplateVariable } from "../lib/api";

interface Props {
  variables: TemplateVariable[];
  onInsert?(variable: string): void;
}

export default function TemplateVariableChips({ variables, onInsert }: Props) {
  if (variables.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      <span className="text-[10px] text-muted-foreground mr-1 self-center">Variables:</span>
      {variables.map((v) => (
        <button
          key={v.key}
          type="button"
          onClick={() => onInsert?.(`{{${v.key}}}`)}
          title={v.example ? `e.g. ${v.example}` : v.label}
          className="text-[11px] px-1.5 py-0.5 rounded bg-muted hover:bg-accent text-muted-foreground hover:text-foreground transition-colors font-mono"
        >
          {`{{${v.key}}}`}
        </button>
      ))}
    </div>
  );
}
