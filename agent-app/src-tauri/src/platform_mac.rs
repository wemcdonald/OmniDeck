use core_graphics::event::{CGEvent, CGEventFlags, CGEventTapLocation, CGKeyCode};
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
use serde_json::{json, Value};
use std::process::Command;

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
/// Uses /usr/bin/osascript under the Tauri app's process (which has Accessibility).
pub fn run_applescript(params: &Value) -> Value {
    let script = match params.get("script").and_then(|v| v.as_str()) {
        Some(s) => s,
        None => return json!({ "error": "missing script parameter" }),
    };

    match Command::new("/usr/bin/osascript")
        .arg("-e")
        .arg(script)
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
}

/// Dispatch a platform request to the appropriate handler.
pub fn handle_request(method: &str, params: &Value) -> Value {
    match method {
        "send_keystroke" => send_keystroke(params),
        "run_applescript" => run_applescript(params),
        _ => json!({ "error": format!("unknown platform method: {}", method) }),
    }
}
