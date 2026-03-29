mod sidecar;
mod tray;
#[cfg(target_os = "macos")]
mod platform_mac;

use sidecar::{AgentState, SidecarManager};
use std::sync::Arc;
use tauri::{Manager, Emitter, Listener};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_autostart::MacosLauncher;

/// Global state wrapper for the sidecar manager.
pub struct SidecarState(pub Arc<SidecarManager>);

/// Get the platform-appropriate config directory.
fn get_config_dir() -> String {
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").unwrap_or_default();
        format!("{}/Library/Application Support/OmniDeck", home)
    }
    #[cfg(target_os = "windows")]
    {
        let appdata = std::env::var("APPDATA").unwrap_or_default();
        format!("{}\\OmniDeck", appdata)
    }
    #[cfg(target_os = "linux")]
    {
        let config = std::env::var("XDG_CONFIG_HOME")
            .unwrap_or_else(|_| format!("{}/.config", std::env::var("HOME").unwrap_or_default()));
        format!("{}/omnideck", config)
    }
}

/// Check if credentials exist in the config directory.
fn credentials_exist(config_dir: &str) -> bool {
    let path = std::path::Path::new(config_dir).join("credentials.json");
    path.exists()
}

// ── Tauri commands (invokable from frontend) ────────────────────────────────

#[tauri::command]
async fn cmd_discover_hubs(app: tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
    use tauri_plugin_shell::ShellExt;
    use tauri_plugin_shell::process::CommandEvent;

    let sidecar = app.shell().sidecar("omnideck-agent")
        .map_err(|e| e.to_string())?;

    let config_dir = get_config_dir();
    let (mut rx, _child) = sidecar
        .args(["--managed", "--discover", "--config-dir", &config_dir])
        .spawn()
        .map_err(|e| e.to_string())?;

    let mut hubs = Vec::new();

    while let Some(event) = rx.recv().await {
        if let CommandEvent::Stdout(line) = event {
            let line = String::from_utf8_lossy(&line);
            let line = line.trim();
            if let Ok(msg) = serde_json::from_str::<serde_json::Value>(line) {
                let msg_type = msg.get("type").and_then(|t| t.as_str()).unwrap_or("");
                if msg_type == "discovered" {
                    if let Some(hub) = msg.get("hub") {
                        hubs.push(hub.clone());
                    }
                } else if msg_type == "discover_done" {
                    break;
                }
            }
        }
    }

    Ok(hubs)
}

#[tauri::command]
async fn cmd_pair(
    app: tauri::AppHandle,
    hub_url: String,
    code: String,
) -> Result<serde_json::Value, String> {
    use tauri_plugin_shell::ShellExt;
    use tauri_plugin_shell::process::CommandEvent;

    let sidecar = app.shell().sidecar("omnideck-agent")
        .map_err(|e| e.to_string())?;

    let config_dir = get_config_dir();
    let (mut rx, _child) = sidecar
        .args([
            "--managed", "--pair",
            "--hub-url", &hub_url,
            "--pair-code", &code,
            "--config-dir", &config_dir,
        ])
        .spawn()
        .map_err(|e| e.to_string())?;

    while let Some(event) = rx.recv().await {
        if let CommandEvent::Stdout(line) = event {
            let line = String::from_utf8_lossy(&line);
            let line = line.trim();
            if let Ok(msg) = serde_json::from_str::<serde_json::Value>(line) {
                let msg_type = msg.get("type").and_then(|t| t.as_str()).unwrap_or("");
                match msg_type {
                    "paired" => {
                        // Success — restart the main agent sidecar
                        let manager = app.state::<SidecarState>();
                        manager.0.start(&app, &config_dir);
                        return Ok(msg);
                    }
                    "pair_failed" => {
                        let error = msg.get("error").and_then(|e| e.as_str()).unwrap_or("Unknown error");
                        return Err(error.to_string());
                    }
                    "error" => {
                        let error = msg.get("message").and_then(|e| e.as_str()).unwrap_or("Unknown error");
                        return Err(error.to_string());
                    }
                    _ => {}
                }
            }
        }
    }

    Err("Pairing process ended unexpectedly".to_string())
}

#[tauri::command]
fn cmd_get_state(app: tauri::AppHandle) -> AgentState {
    let manager = app.state::<SidecarState>();
    manager.0.state()
}

#[tauri::command]
fn cmd_unpair(app: tauri::AppHandle) -> Result<(), String> {
    let config_dir = get_config_dir();
    let creds_path = std::path::Path::new(&config_dir).join("credentials.json");

    // Stop the agent
    let manager = app.state::<SidecarState>();
    manager.0.stop();

    // Delete credentials
    if creds_path.exists() {
        std::fs::remove_file(&creds_path).map_err(|e| e.to_string())?;
    }

    let _ = app.emit("agent-status", &AgentState::NotPaired);
    Ok(())
}

