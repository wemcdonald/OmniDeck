//! Read-only access to the agent's `credentials.json` file so the Tauri shell
//! can show paired hubs in the tray. The agent sidecar owns writes; this
//! module just parses.
//!
//! The on-disk format is the v2 shape produced by `agent/src/credentials.ts`:
//!   { "version": 2, "hubs": [ { "agent_id": "...", "hub_name": "...", ... } ] }
//! For forward compatibility we also accept the legacy v1 bare-object shape
//! (a single hub entry at the top level) and surface it as a single-element
//! list.

use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PairedHub {
    pub agent_id: String,
    pub hub_name: String,
    #[serde(default)]
    pub hub_address: String,
    #[serde(default)]
    pub cert_fingerprint_sha256: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CredentialsFileV2 {
    #[allow(dead_code)]
    version: u32,
    hubs: Vec<PairedHub>,
}

/// Read paired hubs from `<config_dir>/credentials.json`. Returns an empty
/// list if the file is missing or unparseable. Silent on I/O errors — the
/// tray just renders "Not paired" in that case.
pub fn read_paired_hubs(config_dir: &str) -> Vec<PairedHub> {
    let path = Path::new(config_dir).join("credentials.json");
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return Vec::new();
    };
    if let Ok(v2) = serde_json::from_str::<CredentialsFileV2>(&raw) {
        return v2.hubs;
    }
    if let Ok(v1) = serde_json::from_str::<PairedHub>(&raw) {
        return vec![v1];
    }
    Vec::new()
}
