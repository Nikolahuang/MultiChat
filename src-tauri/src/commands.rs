use crate::js_handlers;
use crate::providers;
use crate::AppState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl};

/// Get all providers info for the frontend
#[tauri::command]
pub fn get_providers() -> Vec<ProviderInfo> {
    providers::PROVIDERS
        .iter()
        .map(|p| ProviderInfo {
            id: p.id.to_string(),
            name: p.name.to_string(),
            url: p.url.to_string(),
            icon: p.icon.to_string(),
        })
        .collect()
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ProviderInfo {
    pub id: String,
    pub name: String,
    pub url: String,
    pub icon: String,
}

/// Broadcast a message to multiple AI platforms
/// v2: Uses async sleeps instead of thread::sleep to avoid blocking UI
#[tauri::command]
pub async fn broadcast_message(
    app: AppHandle,
    text: String,
    targets: Vec<String>,
) -> Result<HashMap<String, bool>, String> {
    let state = app.state::<AppState>();

    // Step 1: Ensure all target webviews exist (lazy-load on demand)
    {
        let missing_targets: Vec<String> = {
            let wvs = state.webviews.lock().map_err(|e| e.to_string())?;
            targets
                .iter()
                .filter(|t| !wvs.contains_key(*t))
                .cloned()
                .collect()
        }; // wvs dropped here before any await

        if !missing_targets.is_empty() {
            eprintln!(
                "[MultiChat] Lazy-creating {} webviews for broadcast...",
                missing_targets.len()
            );

            for target in &missing_targets {
                let provider = providers::get_provider(target)
                    .ok_or_else(|| format!("Unknown provider: {}", target))?;

                let window = app.get_window("main").ok_or("main window not found")?;
                let sw = *state.sidebar_width.lock().map_err(|e| e.to_string())?;
                let win_size = window.inner_size().map_err(|e| e.to_string())?;

                let label = format!("ai-{}", target);
                let url: url::Url = provider.url.parse().map_err(|e: url::ParseError| e.to_string())?;
                let wv_builder =
                    tauri::webview::WebviewBuilder::new(&label, WebviewUrl::External(url));

                let position =
                    tauri::Position::Physical(tauri::PhysicalPosition::new(-20000, -20000));
                let size = tauri::Size::Physical(tauri::PhysicalSize::new(
                    (win_size.width - sw as u32).max(100),
                    win_size.height,
                ));

                match window.add_child(wv_builder, position, size) {
                    Ok(wv) => {
                        let mut wvs2 = state.webviews.lock().map_err(|e| e.to_string())?;
                        wvs2.insert(target.clone(), wv);
                        drop(wvs2); // Release lock BEFORE spawning thread

                        // Inject bridge after a delay in a background thread
                        let app_clone = app.clone();
                        let pid = target.clone();
                        std::thread::spawn(move || {
                            std::thread::sleep(std::time::Duration::from_secs(3));
                            if let Some(wv) = app_clone.get_webview(&format!("ai-{}", pid)) {
                                let _ = wv.eval(&js_handlers::bridge_script(&pid));
                                eprintln!("[{}] Bridge injected during broadcast", pid);
                            }
                        });
                    }
                    Err(e) => {
                        eprintln!("[{}] Failed to create webview: {}", target, e);
                    }
                }
            }

            // ASYNC wait for pages to load — does NOT block UI thread
            eprintln!("[MultiChat] Async waiting 6s for pages + bridges to initialize...");
            tokio::time::sleep(std::time::Duration::from_secs(6)).await;
        }
    }

    // Step 2: For already-existing webviews, ensure bridge is injected
    for target in &targets {
        let exists = {
            let wvs = state.webviews.lock().map_err(|e| e.to_string())?;
            wvs.contains_key(target)
        }; // Lock released before any await

        if exists {
            let pid = target.clone();
            if let Some(wv) = app.get_webview(&format!("ai-{}", pid)) {
                let _ = wv.eval(&js_handlers::bridge_script(&pid));
                eprintln!("[{}] Bridge ensured before send", pid);
            }
        }
    }

    // ASYNC pause after bridge injection
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;

    // Step 3: Send message with retry logic (async waits, no blocking)
    // Process each target individually — acquire lock per attempt to avoid holding it during sleeps
    let mut results = HashMap::new();

    for target in &targets {
        let mut sent = false;

        for attempt in 0..3u32 {
            let js = js_handlers::send_script(target, &text);

            // Briefly acquire lock just to eval the JS
            let eval_result = {
                let wvs = state.webviews.lock().map_err(|e| e.to_string())?;
                match wvs.get(target) {
                    Some(wv) => wv.eval(&js).map_err(|e| e.to_string()),
                    None => Err(format!("No webview for {}", target)),
                }
            };

            match eval_result {
                Ok(()) => {
                    results.insert(target.clone(), true);
                    // CRITICAL: Update Rust-side responding state BEFORE emitting event.
                    // The bridge will later send responding=false, and the status handler
                    // only forwards events when the value CHANGES. If we don't set it
                    // true here, the subsequent false will be filtered out!
                    {
                        let mut rs_guard = state.responding.lock().map_err(|e| e.to_string())?;
                        rs_guard.insert(target.clone(), true);
                        // MutexGuard is dropped here, releasing the lock
                    }
                    let _ = app.emit(
                        "responding-changed",
                        ResponseStatus {
                            provider_id: target.clone(),
                            responding: true,
                        },
                    );
                    sent = true;
                    break;
                }
                Err(e) => {
                    eprintln!("[{}] send attempt {} error: {}", target, attempt + 1, e);
                    if attempt < 2 {
                        // ASYNC wait before retry — no UI blocking
                        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                        // Re-inject bridge before retry
                        {
                            let wvs = state.webviews.lock().map_err(|e| e.to_string())?;
                            if let Some(wv) = wvs.get(target) {
                                let _ = wv.eval(&js_handlers::bridge_script(target));
                            }
                        }
                        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    }
                }
            }
        }

        if !sent {
            results.insert(target.clone(), false);
            eprintln!("[{}] FAILED after 3 attempts", target);
            let _ = app.emit(
                "send-failed",
                serde_json::json!({
                    "providerId": target,
                    "reason": "failed after 3 attempts"
                }),
            );
        }
    }

    eprintln!(
        "[MultiChat] Broadcast complete: {}/{} succeeded",
        results.values().filter(|&&v| v).count(),
        targets.len()
    );
    Ok(results)
}

#[derive(Serialize, Clone)]
pub struct ResponseStatus {
    pub provider_id: String,
    pub responding: bool,
}

/// Show a specific AI provider's webview (bring to foreground)
#[tauri::command]
pub async fn show_provider(app: AppHandle, provider_id: String) -> Result<(), String> {
    let state = app.state::<AppState>();

    // OPTIMIZATION: Skip if already showing this provider
    {
        let last = state.last_shown_provider.lock().map_err(|e| e.to_string())?;
        if *last == Some(provider_id.clone()) {
            return Ok(()); // Already visible, nothing to do
        }
    }

    let wvs = state.webviews.lock().map_err(|e| e.to_string())?;
    let sidebar_w = state.sidebar_width.lock().map_err(|e| e.to_string())?;
    let top_offset = state.webview_top_offset.lock().map_err(|e| e.to_string())?;
    let sw = *sidebar_w;
    let top = *top_offset as i32;

    // Hide all AI webviews first (move off-screen), show the selected one
    for (id, wv) in wvs.iter() {
        if id == &provider_id {
            let _ = wv.set_position(tauri::Position::Physical(
                tauri::PhysicalPosition::new(sw as i32, top),
            ));
        } else {
            let _ = wv.set_position(tauri::Position::Physical(
                tauri::PhysicalPosition::new(-20000, -20000),
            ));
        }
    }

    // Update caches
    {
        let mut active = state.active_provider.lock().map_err(|e| e.to_string())?;
        *active = Some(provider_id.clone());
    }
    {
        let mut last_shown = state.last_shown_provider.lock().map_err(|e| e.to_string())?;
        *last_shown = Some(provider_id.clone());
    }
    let _ = app.emit("provider-changed", provider_id);
    Ok(())
}

/// Hide all AI webviews (show placeholder)
#[tauri::command]
pub async fn hide_all_providers(app: AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    let wvs = state.webviews.lock().map_err(|e| e.to_string())?;
    for (_, wv) in wvs.iter() {
        let _ = wv.set_position(tauri::Position::Physical(
            tauri::PhysicalPosition::new(-20000, -20000),
        ));
    }
    {
        let mut active = state.active_provider.lock().map_err(|e| e.to_string())?;
        *active = None;
    }
    {
        let mut last_shown = state.last_shown_provider.lock().map_err(|e| e.to_string())?;
        *last_shown = None;
    }
    let _ = app.emit("provider-changed", "");
    Ok(())
}

/// Get current login status of all providers
#[tauri::command]
pub async fn get_login_status(app: AppHandle) -> Result<HashMap<String, bool>, String> {
    let state = app.state::<AppState>();
    let status = state.login_status.lock().map_err(|e| e.to_string())?;
    Ok(status.clone())
}

/// Get the last captured response from a specific provider
#[tauri::command]
pub async fn get_last_response(app: AppHandle, provider_id: String) -> Result<String, String> {
    let state = app.state::<AppState>();
    let responses = state.last_responses.lock().map_err(|e| e.to_string())?;
    Ok(responses.get(&provider_id).cloned().unwrap_or_default())
}

/// Get all captured responses from all providers
#[tauri::command]
pub async fn get_all_responses(app: AppHandle) -> Result<HashMap<String, String>, String> {
    let state = app.state::<AppState>();
    let responses = state.last_responses.lock().map_err(|e| e.to_string())?;
    Ok(responses.clone())
}

/// Update sidebar width (called from frontend on resize/layout changes)
#[tauri::command]
pub async fn set_sidebar_width(app: AppHandle, width: f64) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut sw = state.sidebar_width.lock().map_err(|e| e.to_string())?;

    // Skip if value hasn't changed (avoid unnecessary repositioning)
    if (*sw - width).abs() < 1.0 {
        return Ok(());
    }

    *sw = width;
    Ok(())
}

