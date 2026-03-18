import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type PageConfig } from "../lib/api.ts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus } from "lucide-react";

export default function PagesList() {
  const [pages, setPages] = useState<PageConfig[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.pages.list().then(setPages).catch(console.error);
  }, []);

  async function handleAddPage() {
    const id = `page-${Date.now()}`;
    await api.pages.create({ page: id, name: "New Page", buttons: [] });
    navigate(`/pages/${id}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Pages</h2>
        <Button size="sm" onClick={handleAddPage}>
          <Plus className="w-4 h-4 mr-1" />
          New Page
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {pages.map((page) => (
          <Link key={page.page} to={`/pages/${page.page}`}>
            <Card className="hover:border-primary transition-colors cursor-pointer">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{page.name ?? page.page}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {page.buttons.length} button{page.buttons.length !== 1 ? "s" : ""}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
        {pages.length === 0 && (
          <p className="text-sm text-muted-foreground col-span-3">No pages found.</p>
        )}
      </div>
    </div>
  );
}
