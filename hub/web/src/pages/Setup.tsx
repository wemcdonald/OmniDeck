import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type WifiNetwork, type NetworkStateResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Phase = "pick" | "password" | "connecting" | "success" | "error";

function signalBars(signal: number): string {
  if (signal >= 80) return "••••";
  if (signal >= 60) return "•••◦";
  if (signal >= 40) return "••◦◦";
  if (signal >= 20) return "•◦◦◦";
  return "◦◦◦◦";
}

export default function Setup() {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>("pick");
  const [selected, setSelected] = useState<WifiNetwork | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>("");
  const [manualSsid, setManualSsid] = useState("");

  const stateQuery = useQuery<NetworkStateResponse>({
    queryKey: ["setup", "state"],
    queryFn: api.setup.state,
    refetchInterval: 5_000,
  });

  const scanQuery = useQuery({
    queryKey: ["setup", "scan"],
    queryFn: api.setup.scan,
    refetchInterval: phase === "pick" ? 10_000 : false,
  });

  const connectMutation = useMutation({
    mutationFn: (input: { ssid: string; password: string }) => api.setup.connect(input),
    onMutate: () => {
      setPhase("connecting");
      setError("");
    },
    onSuccess: () => {
      setPhase("success");
      setPassword("");
      void qc.invalidateQueries({ queryKey: ["setup", "state"] });
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : "Connect failed");
      setPhase("error");
    },
  });

  useEffect(() => {
    if (phase === "success" && stateQuery.data?.mode === "client") {
      // Stay on success; user can close tab.
    }
  }, [phase, stateQuery.data?.mode]);

  const onPickNetwork = (n: WifiNetwork): void => {
    setSelected(n);
    setPassword("");
    setError("");
    if (n.security) setPhase("password");
    else connectMutation.mutate({ ssid: n.ssid, password: "" });
  };

  const onSubmitPassword = (e: FormEvent): void => {
    e.preventDefault();
    if (!selected) return;
    connectMutation.mutate({ ssid: selected.ssid, password });
  };

  const onManualSubmit = (e: FormEvent): void => {
    e.preventDefault();
    if (!manualSsid.trim()) return;
    setSelected({ ssid: manualSsid.trim(), signal: 0, security: "WPA2", inUse: false });
    setPhase("password");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f1f5f9] dark:bg-background p-4">
      <Card className="w-full max-w-md border-border dark:border-primary/30">
        <CardContent className="pt-8 pb-6 px-6">
          <div className="flex flex-col items-center gap-1 mb-6">
            <img src="/logo.svg" alt="OmniDeck" className="h-10 w-10" />
            <h1 className="font-display text-lg uppercase tracking-widest text-foreground">
              OmniDeck
            </h1>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Wi-Fi Setup
            </p>
          </div>

          {stateQuery.data && (
            <div className="mb-4 text-xs text-muted-foreground text-center">
              Status: <span className="font-mono">{stateQuery.data.mode}</span>
              {stateQuery.data.ssid && <> · {stateQuery.data.ssid}</>}
            </div>
          )}

          {phase === "pick" && (
            <PickView
              networks={scanQuery.data?.networks ?? []}
              loading={scanQuery.isLoading}
              onPick={onPickNetwork}
              onRescan={() => void scanQuery.refetch()}
              manualSsid={manualSsid}
              setManualSsid={setManualSsid}
              onManualSubmit={onManualSubmit}
            />
          )}

          {phase === "password" && selected && (
            <PasswordView
              ssid={selected.ssid}
              password={password}
              setPassword={setPassword}
              onSubmit={onSubmitPassword}
              onBack={() => { setPhase("pick"); setSelected(null); }}
              pending={connectMutation.isPending}
            />
          )}

          {phase === "connecting" && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Connecting to <span className="font-medium">{selected?.ssid}</span>…
            </div>
          )}

          {phase === "success" && (
            <div className="py-6 text-center space-y-3">
              <div className="text-2xl">✓</div>
              <p className="text-sm font-medium">Connected to {selected?.ssid}</p>
              <p className="text-xs text-muted-foreground">
                OmniDeck will now rejoin your network. You can close this tab.
              </p>
            </div>
          )}

          {phase === "error" && (
            <div className="py-6 text-center space-y-3">
              <p className="text-sm font-medium text-destructive">Connection failed</p>
              {error && <p className="text-xs text-muted-foreground break-words">{error}</p>}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPhase(selected && selected.security ? "password" : "pick");
                  setError("");
                }}
              >
                Try again
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface PickViewProps {
  networks: WifiNetwork[];
  loading: boolean;
  onPick: (n: WifiNetwork) => void;
  onRescan: () => void;
  manualSsid: string;
  setManualSsid: (s: string) => void;
  onManualSubmit: (e: FormEvent) => void;
}

function PickView({ networks, loading, onPick, onRescan, manualSsid, setManualSsid, onManualSubmit }: PickViewProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          Nearby networks
        </span>
        <Button variant="ghost" size="sm" onClick={onRescan} disabled={loading}>
          {loading ? "…" : "Rescan"}
        </Button>
      </div>

      <div className="max-h-72 overflow-y-auto rounded border border-border divide-y divide-border">
        {networks.length === 0 && !loading && (
          <div className="p-4 text-xs text-muted-foreground text-center">
            No networks found.
          </div>
        )}
        {networks.map((n) => (
          <button
            key={n.ssid}
            onClick={() => onPick(n)}
            className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted transition-colors"
          >
            <span className="truncate text-sm">
              {n.ssid}
              {n.security ? "" : " · open"}
            </span>
            <span className="font-mono text-xs text-muted-foreground ml-2">
              {signalBars(n.signal)}
            </span>
          </button>
        ))}
      </div>

      <form onSubmit={onManualSubmit} className="space-y-2">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          Hidden network
        </span>
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="SSID"
            value={manualSsid}
            onChange={(e) => setManualSsid(e.target.value)}
          />
          <Button type="submit" variant="outline" disabled={!manualSsid.trim()}>
            Next
          </Button>
        </div>
      </form>
    </div>
  );
}

interface PasswordViewProps {
  ssid: string;
  password: string;
  setPassword: (s: string) => void;
  onSubmit: (e: FormEvent) => void;
  onBack: () => void;
  pending: boolean;
}

function PasswordView({ ssid, password, setPassword, onSubmit, onBack, pending }: PasswordViewProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="text-sm">
        Connect to <span className="font-medium">{ssid}</span>
      </div>
      <Input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoFocus
        minLength={8}
        maxLength={63}
      />
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1" disabled={pending}>
          Back
        </Button>
        <Button type="submit" className="flex-1" disabled={pending || password.length < 8}>
          {pending ? "Connecting…" : "Connect"}
        </Button>
      </div>
    </form>
  );
}
