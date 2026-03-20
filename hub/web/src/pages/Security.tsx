import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface PairedAgent {
  agent_id: string;
  name: string;
  platform: string;
  paired_at: string;
  last_seen?: string;
}

export default function Security() {
  const [agents, setAgents] = useState<PairedAgent[]>([]);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [codeExpiresAt, setCodeExpiresAt] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(0);

  const loadAgents = useCallback(async () => {
    try {
      setAgents(await api.pairing.listAgents());
    } catch {
      // pairing not configured
    }
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

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

  const generateCode = async () => {
    const { code, expires_at } = await api.pairing.generateCode();
    setPairingCode(code);
    setCodeExpiresAt(new Date(expires_at));
  };

  const revokeAgent = async (id: string) => {
    await api.pairing.revokeAgent(id);
    loadAgents();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Security</h1>

      {/* Agent Pairing */}
      <Card>
        <CardHeader>
          <CardTitle>Agent Pairing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {pairingCode ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Enter this code on your agent to pair it:
              </p>
              <div className="flex items-center gap-4">
                <code className="text-3xl font-mono font-bold tracking-widest bg-muted px-4 py-2 rounded-lg">
                  {pairingCode}
                </code>
                <span className="text-sm text-muted-foreground">
                  Expires in {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}
                </span>
              </div>
            </div>
          ) : (
            <Button onClick={generateCode}>Pair New Agent</Button>
          )}
        </CardContent>
      </Card>

      {/* Paired Agents */}
      <Card>
        <CardHeader>
          <CardTitle>Paired Agents</CardTitle>
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
                    onClick={() => revokeAgent(agent.agent_id)}
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
          <CardTitle>HTTPS Setup</CardTitle>
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
