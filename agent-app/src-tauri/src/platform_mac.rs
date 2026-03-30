use core_graphics::event::{CGEvent, CGEventFlags, CGEventTapLocation, CGKeyCode};
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
use serde_json::{json, Value};

/// Post a CGEvent keyboard event. Accepts keyCode (u16) and flags (u64).
pub fn send_keystroke(params: &Value) -> Value {
    let key_code = match params.get("keyCode").and_then(|v| v.as_u64()) {
        Some(k) => k as CGKeyCode,
        None => return json!({ "error": "missing or invalid keyCode" }),
    };
    let flags_raw = params.get("flags").and_then(|v| v.as_u64()).unwrap_or(0);
    let flags = CGEventFlags::from_bits_truncate(flags_raw);

    let source = match CGEventSource::new(CGEventSourceStateID::HIDSystemState) {
        Ok(s) => s,
        Err(_) => return json!({ "error": "failed to create CGEventSource" }),
    };

    // Key down
    let down = match CGEvent::new_keyboard_event(source.clone(), key_code, true) {
        Ok(e) => e,
        Err(_) => return json!({ "error": "failed to create key down event" }),
    };
    down.set_flags(flags);
    down.post(CGEventTapLocation::HID);

    // Key up
    if let Ok(up) = CGEvent::new_keyboard_event(source, key_code, false) {
        up.set_flags(flags);
        up.post(CGEventTapLocation::HID);
    }

    json!({ "success": true })
}

/// Execute an AppleScript string and return the result.
/// Falls back to /usr/bin/osascript since NSAppleScript requires main-thread
/// execution for Apple Events, which conflicts with the Tauri event loop.
/// Running osascript as a child of the Tauri app inherits its Accessibility.
pub fn run_applescript(params: &Value) -> Value {
    let script = match params.get("script").and_then(|v| v.as_str()) {
        Some(s) => s,
        None => return json!({ "error": "missing script parameter" }),
    };

    // Run on a dedicated thread to avoid blocking the async event loop.
    let script_owned = script.to_string();
    let handle = std::thread::spawn(move || {
        match std::process::Command::new("/usr/bin/osascript")
            .arg("-e")
            .arg(&script_owned)
            .output()
        {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                if output.status.success() {
                    json!({ "result": stdout })
                } else {
                    json!({ "error": stderr, "exitCode": output.status.code() })
                }
            }
            Err(e) => json!({ "error": format!("failed to spawn osascript: {}", e) }),
        }
    });

    handle.join().unwrap_or_else(|_| json!({ "error": "AppleScript thread panicked" }))
}

/// Activate an app, wait briefly, then send a keystroke — all in one call.
/// Avoids timing issues from separate IPC round-trips.
/// Params: { app: "zoom.us", keyCode: u16, flags: u64 }
/// Optionally restores the previously focused app afterward.
pub fn send_keystroke_to_app(params: &Value) -> Value {
    let app = match params.get("app").and_then(|v| v.as_str()) {
        Some(a) => a,
        None => return json!({ "error": "missing app parameter" }),
    };

    // Save current frontmost app and activate target
    let activate_result = run_applescript(&json!({
        "script": format!(
            "tell application \"System Events\"\n\
               set frontApp to bundle identifier of first application process whose frontmost is true\n\
             end tell\n\
             tell application \"{}\" to activate\n\
             delay 0.2\n\
             return frontApp",
            app
        )
    }));
    let prev_app = activate_result
        .get("result")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    // Send the keystroke
    let result = send_keystroke(params);

    // Restore previous app (best effort)
    let target_bundle = app.replace("\"", "");
    if !prev_app.is_empty() && prev_app != target_bundle {
        let restore_script = format!("tell application id \"{}\" to activate", prev_app);
        std::thread::spawn(move || {
            let _ = std::process::Command::new("/usr/bin/osascript")
                .arg("-e")
                .arg(&restore_script)
                .output();
        });
    }

    result
}

/// Dispatch a platform request to the appropriate handler.
pub fn handle_request(method: &str, params: &Value) -> Value {
    match method {
        "send_keystroke" => send_keystroke(params),
        "send_keystroke_to_app" => send_keystroke_to_app(params),
        "run_applescript" => run_applescript(params),
        _ => json!({ "error": format!("unknown platform method: {}", method) }),
    }
}
