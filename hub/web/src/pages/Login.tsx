import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface LoginProps {
  onSuccess: () => void;
}

export default function Login({ onSuccess }: LoginProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const loginMutation = useMutation({
    mutationFn: (pw: string) => api.auth.login(pw),
    onSuccess: () => onSuccess(),
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Login failed");
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    loginMutation.mutate(password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background dark:bg-background bg-[#f1f5f9]">
      <Card className="w-full max-w-sm mx-4 border-border dark:border-primary/30">
        <CardContent className="pt-8 pb-6 px-6">
          <div className="flex flex-col items-center gap-1 mb-8">
            <img src="/logo.svg" alt="OmniDeck" className="h-10 w-10" />
            <h1 className="font-display text-lg uppercase tracking-widest text-foreground">
              OmniDeck
            </h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
              {loginMutation.isPending ? "Logging in..." : "Log in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
