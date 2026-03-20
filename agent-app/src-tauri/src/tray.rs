use tauri::{
    AppHandle, Manager,
    menu::{Menu, MenuItem, PredefinedMenuItem, CheckMenuItem},
    tray::{TrayIcon, TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState},
    image::Image,
};
use tauri_plugin_opener::OpenerExt;

use crate::sidecar::AgentState;

const ICON_CONNECTED: &[u8] = include_bytes!("../icons/tray-connected.png");
const ICON_DISCONNECTED: &[u8] = include_bytes!("../icons/tray-disconnected.png");
const ICON_NOT_PAIRED: &[u8] = include_bytes!("../icons/tray-not-paired.png");

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let tray = TrayIconBuilder::new()
        .icon(Image::from_png_bytes(ICON_NOT_PAIRED)?)
        .tooltip("OmniDeck Agent")
        .on_tray_icon_event(|tray, event| {
            // On macOS, left-click on menu bar icon should show menu (default behavior)
            // On Windows, left-click should also show menu
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                let _ = tray.app_handle().emit("tray-click", ());
            }
        })
        .build(app)?;

    update_tray_menu(app, &tray, &AgentState::NotPaired)?;

    Ok(())
}

pub fn update_tray(app: &AppHandle, state: &AgentState) -> tauri::Result<()> {
    if let Some(tray) = app.tray_by_id("main") {
        let icon_bytes = match state {
            AgentState::Connected { .. } => ICON_CONNECTED,
            AgentState::NotPaired => ICON_NOT_PAIRED,
            _ => ICON_DISCONNECTED,
        };
        tray.set_icon(Some(Image::from_png_bytes(icon_bytes)?))?;

        let tooltip = match state {
            AgentState::Connected { hub, .. } => format!("OmniDeck Agent — Connected to {}", hub),
            AgentState::Connecting => "OmniDeck Agent — Connecting...".to_string(),
            AgentState::Disconnected { .. } => "OmniDeck Agent — Disconnected".to_string(),
            AgentState::NotPaired => "OmniDeck Agent — Not paired".to_string(),
            AgentState::Error { message } => format!("OmniDeck Agent — Error: {}", message),
        };
        tray.set_tooltip(Some(&tooltip))?;

        update_tray_menu(app, &tray, state)?;
    }

    Ok(())
}

fn update_tray_menu(app: &AppHandle, tray: &TrayIcon, state: &AgentState) -> tauri::Result<()> {
    let status_label = match state {
        AgentState::Connected { hub, .. } => format!("Connected to {}", hub),
        AgentState::Connecting => "Connecting...".to_string(),
        AgentState::Disconnected { .. } => "Disconnected".to_string(),
        AgentState::NotPaired => "Not paired".to_string(),
        AgentState::Error { message } => format!("Error: {}", message),
    };

    let is_paired = !matches!(state, AgentState::NotPaired);

    let status_item = MenuItem::with_id(app, "status", &status_label, false, None::<&str>)?;
    let separator1 = PredefinedMenuItem::separator(app)?;

    let open_hub = MenuItem::with_id(app, "open_hub", "Open OmniDeck", is_paired, None::<&str>)?;
    let pair_item = MenuItem::with_id(app, "pair", "Pair with Hub...", !is_paired, None::<&str>)?;

    let separator2 = PredefinedMenuItem::separator(app)?;

    // Check autostart state
    let autostart_enabled = app.autolaunch().is_enabled().unwrap_or(false);
    let autostart_item = CheckMenuItem::with_id(app, "toggle_autostart", "Start on Login", true, autostart_enabled, None::<&str>)?;

    let about_item = MenuItem::with_id(app, "about", "About OmniDeck Agent", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[
        &status_item,
        &separator1,
        &open_hub,
        &pair_item,
        &separator2,
        &autostart_item,
        &about_item,
        &quit_item,
    ])?;

    tray.set_menu(Some(menu))?;

    tray.on_menu_event(move |app, event| {
        match event.id().as_ref() {
            "open_hub" => {
                // Read hub URL from sidecar state
                let manager = app.state::<crate::SidecarState>();
                if let AgentState::Connected { hub_url, .. } = manager.0.state() {
                    if !hub_url.is_empty() {
                        // Convert wss:// agent URL to https:// web URL (port 9211)
                        let web_url = hub_url
                            .replace("wss://", "https://")
                            .replace("ws://", "http://")
                            .replace(":9210", ":9211");
                        let _ = app.opener().open_url(&web_url, None::<&str>);
                    }
                }
            }
            "pair" => {
                let _ = app.emit("show-pairing-window", ());
            }
            "toggle_autostart" => {
                let autolaunch = app.autolaunch();
                if autolaunch.is_enabled().unwrap_or(false) {
                    let _ = autolaunch.disable();
                } else {
                    let _ = autolaunch.enable();
                }
            }
            "about" => {
                let _ = tauri_plugin_dialog::MessageDialogBuilder::new(
                    "OmniDeck Agent",
                    format!("Version {}\n\nhttps://github.com/wemcdonald/OmniDeck", env!("CARGO_PKG_VERSION")),
                )
                .kind(tauri_plugin_dialog::MessageDialogKind::Info)
                .blocking_show();
            }
            "quit" => {
                let manager = app.state::<crate::SidecarState>();
                manager.0.stop();
                std::process::exit(0);
            }
            _ => {}
        }
    });

    Ok(())
}

/// Helper trait to access the autolaunch manager
trait AutoLaunchExt {
    fn autolaunch(&self) -> &tauri_plugin_autostart::AutoLaunchManager;
}

impl AutoLaunchExt for AppHandle {
    fn autolaunch(&self) -> &tauri_plugin_autostart::AutoLaunchManager {
        self.state::<tauri_plugin_autostart::AutoLaunchManager>().inner()
    }
}