/// Update the WebView top offset (used to position webview below title bar + tab bar)
#[tauri::command]
pub async fn set_webview_top_offset(app: AppHandle, offset: f64) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut off = state.webview_top_offset.lock().map_err(|e| e.to_string())?;

    // Skip if value hasn't changed (avoid unnecessary repositioning on resize)
    if (*off - offset).abs() < 2.0 {
        return Ok(());
    }

    *off = offset;
    // eprintln!("[MultiChat] WebView top offset set to {}px", offset);  // Comment out for perf
    Ok(())
}

/// Create a single AI webview on-demand (lazy loading)
#[tauri::command]
pub async fn create_webview(app: AppHandle, provider_id: String) -> Result<ProviderInfo, String> {
    let state = app.state::<AppState>();
    let mut wvs = state.webviews.lock().map_err(|e| e.to_string())?;

    // Already exists?
    if wvs.contains_key(&provider_id) {
        if let Some(provider) = providers::get_provider(&provider_id) {
            return Ok(ProviderInfo {
                id: provider.id.to_string(),
                name: provider.name.to_string(),
                url: provider.url.to_string(),
                icon: provider.icon.to_string(),
            });
        } else {
            return Err(format!("Unknown provider: {}", provider_id));
        }
    }

    // Find provider config
    let provider = providers::get_provider(&provider_id)
        .ok_or_else(|| format!("Unknown provider: {}", provider_id))?;

    // Get window
    let window = app.get_window("main").ok_or("main window not found")?;
    let sw = *state.sidebar_width.lock().map_err(|e| e.to_string())?;
    let top_offset = *state.webview_top_offset.lock().map_err(|e| e.to_string())? as u32;
    let win_size = window.inner_size().map_err(|e| e.to_string())?;

    let label = format!("ai-{}", provider.id);
    let url: url::Url = provider.url.parse().map_err(|e: url::ParseError| e.to_string())?;

    let wv_builder = tauri::webview::WebviewBuilder::new(&label, WebviewUrl::External(url));

    // Start hidden off-screen
    let position = tauri::Position::Physical(tauri::PhysicalPosition::new(-20000, -20000));
    let size = tauri::Size::Physical(tauri::PhysicalSize::new(
        (win_size.width - sw as u32).max(100),
        (win_size.height.saturating_sub(top_offset)).max(100),
    ));

    let wv = window
        .add_child(wv_builder, position, size)
        .map_err(|e: tauri::Error| e.to_string())?;

    // Inject bridge script after page load in background thread
    let app_clone = app.clone();
    let pid = provider_id.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(5));
        if let Some(wv) = app_clone.get_webview(&format!("ai-{}", pid)) {
            let _ = wv.eval(&js_handlers::bridge_script(&pid));
            eprintln!("[{}] WebView created & bridge injected", pid);
        }
    });

    wvs.insert(provider_id.clone(), wv);

    Ok(ProviderInfo {
        id: provider.id.to_string(),
        name: provider.name.to_string(),
        url: provider.url.to_string(),
        icon: provider.icon.to_string(),
    })
}

