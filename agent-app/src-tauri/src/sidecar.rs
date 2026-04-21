use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;

use crate::credentials::{read_paired_hubs, PairedHub};

#[derive(Debug, Clone, Serialize)]
pub struct PairedHubStatus {
    #[serde(flatten)]
    pub hub: PairedHub,
    pub connected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "state")]
pub enum AgentState {
    #[serde(rename = "not_paired")]
    NotPaired,
    #[serde(rename = "connecting")]
    Connecting,
    #[serde(rename = "connected")]
    Connected {
        hub: String,
        hub_url: String,
    },
    #[serde(rename = "disconnected")]
    Disconnected {
        reason: String,
    },
    #[serde(rename = "error")]
    Error {
        message: String,
    },
}

pub struct SidecarManager {
    child: Mutex<Option<CommandChild>>,
    state: Arc<Mutex<AgentState>>,
    /// Per-hub connected flag, keyed by agent_id. Populated from the sidecar's
    /// status events once it reports them.
    hub_connected: Arc<Mutex<HashMap<String, bool>>>,
    config_dir: Mutex<String>,
}

impl SidecarManager {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
            state: Arc::new(Mutex::new(AgentState::NotPaired)),
            hub_connected: Arc::new(Mutex::new(HashMap::new())),
            config_dir: Mutex::new(String::new()),
        }
    }

    pub fn state(&self) -> AgentState {
        self.state.lock().unwrap().clone()
    }

    /// List of paired hubs, each annotated with its current connection state.
    pub fn paired_hubs(&self) -> Vec<PairedHubStatus> {
        let config_dir = self.config_dir.lock().unwrap().clone();
        if config_dir.is_empty() {
            return Vec::new();
        }
        let connected = self.hub_connected.lock().unwrap().clone();
        read_paired_hubs(&config_dir)
            .into_iter()
            .map(|h| PairedHubStatus {
                connected: *connected.get(&h.agent_id).unwrap_or(&false),
                hub: h,
            })
            .collect()
    }

    /// Write a JSON line to the sidecar's stdin.
    pub fn write_to_child(&self, msg: &serde_json::Value) {
        if let Some(child) = self.child.lock().unwrap().as_mut() {
            let line = format!("{}\n", serde_json::to_string(msg).unwrap_or_default());
            let _ = child.write(line.as_bytes());
        }
    }

    /// Whether the main sidecar is currently spawned. Used by the pair flow
    /// to decide between a hot-add IPC and a full sidecar (re)start.
    pub fn is_running(&self) -> bool {
        self.child.lock().unwrap().is_some()
    }

    pub fn start(&self, app: &AppHandle, config_dir: &str) {
        // Stop existing if running
        self.stop();
        *self.config_dir.lock().unwrap() = config_dir.to_string();
        self.hub_connected.lock().unwrap().clear();

        let sidecar = app.shell().sidecar("omnideck-agent").unwrap();
        let (mut rx, child) = sidecar
            .args(["--managed", "--config-dir", config_dir])
            .spawn()
            .expect("Failed to spawn agent sidecar");

        *self.child.lock().unwrap() = Some(child);

        let state = self.state.clone();
        let app_handle = app.clone();

        // Read JSON lines from agent stdout
        tauri::async_runtime::spawn(async move {
            use tauri_plugin_shell::process::CommandEvent;

            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(line) => {
                        let line = String::from_utf8_lossy(&line);
                        let line = line.trim();
                        if line.is_empty() {
                            continue;
                        }
                        if let Ok(msg) = serde_json::from_str::<serde_json::Value>(line) {
                            let manager_ref = app_handle.state::<crate::SidecarState>();
                            handle_agent_message(
                                &app_handle,
                                &state,
                                &manager_ref.0.hub_connected,
                                &msg,
                            );
                        }
                    }
                    CommandEvent::Stderr(line) => {
                        // Agent logs go to stderr — forward to Tauri debug log
                        let line = String::from_utf8_lossy(&line);
                        eprintln!("[agent] {}", line.trim());
                    }
                    CommandEvent::Terminated(status) => {
                        let reason = format!("Process exited with {:?}", status.code);
                        *state.lock().unwrap() = AgentState::Disconnected { reason: reason.clone() };
                        let _ = app_handle.emit("agent-status", AgentState::Disconnected { reason });
                        break;
                    }
                    _ => {}
                }
            }
        });
    }

    pub fn stop(&self) {
        if let Some(child) = self.child.lock().unwrap().take() {
            let _ = child.kill();
        }
    }
}

