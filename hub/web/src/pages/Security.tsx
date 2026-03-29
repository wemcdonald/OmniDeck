import { useState, useEffect } from "react";
import { Copy, Check, Download } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Security() {
  const queryClient = useQueryClient();
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [codeExpiresAt, setCodeExpiresAt] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [copied, setCopied] = useState(false);

  const { data: agents = [] } = useQuery({
    queryKey: ["pairing", "agents"],
    queryFn: () => api.pairing.listAgents().catch(() => []),
  });

  const generateCodeMutation = useMutation({
    mutationFn: () => api.pairing.generateCode(),
    onSuccess: ({ code, expires_at }) => {
      setPairingCode(code);
      setCodeExpiresAt(new Date(expires_at));
    },
  });

  const revokeAgentMutation = useMutation({
    mutationFn: (id: string) => api.pairing.revokeAgent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pairing", "agents"] });
    },
  });

  // Countdown timer for pairing code
  useEffect(() => {
    if (!codeExpiresAt) return;
    const tick = () => {
      const remaining = Math.max(0, Math.floor((codeExpiresAt.getTime() - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining === 0) {
        setPairingCode(null);
        setCodeExpiresAt(null);
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [codeExpiresAt]);

  const releasesUrl = "https://github.com/wemcdonald/OmniDeck/releases/latest";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold font-display">Security</h1>

      {/* Install Agent */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground">Install Agent</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Install the OmniDeck Agent on each computer you want to control.
            The agent runs in the system tray and connects to this hub.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href={releasesUrl} target="_blank" rel="noopener noreferrer">
              <Button>
                <Download className="h-4 w-4 mr-2" />
                Download Agent
              </Button>
            </a>
          </div>
          <p className="text-xs text-muted-foreground">
            Available for macOS, Windows, and Linux. Opens the latest release on GitHub.
          </p>
        </CardContent>
      </Card>

      {/* Agent Pairing */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground">Agent Pairing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {pairingCode ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Enter this code on your agent to pair it:
              </p>
              <div className="flex items-center gap-3">
                <code className="text-3xl font-mono font-bold tracking-widest bg-muted px-4 py-2 rounded-lg">
                  {pairingCode}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(pairingCode);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="Copy to clipboard"
                >
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </button>
                <span className="text-sm text-muted-foreground">
                  Expires in {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}
                </span>
              </div>
            </div>
          ) : (
            <Button onClick={() => generateCodeMutation.mutate()}>Generate Code</Button>
          )}
        </CardContent>
      </Card>

      {/* Paired Agents */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground">Paired Agents</CardTitle>
        </CardHeader>
        <CardContent>
          {agents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No agents paired yet.</p>
          ) : (
            <div className="divide-y">
              {agents.map((agent) => (
                <div
                  key={agent.agent_id}
                  className="flex items-center justify-between py-3"
                >
                  <div>
                    <div className="font-medium">{agent.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {agent.platform} &middot; Paired{" "}
                      {new Date(agent.paired_at).toLocaleDateString()}
                      {agent.last_seen && (
                        <>
                          {" "}&middot; Last seen{" "}
                          {new Date(agent.last_seen).toLocaleString()}
                        </>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => revokeAgentMutation.mutate(agent.agent_id)}
                  >
                    Revoke
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* HTTPS Setup */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xs font-display font-semibold uppercase tracking-wide text-muted-foreground">HTTPS Setup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Agent connections are always encrypted. To also encrypt browser connections,
            install the OmniDeck CA certificate on your devices.
          </p>
          <a href="/api/tls/ca.crt" download>
            <Button variant="outline">
              Download CA Certificate
            </Button>
          </a>
          <div className="text-sm space-y-2 text-muted-foreground">
            <p className="font-medium text-foreground">Installation instructions:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>macOS:</strong> Double-click the .crt file, add to System keychain,
                then trust it for SSL in Keychain Access.
              </li>
              <li>
                <strong>Windows:</strong> Double-click the .crt file, install to
                "Trusted Root Certification Authorities" store.
              </li>
              <li>
                <strong>Linux:</strong> Copy to <code>/usr/local/share/ca-certificates/</code>{" "}
                and run <code>sudo update-ca-certificates</code>.
              </li>
              <li>
                <strong>iOS:</strong> Share the .crt file to your device, install the profile
                in Settings, then trust it under General &gt; About &gt; Certificate Trust Settings.
              </li>
            </ul>
            <p className="mt-3">
              After installing, set <code>auth.tls_redirect: true</code> in your config
              to automatically redirect HTTP to HTTPS.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
