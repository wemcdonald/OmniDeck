import { useState, useEffect, useCallback, useMemo } from "react";
import { Copy, Check, Download, Apple, Monitor } from "lucide-react";
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
  const [copied, setCopied] = useState(false);

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

  const detectedPlatform = useMemo(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("mac")) return "macOS";
    if (ua.includes("win")) return "Windows";
    if (ua.includes("linux")) return "Linux";
    return null;
  }, []);

  const releaseBaseUrl = "https://github.com/wemcdonald/OmniDeck/releases/latest/download";
  const downloads = [
    { platform: "macOS", label: "macOS (Apple Silicon)", file: "OmniDeck.Agent_0.2.0_aarch64.dmg", icon: Apple },
    { platform: "Windows", label: "Windows", file: "OmniDeck.Agent_0.2.0_x64-setup.exe", icon: Monitor },
    { platform: "Linux", label: "Linux (.deb)", file: "OmniDeck.Agent_0.2.0_amd64.deb", icon: Monitor },
    { platform: "Linux", label: "Linux (.AppImage)", file: "OmniDeck.Agent_0.2.0_amd64.AppImage", icon: Monitor },
  ];

  const primaryDownload = downloads.find((d) => d.platform === detectedPlatform) ?? downloads[0];
  const otherDownloads = downloads.filter((d) => d !== primaryDownload);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Security</h1>

      {/* Install Agent */}
      <Card>
        <CardHeader>
          <CardTitle>Install Agent</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Install the OmniDeck Agent on each computer you want to control.
            The agent runs in the system tray and connects to this hub.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href={`${releaseBaseUrl}/${primaryDownload.file}`}>
              <Button>
                <Download className="h-4 w-4 mr-2" />
                Download for {primaryDownload.label}
              </Button>
            </a>
          </div>
          <details className="text-sm">
            <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
              Other platforms
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              {otherDownloads.map((d) => (
                <a
                  key={d.file}
                  href={`${releaseBaseUrl}/${d.file}`}
                  className="text-sm text-blue-500 hover:underline"
                >
                  {d.label}
                </a>
              ))}
              <a
                href="https://github.com/wemcdonald/OmniDeck/releases/latest"
                className="text-sm text-blue-500 hover:underline"
              >
                All releases on GitHub
              </a>
            </div>
          </details>
        </CardContent>
      </Card>

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
