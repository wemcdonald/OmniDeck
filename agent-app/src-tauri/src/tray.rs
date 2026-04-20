use tauri::{
    AppHandle, Emitter, Manager,
    menu::{Menu, MenuItem, PredefinedMenuItem, CheckMenuItem},
    tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState},
    image::Image,
};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_dialog::DialogExt;

use crate::sidecar::AgentState;

const ICON_CONNECTED: &[u8] = include_bytes!("../icons/tray-connected.png");
const ICON_DISCONNECTED: &[u8] = include_bytes!("../icons/tray-disconnected.png");
const ICON_NOT_PAIRED: &[u8] = include_bytes!("../icons/tray-not-paired.png");

fn load_icon(bytes: &[u8]) -> tauri::Result<Image<'static>> {
    Image::from_bytes(bytes)
}

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_menu(app, &AgentState::NotPaired)?;

    let _tray = TrayIconBuilder::with_id("main")
        .icon(load_icon(ICON_NOT_PAIRED)?)
        .tooltip("OmniDeck Agent")
        .menu(&menu)
        .on_menu_event(handle_menu_event)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                let _ = tray.app_handle().emit("tray-click", ());
            }
        })
        .build(app)?;

    Ok(())
}

pub fn update_tray(app: &AppHandle, state: &AgentState) -> tauri::Result<()> {
    if let Some(tray) = app.tray_by_id("main") {
        let icon_bytes = match state {
            AgentState::Connected { .. } => ICON_CONNECTED,
            AgentState::NotPaired => ICON_NOT_PAIRED,
            _ => ICON_DISCONNECTED,
        };
        tray.set_icon(Some(load_icon(icon_bytes)?))?;

        let tooltip = match state {
            AgentState::Connected { hub, .. } => format!("OmniDeck Agent — Connected to {}", hub),
            AgentState::Connecting => "OmniDeck Agent — Connecting...".to_string(),
            AgentState::Disconnected { .. } => "OmniDeck Agent — Disconnected".to_string(),
            AgentState::NotPaired => "OmniDeck Agent — Not paired".to_string(),
            AgentState::Error { message } => format!("OmniDeck Agent — Error: {}", message),
        };
        tray.set_tooltip(Some(&tooltip))?;

        let menu = build_menu(app, state)?;
        tray.set_menu(Some(menu))?;
    }

    Ok(())
}

fn build_menu(app: &AppHandle, state: &AgentState) -> tauri::Result<Menu<tauri::Wry>> {
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
    let unpair_item = MenuItem::with_id(app, "unpair", "Unpair Hub...", is_paired, None::<&str>)?;

    let separator2 = PredefinedMenuItem::separator(app)?;

    let autostart_enabled = app
        .state::<tauri_plugin_autostart::AutoLaunchManager>()
        .is_enabled()
        .unwrap_or(false);
    let autostart_item = CheckMenuItem::with_id(
        app, "toggle_autostart", "Start on Login", true, autostart_enabled, None::<&str>,
    )?;

    let about_item = MenuItem::with_id(app, "about", "About OmniDeck Agent", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    Menu::with_items(app, &[
        &status_item,
        &separator1,
        &open_hub,
        &pair_item,
        &unpair_item,
        &separator2,
        &autostart_item,
        &about_item,
        &quit_item,
    ])
}

fn handle_menu_event(app: &AppHandle, event: tauri::menu::MenuEvent) {
    match event.id().as_ref() {
        "open_hub" => {
            let manager = app.state::<crate::SidecarState>();
            if let AgentState::Connected { hub_url, .. } = manager.0.state() {
                if !hub_url.is_empty() {
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
        "unpair" => {
            let app_handle = app.clone();
            tauri::async_runtime::spawn(async move {
                let confirmed = tauri_plugin_dialog::MessageDialogBuilder::new(
                    app_handle.dialog().clone(),
                    "Unpair OmniDeck Agent",
                    "This will remove this agent from the hub and delete local credentials. Continue?",
                )
                .kind(tauri_plugin_dialog::MessageDialogKind::Warning)
                .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancel)
                .blocking_show();
                if confirmed {
                    if let Err(e) = crate::cmd_unpair(app_handle.clone()).await {
                        eprintln!("Unpair failed: {}", e);
                    }
                }
            });
        }
        "toggle_autostart" => {
            let autolaunch = app.state::<tauri_plugin_autostart::AutoLaunchManager>();
            if autolaunch.is_enabled().unwrap_or(false) {
                let _ = autolaunch.disable();
            } else {
                let _ = autolaunch.enable();
            }
        }
        "about" => {
            tauri_plugin_dialog::MessageDialogBuilder::new(
                app.dialog().clone(),
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
}
