// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // On macOS, set activation policy so the app runs as a menu bar agent (no dock icon)
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::{NSApplication, NSApplicationActivationPolicy};
        let app = NSApplication::sharedApplication();
        app.setActivationPolicy(NSApplicationActivationPolicy::Accessory);
    }

    omnideck_agent_app::run();
}
