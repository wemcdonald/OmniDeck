import { describe, it, expect } from "vitest";
import { createMessage, parseMessage } from "../protocol.js";

describe("plugin distribution protocol messages", () => {
  it("creates a plugin_manifest message", () => {
    const msg = createMessage("plugin_manifest", {
      plugins: [
        { id: "btt", version: "0.1.0", sha256: "abc", platforms: ["darwin"], hasAgent: true },
      ],
    });
    expect(msg.type).toBe("plugin_manifest");
    expect((msg.data as any).plugins).toHaveLength(1);
  });

  it("creates a plugin_download_request message", () => {
    const msg = createMessage("plugin_download_request", { id: "btt" }, "req-1");
    expect(msg.type).toBe("plugin_download_request");
    expect(msg.id).toBe("req-1");
  });

  it("creates a plugin_download_response message", () => {
    const msg = createMessage(
      "plugin_download_response",
      {
        id: "btt",
        code: "export default function init() {}",
        sha256: "abc123",
      },
      "req-1",
    );
    expect(msg.type).toBe("plugin_download_response");
  });

  it("creates a plugin_status message", () => {
    const msg = createMessage("plugin_status", {
      plugins: [
        { id: "btt", version: "0.1.0", status: "active" },
        { id: "obs", version: "1.0.0", status: "failed", error: "connection refused" },
      ],
    });
    expect(msg.type).toBe("plugin_status");
  });

  it("creates a plugin_config_update message", () => {
    const msg = createMessage("plugin_config_update", {
      id: "btt",
      config: { port: 12345, secret: "abc" },
    });
    expect(msg.type).toBe("plugin_config_update");
  });
});
