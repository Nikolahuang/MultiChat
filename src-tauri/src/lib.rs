mod commands;
mod js_handlers;
mod providers;

use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// Application state shared across Tauri commands
pub struct AppState {
    pub webviews: Mutex<HashMap<String, tauri::Webview>>,
    pub login_status: Mutex<HashMap<String, bool>>,
    pub responding: Mutex<HashMap<String, bool>>,
    pub active_provider: Mutex<Option<String>>,
    /// Cache: last shown provider to avoid unnecessary repositioning
    pub last_shown_provider: Mutex<Option<String>>,
    pub sidebar_width: Mutex<f64>,
    /// Top offset for WebView positioning (title bar + tab bar + info bar height in physical px)
    pub webview_top_offset: Mutex<f64>,
    /// Latest captured AI response text per provider
    pub last_responses: Mutex<HashMap<String, String>>,
    /// Partial (streaming) responses per provider
    pub partial_responses: Mutex<HashMap<String, String>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            webviews: Mutex::new(HashMap::new()),
            login_status: Mutex::new(HashMap::new()),
            responding: Mutex::new(HashMap::new()),
            active_provider: Mutex::new(None),
            last_shown_provider: Mutex::new(None),
            sidebar_width: Mutex::new(280.0),
            webview_top_offset: Mutex::new(88.0), // Default: title bar ~36px + tab bar ~44px + info bar ~40px (adjustable)
            last_responses: Mutex::new(HashMap::new()),
            partial_responses: Mutex::new(HashMap::new()),
        }
    }
}