fn handle_agent_message(
    app: &AppHandle,
    state: &Arc<Mutex<AgentState>>,
    hub_connected: &Arc<Mutex<HashMap<String, bool>>>,
    msg: &serde_json::Value,
) {
    let msg_type = msg.get("type").and_then(|t| t.as_str()).unwrap_or("");

    match msg_type {
        "status" => {
            let state_str = msg.get("state").and_then(|s| s.as_str()).unwrap_or("");
            let agent_id = msg.get("agent_id").and_then(|a| a.as_str());

            // Per-hub event: update the map keyed by agent_id. Coarse
            // AgentState is then derived from whether any hub is connected.
            if let Some(aid) = agent_id {
                let mut map = hub_connected.lock().unwrap();
                match state_str {
                    "connected" => { map.insert(aid.to_string(), true); }
                    "disconnected" | "connecting" => { map.insert(aid.to_string(), false); }
                    _ => {}
                }
                let _ = app.emit("agent-hubs-changed", ());
            }

            let new_state = match state_str {
                "connecting" => AgentState::Connecting,
                "connected" => AgentState::Connected {
                    hub: msg.get("hub").and_then(|h| h.as_str()).unwrap_or("OmniDeck").to_string(),
                    hub_url: msg.get("hub_url").and_then(|u| u.as_str()).unwrap_or("").to_string(),
                },
                "disconnected" => AgentState::Disconnected {
                    reason: msg.get("reason").and_then(|r| r.as_str()).unwrap_or("unknown").to_string(),
                },
                "not_paired" => AgentState::NotPaired,
                other => AgentState::Error {
                    message: format!("Unknown state: {}", other),
                },
            };

            // With per-hub events, coarse "disconnected" only makes sense if no
            // hub is currently connected. Otherwise promote to Connected using
            // whichever hub is up so the tray stays green.
            let current_state = if matches!(new_state, AgentState::Disconnected { .. }) {
                let map = hub_connected.lock().unwrap();
                if map.values().any(|&c| c) {
                    // Some other hub is still connected — keep overall state Connected.
                    state.lock().unwrap().clone()
                } else {
                    new_state.clone()
                }
            } else {
                new_state.clone()
            };

            *state.lock().unwrap() = current_state.clone();
            let _ = app.emit("agent-status", &current_state);
        }
        "paired" => {
            let hub_name = msg.get("hub_name").and_then(|h| h.as_str()).unwrap_or("OmniDeck");
            let _ = app.emit("agent-paired", msg);
            let _ = app.emit("agent-hubs-changed", ());
            eprintln!("Agent paired with hub: {}", hub_name);
        }
        "pair_failed" => {
            let error = msg.get("error").and_then(|e| e.as_str()).unwrap_or("Unknown error");
            let _ = app.emit("agent-pair-failed", msg);
            eprintln!("Pairing failed: {}", error);
        }
        "auth_failed" => {
            if let Some(aid) = msg.get("agent_id").and_then(|a| a.as_str()) {
                hub_connected.lock().unwrap().remove(aid);
                let _ = app.emit("agent-auth-failed", msg);
                let _ = app.emit("agent-hubs-changed", ());
            } else {
                // Legacy: no agent_id means all creds got nuked.
                *state.lock().unwrap() = AgentState::NotPaired;
                hub_connected.lock().unwrap().clear();
                let _ = app.emit("agent-status", &AgentState::NotPaired);
                let _ = app.emit("agent-auth-failed", msg);
                let _ = app.emit("agent-hubs-changed", ());
            }
        }
        "unpaired" => {
            if let Some(aid) = msg.get("agent_id").and_then(|a| a.as_str()) {
                hub_connected.lock().unwrap().remove(aid);
            }
            let _ = app.emit("agent-unpaired", msg);
            let _ = app.emit("agent-hubs-changed", ());
        }
        "platform_request" => {
            handle_platform_request(app, msg);
        }
        "error" => {
            let message = msg.get("message").and_then(|m| m.as_str()).unwrap_or("Unknown error");
            *state.lock().unwrap() = AgentState::Error { message: message.to_string() };
            let _ = app.emit("agent-status", &AgentState::Error { message: message.to_string() });
        }
        _ => {}
    }
}

fn handle_platform_request(app: &AppHandle, msg: &serde_json::Value) {
    let id = msg.get("id").and_then(|i| i.as_str()).unwrap_or("");
    let method = msg.get("method").and_then(|m| m.as_str()).unwrap_or("");
    let params = msg.get("params").cloned().unwrap_or(serde_json::json!({}));

    let result = dispatch_platform_method(method, &params);

    // Build response
    let response = if result.get("error").is_some() {
        serde_json::json!({
            "type": "platform_response",
            "id": id,
            "error": result["error"],
        })
    } else {
        serde_json::json!({
            "type": "platform_response",
            "id": id,
            "result": result,
        })
    };

    // Write response to sidecar stdin
    let manager = app.state::<crate::SidecarState>();
    manager.0.write_to_child(&response);
}

fn dispatch_platform_method(method: &str, params: &serde_json::Value) -> serde_json::Value {
    #[cfg(target_os = "macos")]
    {
        return crate::platform_mac::handle_request(method, params);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = params;
        serde_json::json!({ "error": format!("platform method '{}' not supported on this OS", method) })
    }
}
