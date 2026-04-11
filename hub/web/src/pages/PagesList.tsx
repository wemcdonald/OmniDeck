import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type PageConfig } from "../lib/api.ts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Home } from "lucide-react";

export default function PagesList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: pages = [] } = useQuery({
    queryKey: ["config", "pages"],
    queryFn: api.pages.list,
  });

  const { data: deckConfig = {} } = useQuery({
    queryKey: ["config", "deck"],
    queryFn: api.deck.get,
  });

  const defaultPage = (deckConfig as Record<string, unknown>).default_page as string | undefined;

  const createMutation = useMutation({
    mutationFn: (page: PageConfig) => api.pages.create(page),
    onSuccess: (_data, page) => {
      queryClient.invalidateQueries({ queryKey: ["config", "pages"] });
      navigate(`/pages/${page.page}`);
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: (pageId: string) => api.deck.setDefaultPage(pageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config", "deck"] });
    },
  });

  function handleAddPage() {
    const id = `page-${Date.now()}`;
    createMutation.mutate({ page: id, name: "New Page", buttons: [] });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold font-display">Pages</h2>
        <Button size="sm" onClick={handleAddPage}>
          <Plus className="w-4 h-4 mr-1" />
          + New Page
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {pages.map((page) => {
          const isDefault = page.page === defaultPage;
          return (
            <Card
              key={page.page}
              className={`transition-colors ${isDefault ? "border-primary" : "hover:border-primary/50"} cursor-pointer`}
              onClick={() => navigate(`/pages/${page.page}`)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base truncate flex-1 min-w-0">{page.name ?? page.page}</CardTitle>
                  <div className="flex items-center gap-1 shrink-0">
                    {isDefault ? (
                      <Badge variant="success" className="text-xs">Default</Badge>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setDefaultMutation.mutate(page.page); }}
                        className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded"
                        title="Set as default page"
                      >
                        <Home className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground font-mono">
                  {page.buttons.length} button{page.buttons.length !== 1 ? "s" : ""}
                </p>
              </CardContent>
            </Card>
          );
        })}
        {pages.length === 0 && (
          <p className="text-sm text-muted-foreground col-span-3">No pages found.</p>
        )}
      </div>
    </div>
  );
}
