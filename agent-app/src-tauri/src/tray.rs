use tauri::{
    AppHandle, Emitter, Manager,
    menu::{Menu, MenuItem, PredefinedMenuItem, CheckMenuItem, Submenu},
    tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState},
    image::Image,
};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_dialog::DialogExt;

use crate::sidecar::{AgentState, PairedHubStatus};

const ICON_CONNECTED: &[u8] = include_bytes!("../icons/tray-connected.png");
const ICON_DISCONNECTED: &[u8] = include_bytes!("../icons/tray-disconnected.png");
const ICON_NOT_PAIRED: &[u8] = include_bytes!("../icons/tray-not-paired.png");

fn load_icon(bytes: &[u8]) -> tauri::Result<Image<'static>> {
    Image::from_bytes(bytes)
}

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_menu(app, &AgentState::NotPaired, &[])?;

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
    let hubs = app.state::<crate::SidecarState>().0.paired_hubs();
    update_tray_with_hubs(app, state, &hubs)
}

pub fn update_tray_with_hubs(
    app: &AppHandle,
    state: &AgentState,
    hubs: &[PairedHubStatus],
) -> tauri::Result<()> {
    if let Some(tray) = app.tray_by_id("main") {
        let any_connected = hubs.iter().any(|h| h.connected);
        let icon_bytes = if hubs.is_empty() {
            ICON_NOT_PAIRED
        } else if any_connected {
            ICON_CONNECTED
        } else {
            ICON_DISCONNECTED
        };
        tray.set_icon(Some(load_icon(icon_bytes)?))?;

        let tooltip = if hubs.is_empty() {
            "OmniDeck Agent — Not paired".to_string()
        } else if hubs.len() == 1 {
            if hubs[0].connected {
                format!("OmniDeck Agent — Connected to {}", hubs[0].hub.hub_name)
            } else {
                format!("OmniDeck Agent — {} offline", hubs[0].hub.hub_name)
            }
        } else {
            let connected_count = hubs.iter().filter(|h| h.connected).count();
            format!(
                "OmniDeck Agent — {}/{} hubs connected",
                connected_count,
                hubs.len()
            )
        };
        tray.set_tooltip(Some(&tooltip))?;

        let menu = build_menu(app, state, hubs)?;
        tray.set_menu(Some(menu))?;
    }

    Ok(())
}

fn build_menu(
    app: &AppHandle,
    state: &AgentState,
    hubs: &[PairedHubStatus],
) -> tauri::Result<Menu<tauri::Wry>> {
    let status_label = if hubs.is_empty() {
        "Not paired".to_string()
    } else if hubs.len() == 1 {
        let h = &hubs[0];
        if h.connected {
            format!("Connected to {}", h.hub.hub_name)
        } else {
            format!("{} — offline", h.hub.hub_name)
        }
    } else {
        let connected = hubs.iter().filter(|h| h.connected).count();
        format!("{}/{} hubs connected", connected, hubs.len())
    };

    let _ = state; // Coarse enum still exists but the menu now renders from the per-hub list.
    let is_paired = !hubs.is_empty();

    let status_item = MenuItem::with_id(app, "status", &status_label, false, None::<&str>)?;
    let separator1 = PredefinedMenuItem::separator(app)?;

    let open_hub = MenuItem::with_id(app, "open_hub", "Open OmniDeck", is_paired, None::<&str>)?;
    let pair_label = if is_paired { "Pair with Another Hub..." } else { "Pair with Hub..." };
    let pair_item = MenuItem::with_id(app, "pair", pair_label, true, None::<&str>)?;

    // Unpair: flat item for a single hub, submenu when two or more.
    let unpair_menu_entry: Option<MenuItem<tauri::Wry>>;
    let unpair_submenu: Option<Submenu<tauri::Wry>>;
    if hubs.len() <= 1 {
        let label = if hubs.is_empty() {
            "Unpair Hub...".to_string()
        } else {
            format!("Unpair {}...", hubs[0].hub.hub_name)
        };
        let id = if hubs.is_empty() { "unpair".to_string() } else { format!("unpair:{}", hubs[0].hub.agent_id) };
        unpair_menu_entry = Some(MenuItem::with_id(app, &id, &label, is_paired, None::<&str>)?);
        unpair_submenu = None;
    } else {
        let sub = Submenu::with_id(app, "unpair_menu", "Unpair Hub", true)?;
        for h in hubs {
            let label = if h.connected {
                h.hub.hub_name.clone()
            } else {
                format!("{} (offline)", h.hub.hub_name)
            };
            let item = MenuItem::with_id(
                app,
                &format!("unpair:{}", h.hub.agent_id),
                &label,
                true,
                None::<&str>,
            )?;
            sub.append(&item)?;
        }
        unpair_menu_entry = None;
        unpair_submenu = Some(sub);
    }

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

    let mut items: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> = vec![
        &status_item,
        &separator1,
        &open_hub,
        &pair_item,
    ];
    if let Some(ref entry) = unpair_menu_entry {
        items.push(entry);
    }
    if let Some(ref submenu) = unpair_submenu {
        items.push(submenu);
    }
    items.extend_from_slice(&[
        &separator2 as &dyn tauri::menu::IsMenuItem<tauri::Wry>,
        &autostart_item,
        &about_item,
        &quit_item,
    ]);

    Menu::with_items(app, &items)
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
        id if id == "unpair" || id.starts_with("unpair:") => {
            let agent_id: Option<String> = id.strip_prefix("unpair:").map(|s| s.to_string());
            let hubs = app.state::<crate::SidecarState>().0.paired_hubs();
            let display_name = agent_id
                .as_ref()
                .and_then(|aid| hubs.iter().find(|h| h.hub.agent_id == *aid).map(|h| h.hub.hub_name.clone()))
                .unwrap_or_else(|| "OmniDeck".to_string());
            let app_handle = app.clone();
            tauri::async_runtime::spawn(async move {
                let confirmed = tauri_plugin_dialog::MessageDialogBuilder::new(
                    app_handle.dialog().clone(),
                    format!("Unpair {}", display_name),
                    format!(
                        "This will remove this agent from {} and delete its local credentials. Continue?",
                        display_name
                    ),
                )
                .kind(tauri_plugin_dialog::MessageDialogKind::Warning)
                .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancel)
                .blocking_show();
                if confirmed {
                    if let Err(e) = crate::do_unpair(app_handle.clone(), agent_id).await {
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