/// Handle mc:// protocol requests from AI webviews
fn handle_mc_protocol(
    app_handle: &tauri::AppHandle,
    request: http::Request<Vec<u8>>,
    responder: tauri::UriSchemeResponder,
) {
    let uri = request.uri().to_string();
    let method = request.method().as_str();

    // Handle CORS preflight
    if method == "OPTIONS" {
        let response = http::Response::builder()
            .header("Access-Control-Allow-Origin", "*")
            .header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            .header("Access-Control-Allow-Headers", "Content-Type")
            .body(b"".to_vec())
            .unwrap();
        responder.respond(response);
        return;
    }

    // Parse URI: mc://event/{type}/{encoded_json}
    let path = uri.strip_prefix("mc://").unwrap_or("");
    let parts: Vec<&str> = path.splitn(3, '/').collect();
    let event_type = parts.get(0).unwrap_or(&"");
    let encoded_data = parts.get(1).unwrap_or(&"");

    let data: serde_json::Value = urlencoding::decode(encoded_data)
        .ok()
        .and_then(|d| serde_json::from_str(&d).ok())
        .unwrap_or(serde_json::Value::Null);

    let provider_id = data
        .get("providerId")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();

    match *event_type {
        "login" => {
            let logged_in = data.get("loggedIn").and_then(|v| v.as_bool()).unwrap_or(false);
            let state = app_handle.state::<AppState>();
            if let Ok(mut ls) = state.login_status.lock() {
                ls.insert(provider_id.clone(), logged_in);
            }
            let _ = app_handle.emit(
                "login-changed",
                serde_json::json!({
                    "providerId": provider_id,
                    "loggedIn": logged_in,
                }),
            );
        }
        "status" => {
            let is_responding = data
                .get("responding")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let state = app_handle.state::<AppState>();
            let mut changed = false;
            if let Ok(mut rs) = state.responding.lock() {
                let prev = rs.get(&provider_id).copied().unwrap_or(false);
                if prev != is_responding {
                    rs.insert(provider_id.clone(), is_responding);
                    changed = true;
                }
            }
            if changed {
                let _ = app_handle.emit(
                    "responding-changed",
                    serde_json::json!({
                        "providerId": provider_id,
                        "responding": is_responding,
                    }),
                );
            }
        }
        "response" => {
            // Full AI response captured
            let content = data
                .get("content")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            eprintln!("[mc://] Response from {} ({} chars)", provider_id, content.len());

            let state = app_handle.state::<AppState>();
            if let Ok(mut lr) = state.last_responses.lock() {
                lr.insert(provider_id.clone(), content.clone());
            }
            // Clear partial response
            if let Ok(mut pr) = state.partial_responses.lock() {
                pr.remove(&provider_id);
            }

            let _ = app_handle.emit(
                "ai-response",
                serde_json::json!({
                    "providerId": provider_id,
                    "content": content,
                }),
            );
        }
        "partial-response" => {
            // Streaming/partial AI response
            let content = data
                .get("content")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let state = app_handle.state::<AppState>();
            if let Ok(mut pr) = state.partial_responses.lock() {
                pr.insert(provider_id.clone(), content.clone());
            }

            let _ = app_handle.emit(
                "ai-partial-response",
                serde_json::json!({
                    "providerId": provider_id,
                    "content": content,
                }),
            );
        }
        "bridge-ready" => {
            eprintln!("[mc://] Bridge ready for {}", provider_id);
            let _ = app_handle.emit(
                "bridge-ready",
                serde_json::json!({
                    "providerId": provider_id,
                }),
            );
        }
        _ => {
            eprintln!("[mc://] Unknown event: {}", event_type);
        }
    }

    let response = http::Response::builder()
        .header("Access-Control-Allow-Origin", "*")
        .body(b"ok".to_vec())
        .unwrap();
    responder.respond(response);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState::default())
        .register_asynchronous_uri_scheme_protocol(
            "mc",
            |ctx, request, responder| {
                let app_handle = ctx.app_handle().clone();
                handle_mc_protocol(&app_handle, request, responder);
            },
        )
        .setup(move |app| {
            let app_handle = app.handle().clone();

            // Handle window resize (DEBOUNCED to avoid performance hit)
            let app_resize = app_handle.clone();
            if let Some(window) = app.get_webview_window("main") {
                use std::sync::Mutex;
                // Use a simple timestamp for debouncing stored in a Mutex
                let last_resize_time: Mutex<Option<std::time::Instant>> = Mutex::new(None);

                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Resized(_) = event {
                        let now = std::time::Instant::now();
                        {
                            let mut last = last_resize_time.lock().unwrap();
                            match *last {
                                Some(t) if now.duration_since(t).as_millis() < 150 => return,
                                _ => {}
                            }
                            *last = Some(now);
                        }

                        let state = app_resize.state::<AppState>();

                        // Single lock scope to read all values at once (reduces contention)
                        let (sw_val, top_off, count): (f64, f64, usize) = {
                            let sw = state.sidebar_width.lock().map(|s| *s).unwrap_or(280.0);
                            let to = state.webview_top_offset.lock().map(|t| *t).unwrap_or(88.0);
                            let c = state.webviews.lock().map(|w| w.len()).unwrap_or(0);
                            (sw, to, c)
                        };

                        if count == 0 { return; }

                        // Now get size and reposition ALL webviews (position + size)
                        if let Some(win) = app_resize.get_webview_window("main") {
                            if let Ok(size) = win.inner_size() {
                                // Calculate new dimensions
                                let new_w = (size.width as f64 - sw_val).max(100.0) as u32;
                                let new_h = (size.height as f64 - top_off).max(100.0) as u32;
                                let new_x = sw_val as i32;
                                let new_y = top_off as i32;

                                if let Ok(wvs) = state.webviews.lock() {
                                    for (_, wv) in wvs.iter() {
                                        // Update BOTH position AND size
                                        let _ = wv.set_position(tauri::Position::Physical(
                                            tauri::PhysicalPosition::new(new_x, new_y),
                                        ));
                                        let _ = wv.set_size(tauri::Size::Physical(
                                            tauri::PhysicalSize::new(new_w, new_h),
                                        ));
                                    }
                                } // webviews lock released here
                            }
                        }
                    }
                });
            }

            eprintln!("[MultiChat] App initialized successfully (lazy-load mode)");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_providers,
            commands::broadcast_message,
            commands::show_provider,
            commands::hide_all_providers,
            commands::get_login_status,
            commands::set_sidebar_width,
            commands::init_webviews,
            commands::create_webview,
            commands::destroy_webview,
            commands::minimize_window,
            commands::toggle_maximize,
            commands::close_window,
            commands::reinject_bridge,
            commands::navigate_home,
            commands::get_last_response,
            commands::get_all_responses,
            commands::set_webview_top_offset,
        ])
        .run(tauri::generate_context!())
        .expect("error while running MultiChat");
}