/// Initialize: just return provider list, don't create any webviews yet
#[tauri::command]
pub async fn init_webviews(_app: AppHandle) -> Result<Vec<ProviderInfo>, String> {
    eprintln!(
        "[MultiChat] Lazy init mode: {} providers available",
        providers::PROVIDERS.len()
    );

    Ok(providers::PROVIDERS
        .iter()
        .map(|p| ProviderInfo {
            id: p.id.to_string(),
            name: p.name.to_string(),
            url: p.url.to_string(),
            icon: p.icon.to_string(),
        })
        .collect())
}

/// Destroy a specific webview to free resources
/// v2: Navigate to about:blank to actually release the page resources,
///     then remove from tracking. The WebView shell stays but uses minimal memory.
#[tauri::command]
pub async fn destroy_webview(app: AppHandle, provider_id: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut wvs = state.webviews.lock().map_err(|e: std::sync::PoisonError<_>| e.to_string())?;

    if let Some(wv) = wvs.remove(&provider_id) {
        // Navigate to about:blank to release the AI platform page resources
        // (Can't truly destroy a child WebView in Tauri v2, but this frees most memory)
        let _ = wv.eval("window.location.href = 'about:blank';");
        // Move off-screen
        let _ = wv.set_position(tauri::Position::Physical(
            tauri::PhysicalPosition::new(-20000, -20000),
        ));
        eprintln!(
            "[{}] WebView destroyed (navigated to about:blank, removed from tracking)",
            provider_id
        );
    }

    Ok(())
}