// ── App entry ───────────────────────────────────────────────────────────────

pub fn run() {
    let sidecar_manager = Arc::new(SidecarManager::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // When a second instance is launched (e.g., via deep link), forward the args
            if let Some(url) = args.get(1) {
                handle_deep_link(app, url);
            }
            // Focus existing window if any
            if let Some(window) = app.get_webview_window("pairing") {
                let _ = window.set_focus();
            }
        }))
        .manage(SidecarState(sidecar_manager))
        .setup(|app| {
            // On macOS, hide the dock icon (menu bar agent only)
            #[cfg(target_os = "macos")]
            {
                use objc2_app_kit::{NSApplication, NSApplicationActivationPolicy};
                use objc2::MainThreadMarker;
                let mtm = unsafe { MainThreadMarker::new_unchecked() };
                let ns_app = NSApplication::sharedApplication(mtm);
                ns_app.setActivationPolicy(NSApplicationActivationPolicy::Accessory);
            }

            let config_dir = get_config_dir();
            std::fs::create_dir_all(&config_dir).ok();

            // Set up system tray
            eprintln!("[omnideck] Setting up system tray...");
            tray::setup_tray(app.handle())?;
            eprintln!("[omnideck] System tray initialized successfully");

            // Listen for state changes to update tray
            let app_handle = app.handle().clone();
            app.handle().listen("agent-status", move |event| {
                let payload = event.payload();
                if let Ok(state) = serde_json::from_str::<AgentState>(payload) {
                    let _ = tray::update_tray(&app_handle, &state);
                }
            });

            // Listen for deep link URLs
            let app_handle2 = app.handle().clone();
            app.handle().listen("deep-link://new-url", move |event| {
                let payload = event.payload();
                if let Ok(urls) = serde_json::from_str::<Vec<String>>(payload) {
                    if let Some(url) = urls.first() {
                        handle_deep_link(&app_handle2, url);
                    }
                }
            });

            // Listen for "show pairing window" requests
            let app_handle3 = app.handle().clone();
            app.handle().listen("show-pairing-window", move |_| {
                show_pairing_window(&app_handle3);
            });

            // Start agent if already paired
            if credentials_exist(&config_dir) {
                let manager = app.state::<SidecarState>();
                manager.0.start(app.handle(), &config_dir);
            } else {
                // Show pairing window on first launch
                show_pairing_window(app.handle());
            }

            // Enable autostart by default on first launch
            let autolaunch = app.handle().state::<tauri_plugin_autostart::AutoLaunchManager>();
            if !autolaunch.is_enabled().unwrap_or(false) {
                let _ = autolaunch.enable();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            cmd_discover_hubs,
            cmd_pair,
            cmd_get_state,
            cmd_unpair,
        ])
        .run(tauri::generate_context!())
        .expect("error running OmniDeck Agent");
}

fn show_pairing_window(app: &tauri::AppHandle) {
    // Check if window already exists
    if let Some(window) = app.get_webview_window("pairing") {
        let _ = window.set_focus();
        return;
    }

    let _window = tauri::WebviewWindowBuilder::new(
        app,
        "pairing",
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title("Pair with OmniDeck Hub")
    .inner_size(480.0, 500.0)
    .resizable(false)
    .center()
    .build()
    .ok();
}

fn handle_deep_link(app: &tauri::AppHandle, url_str: &str) {
    // Parse omnideck://pair?hub=<address>&code=<code>
    if let Ok(url) = url::Url::parse(url_str) {
        if url.host_str() == Some("pair") || url.path() == "/pair" || url.path() == "pair" {
            let hub = url.query_pairs().find(|(k, _)| k == "hub").map(|(_, v)| v.to_string());
            let code = url.query_pairs().find(|(k, _)| k == "code").map(|(_, v)| v.to_string());

            if let (Some(hub_url), Some(pair_code)) = (hub, code) {
                // Auto-pair without showing UI
                let app_handle = app.clone();
                tauri::async_runtime::spawn(async move {
                    match cmd_pair(app_handle.clone(), hub_url, pair_code).await {
                        Ok(_) => {
                            tauri_plugin_dialog::MessageDialogBuilder::new(
                                app_handle.dialog().clone(),
                                "OmniDeck Agent",
                                "Successfully paired with OmniDeck Hub!",
                            )
                            .kind(tauri_plugin_dialog::MessageDialogKind::Info)
                            .blocking_show();
                        }
                        Err(e) => {
                            tauri_plugin_dialog::MessageDialogBuilder::new(
                                app_handle.dialog().clone(),
                                "Pairing Failed",
                                format!("Could not pair with hub: {}", e),
                            )
                            .kind(tauri_plugin_dialog::MessageDialogKind::Error)
                            .blocking_show();
                        }
                    }
                });
                return;
            }
        }
    }

    // Unknown deep link — show pairing window as fallback
    show_pairing_window(app);
}
