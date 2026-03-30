use core_graphics::event::{CGEvent, CGEventFlags, CGEventTapLocation, CGKeyCode};
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
use objc2::AnyThread;
use objc2_foundation::{NSAppleScript, NSDictionary, NSString};
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

/// Execute an AppleScript string in-process using NSAppleScript.
/// Runs within the Tauri app process which has Accessibility permission,
/// so System Events access works without granting the sidecar Accessibility.
pub fn run_applescript(params: &Value) -> Value {
    let script = match params.get("script").and_then(|v| v.as_str()) {
        Some(s) => s,
        None => return json!({ "error": "missing script parameter" }),
    };

    exec_applescript_in_process(script)
}

/// Run an AppleScript string via NSAppleScript on a dedicated thread
/// to avoid blocking the Tauri async runtime.
fn exec_applescript_in_process(script: &str) -> Value {
    let script_owned = script.to_string();

    // Run on a separate thread to avoid blocking the async event loop.
    let handle = std::thread::spawn(move || {
        let source = NSString::from_str(&script_owned);
        let ns_script = match NSAppleScript::initWithSource(NSAppleScript::alloc(), &source) {
            Some(s) => s,
            None => return json!({ "error": "failed to create NSAppleScript" }),
        };

        let mut error_info: Option<objc2::rc::Retained<NSDictionary<NSString, objc2::runtime::AnyObject>>> = None;
        let result = unsafe { ns_script.executeAndReturnError(Some(&mut error_info)) };

        if let Some(err_dict) = error_info {
            let err_key = NSString::from_str("NSAppleScriptErrorMessage");
            let err_msg = err_dict.objectForKey(&err_key);
            let msg = err_msg
                .map(|obj| {
                    let ns_str: &NSString = unsafe { &*(&*obj as *const _ as *const NSString) };
                    ns_str.to_string()
                })
                .unwrap_or_else(|| "AppleScript execution failed".to_string());
            json!({ "error": msg })
        } else {
            let result_str = result.stringValue()
                .map(|s| s.to_string())
                .unwrap_or_default();
            json!({ "result": result_str })
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

    // Save current frontmost app and activate target (in-process AppleScript)
    let activate_script = format!(
        "tell application \"System Events\"\n\
           set frontApp to bundle identifier of first application process whose frontmost is true\n\
         end tell\n\
         tell application \"{}\" to activate\n\
         delay 0.2\n\
         return frontApp",
        app
    );
    let activate_result = exec_applescript_in_process(&activate_script);
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
        // Fire-and-forget on a separate thread
        std::thread::spawn(move || {
            exec_applescript_in_process(&restore_script);
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
