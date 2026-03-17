import { useParams } from "react-router-dom";

export default function PageEditor() {
  const { id } = useParams<{ id: string }>();
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Page Editor</h2>
      <p className="text-muted-foreground">Editing page: {id ?? "unknown"}</p>
    </div>
  );
}
