import { useState, useEffect, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

interface Hub {
  name: string;
  address: string;
  port: number;
}

export default function PairingDialog() {
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [discovering, setDiscovering] = useState(true);
  const [selectedHub, setSelectedHub] = useState<Hub | null>(null);
  const [manualAddress, setManualAddress] = useState("");
  const [code, setCode] = useState("");
  const [pairing, setPairing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    invoke<Hub[]>("cmd_discover_hubs")
      .then((found) => {
        setHubs(found);
        if (found.length === 1) setSelectedHub(found[0]);
      })
      .catch(() => {})
      .finally(() => setDiscovering(false));
  }, []);

  const hubUrl = selectedHub
    ? `wss://${selectedHub.address}:${selectedHub.port}`
    : manualAddress
    ? (manualAddress.startsWith("wss://") ? manualAddress : `wss://${manualAddress}`)
    : "";

  const canPair = hubUrl && code.trim().length > 0;

  const handlePair = async (e: FormEvent) => {
    e.preventDefault();
    if (!canPair) return;

    setError("");
    setPairing(true);

    try {
      await invoke("cmd_pair", { hubUrl, code: code.trim() });
      setSuccess(true);
      // Close window after a brief delay
      setTimeout(() => {
        getCurrentWebviewWindow().close();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPairing(false);
    }
  };

  if (success) {
    return (
      <div style={{ ...styles.container, justifyContent: "center", alignItems: "center" }}>
        <div style={styles.successIcon}>&#10003;</div>
        <h2 style={styles.heading}>Paired successfully!</h2>
        <p style={{ ...styles.sub, marginBottom: 0, textAlign: "center" as const }}>
          OmniDeck Agent is now connected.
        </p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>OmniDeck</h1>
      <p style={styles.sub}>Pair this agent with your OmniDeck Hub</p>

      {/* Hub Discovery */}
      <div style={styles.section}>
        <label style={styles.label}>Hub</label>
        {discovering ? (
          <p style={styles.discovering}>Searching for hubs on your network...</p>
        ) : hubs.length > 0 ? (
          <div style={styles.hubList}>
            {hubs.map((hub) => (
              <button
                key={`${hub.address}:${hub.port}`}
                style={{
                  ...styles.hubItem,
                  ...(selectedHub === hub ? styles.hubItemSelected : {}),
                }}
                onClick={() => { setSelectedHub(hub); setManualAddress(""); }}
              >
                <strong>{hub.name}</strong>
                <span style={styles.hubAddress}>{hub.address}:{hub.port}</span>
              </button>
            ))}
          </div>
        ) : (
          <p style={styles.discovering}>No hubs found on your network.</p>
        )}

        <div style={styles.manualEntry}>
          <input
            type="text"
            placeholder="Or enter hub address manually (e.g., 192.168.1.50:9210)"
            value={manualAddress}
            onChange={(e) => { setManualAddress(e.target.value); setSelectedHub(null); }}
            style={styles.input}
          />
        </div>
      </div>

      {/* Pairing Code */}
      <form onSubmit={handlePair}>
        <div style={styles.section}>
          <label style={styles.label}>Pairing Code</label>
          <p style={styles.hint}>
            Get this from your Hub web UI: Security &rarr; Pair New Agent
          </p>
          <input
            type="text"
            placeholder="DECK-XXXX"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            style={{ ...styles.input, ...styles.codeInput }}
            autoFocus
          />
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <button
          type="submit"
          disabled={!canPair || pairing}
          style={{
            ...styles.button,
            ...(!canPair || pairing ? styles.buttonDisabled : {}),
          }}
        >
          {pairing ? "Pairing..." : "Pair"}
        </button>
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: "32px 28px",
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh",
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 4,
  },
  sub: {
    fontSize: 14,
    color: "#a1a1aa",
    marginBottom: 24,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: "#d4d4d8",
    marginBottom: 8,
    display: "block",
  },
  hint: {
    fontSize: 12,
    color: "#71717a",
    marginBottom: 8,
  },
  discovering: {
    fontSize: 13,
    color: "#71717a",
    padding: "12px 0",
  },
  hubList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginBottom: 8,
  },
  hubItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #27272a",
    background: "#18181b",
    color: "#fafafa",
    cursor: "pointer",
    fontSize: 14,
    textAlign: "left" as const,
  },
  hubItemSelected: {
    border: "1px solid #3b82f6",
    background: "#1e293b",
  },
  hubAddress: {
    fontSize: 12,
    color: "#71717a",
  },
  manualEntry: {
    marginTop: 8,
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #27272a",
    background: "#18181b",
    color: "#fafafa",
    fontSize: 14,
    outline: "none",
  },
  codeInput: {
    fontFamily: "monospace",
    fontSize: 18,
    letterSpacing: 4,
    textAlign: "center" as const,
  },
  error: {
    fontSize: 13,
    color: "#ef4444",
    marginBottom: 12,
  },
  button: {
    width: "100%",
    padding: "12px",
    borderRadius: 8,
    border: "none",
    background: "#3b82f6",
    color: "white",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  successIcon: {
    fontSize: 48,
    color: "#22c55e",
    textAlign: "center" as const,
    marginTop: 80,
    marginBottom: 16,
  },
  heading: {
    fontSize: 20,
    fontWeight: 600,
    textAlign: "center" as const,
  },
};
