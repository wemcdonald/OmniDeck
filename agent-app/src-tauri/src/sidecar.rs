use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;

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
}

impl SidecarManager {
    pub fn new() -> Self {
        Self {
            child: Mutex::new(None),
            state: Arc::new(Mutex::new(AgentState::NotPaired)),
        }
    }

    pub fn state(&self) -> AgentState {
        self.state.lock().unwrap().clone()
    }

    /// Write a JSON line to the sidecar's stdin.
    pub fn write_to_child(&self, msg: &serde_json::Value) {
        if let Some(child) = self.child.lock().unwrap().as_mut() {
            let line = format!("{}\n", serde_json::to_string(msg).unwrap_or_default());
            let _ = child.write(line.as_bytes());
        }
    }

    pub fn start(&self, app: &AppHandle, config_dir: &str) {
        // Stop existing if running
        self.stop();

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
                            handle_agent_message(&app_handle, &state, &msg);
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
    msg: &serde_json::Value,
) {
    let msg_type = msg.get("type").and_then(|t| t.as_str()).unwrap_or("");

    match msg_type {
        "status" => {
            let new_state = match msg.get("state").and_then(|s| s.as_str()).unwrap_or("") {
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
            *state.lock().unwrap() = new_state.clone();
            let _ = app.emit("agent-status", &new_state);
        }
        "paired" => {
            let hub_name = msg.get("hub_name").and_then(|h| h.as_str()).unwrap_or("OmniDeck");
            let _ = app.emit("agent-paired", msg);
            eprintln!("Agent paired with hub: {}", hub_name);
        }
        "pair_failed" => {
            let error = msg.get("error").and_then(|e| e.as_str()).unwrap_or("Unknown error");
            let _ = app.emit("agent-pair-failed", msg);
            eprintln!("Pairing failed: {}", error);
        }
        "auth_failed" => {
            *state.lock().unwrap() = AgentState::NotPaired;
            let _ = app.emit("agent-status", &AgentState::NotPaired);
            let _ = app.emit("agent-auth-failed", msg);
        }
        "unpaired" => {
            let _ = app.emit("agent-unpaired", msg);
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