/// Window control commands
#[tauri::command]
pub async fn minimize_window(app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("window not found")?;
    window.minimize().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn toggle_maximize(app: AppHandle) -> Result<bool, String> {
    let window = app.get_webview_window("main").ok_or("window not found")?;
    let is_max = window.is_maximized().map_err(|e| e.to_string())?;
    if is_max {
        window.unmaximize().map_err(|e| e.to_string())?;
    } else {
        window.maximize().map_err(|e| e.to_string())?;
    }
    Ok(!is_max)
}

#[tauri::command]
pub async fn close_window(app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("window not found")?;
    window.close().map_err(|e| e.to_string())?;
    Ok(())
}

/// Re-inject bridge script into a specific webview
#[tauri::command]
pub async fn reinject_bridge(app: AppHandle, provider_id: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let wvs = state.webviews.lock().map_err(|e| e.to_string())?;
    if let Some(wv) = wvs.get(&provider_id) {
        let _ = wv.eval(&js_handlers::bridge_script(&provider_id));
        eprintln!("[{}] Bridge script re-injected", provider_id);
    }
    Ok(())
}

/// Navigate a webview to its home URL
#[tauri::command]
pub async fn navigate_home(app: AppHandle, provider_id: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let wvs = state.webviews.lock().map_err(|e| e.to_string())?;
    if let Some(wv) = wvs.get(&provider_id) {
        if let Some(provider) = providers::get_provider(&provider_id) {
            let url: url::Url = provider.url.parse().unwrap();
            let _ = wv.eval(&format!("window.location.href = '{}';", url));
        }
    }
    Ok(())
}
