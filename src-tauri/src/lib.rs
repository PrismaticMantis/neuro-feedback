use std::{
    net::{SocketAddr, TcpStream},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

const RELAY_HOST: &str = "127.0.0.1";
const RELAY_PORT: u16 = 8765;
const READINESS_TIMEOUT_MS: u64 = 10_000;
const READINESS_POLL_MS: u64 = 250;

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum BrainBitRelayPhase {
    Starting,
    Ready,
    Failed,
    Skipped,
    Stopped,
}

#[derive(Clone, Debug, Serialize)]
struct BrainBitRelayStatusPayload {
    phase: BrainBitRelayPhase,
    message: Option<String>,
}

struct BrainBitRelayState {
    child: Mutex<Option<Child>>,
    status: Mutex<BrainBitRelayStatusPayload>,
}

impl BrainBitRelayState {
    fn new(initial: BrainBitRelayStatusPayload) -> Self {
        Self {
            child: Mutex::new(None),
            status: Mutex::new(initial),
        }
    }
}

impl Drop for BrainBitRelayState {
    fn drop(&mut self) {
        if let Ok(mut child_guard) = self.child.lock() {
            if let Some(mut child) = child_guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri has a repo parent")
        .to_path_buf()
}

fn default_brainbit_relay_bin() -> PathBuf {
    repo_root()
        .join("native")
        .join("brainbit-capsule-relay")
        .join(".build")
        .join("x86_64-apple-macosx")
        .join("debug")
        .join("brainbit-capsule-relay")
}

fn can_connect_to_relay_port() -> bool {
    let addr: SocketAddr = format!("{RELAY_HOST}:{RELAY_PORT}")
        .parse()
        .expect("valid relay addr");
    TcpStream::connect_timeout(&addr, Duration::from_millis(250)).is_ok()
}

fn set_status(state: &BrainBitRelayState, phase: BrainBitRelayPhase, message: Option<String>) {
    if let Ok(mut guard) = state.status.lock() {
        *guard = BrainBitRelayStatusPayload { phase, message };
    }
}

fn emit_status(app: &AppHandle, state: &BrainBitRelayState) {
    if let Ok(guard) = state.status.lock() {
        let _ = app.emit("brainbit-relay-status", guard.clone());
    }
}

fn child_has_exited(state: &BrainBitRelayState) -> bool {
    let Ok(mut guard) = state.child.lock() else {
        return false;
    };
    let Some(child) = guard.as_mut() else {
        return true;
    };
    matches!(child.try_wait(), Ok(Some(_)))
}

fn relay_watchdog(app: AppHandle) {
    let deadline = Instant::now() + Duration::from_millis(READINESS_TIMEOUT_MS);
    let mut reached_ready = false;
    let mut reported_timeout = false;

    loop {
        let state = app.state::<BrainBitRelayState>();

        if child_has_exited(&state) {
            let phase = if reached_ready {
                BrainBitRelayPhase::Stopped
            } else {
                BrainBitRelayPhase::Failed
            };
            let message = if reached_ready {
                Some("BrainBit service stopped.".to_string())
            } else {
                Some("BrainBit service exited before becoming ready.".to_string())
            };
            set_status(&state, phase, message);
            emit_status(&app, &state);
            break;
        }

        if !reached_ready && !reported_timeout {
            if can_connect_to_relay_port() {
                reached_ready = true;
                set_status(&state, BrainBitRelayPhase::Ready, None);
                emit_status(&app, &state);
            } else if Instant::now() >= deadline {
                reported_timeout = true;
                set_status(
                    &state,
                    BrainBitRelayPhase::Failed,
                    Some(format!(
                        "Timed out waiting for BrainBit service on {RELAY_HOST}:{RELAY_PORT}."
                    )),
                );
                emit_status(&app, &state);
            }
        }

        thread::sleep(Duration::from_millis(READINESS_POLL_MS));
    }
}

fn spawn_brainbit_relay() -> Result<Child, String> {
    let sdk_root = match std::env::var("BRAINBIT_CAPSULE_SDK_ROOT") {
        Ok(value) if !value.trim().is_empty() => value,
        _ => {
            return Err("BRAINBIT_CAPSULE_SDK_ROOT is not set.".to_string());
        }
    };

    let relay_bin = std::env::var("BRAINBIT_RELAY_BIN")
        .map(PathBuf::from)
        .unwrap_or_else(|_| default_brainbit_relay_bin());

    if !relay_bin.exists() {
        return Err(format!(
            "Relay binary not found at {}. Build it with: npm run brainbit-relay:smoke",
            relay_bin.display()
        ));
    }

    let existing_dyld = std::env::var("DYLD_LIBRARY_PATH").unwrap_or_default();
    let dyld_library_path = if existing_dyld.is_empty() {
        sdk_root.clone()
    } else {
        format!("{sdk_root}:{existing_dyld}")
    };

    println!(
        "[BrainBit sidecar] Starting relay: {}",
        relay_bin.display()
    );

    Command::new(&relay_bin)
        .current_dir(
            repo_root()
                .join("native")
                .join("brainbit-capsule-relay"),
        )
        .env("BRAINBIT_CAPSULE_SDK_ROOT", sdk_root)
        .env("DYLD_LIBRARY_PATH", dyld_library_path)
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
        .map_err(|err| format!("Failed to start relay: {err}"))
}

fn init_brainbit_relay(app: &AppHandle) {
    let state = app.state::<BrainBitRelayState>();

    set_status(&state, BrainBitRelayPhase::Starting, None);
    emit_status(app, &state);

    match spawn_brainbit_relay() {
        Ok(child) => {
            if let Ok(mut guard) = state.child.lock() {
                *guard = Some(child);
            }
            let app_handle = app.clone();
            thread::spawn(move || relay_watchdog(app_handle));
        }
        Err(message) => {
            println!("[BrainBit sidecar] {message}");
            set_status(&state, BrainBitRelayPhase::Failed, Some(message));
            emit_status(app, &state);
        }
    }
}

#[tauri::command]
fn get_brainbit_relay_status(state: State<'_, BrainBitRelayState>) -> BrainBitRelayStatusPayload {
    state
        .status
        .lock()
        .map(|guard| guard.clone())
        .unwrap_or(BrainBitRelayStatusPayload {
            phase: BrainBitRelayPhase::Skipped,
            message: Some("BrainBit relay state unavailable.".to_string()),
        })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_brainbit_relay_status])
        .setup(|app| {
            let sdk_configured = std::env::var("BRAINBIT_CAPSULE_SDK_ROOT")
                .map(|value| !value.trim().is_empty())
                .unwrap_or(false);

            let initial = if sdk_configured {
                BrainBitRelayStatusPayload {
                    phase: BrainBitRelayPhase::Starting,
                    message: None,
                }
            } else {
                println!(
                    "[BrainBit sidecar] BRAINBIT_CAPSULE_SDK_ROOT is not set; skipping relay startup."
                );
                BrainBitRelayStatusPayload {
                    phase: BrainBitRelayPhase::Skipped,
                    message: Some("BRAINBIT_CAPSULE_SDK_ROOT is not set.".to_string()),
                }
            };

            app.manage(BrainBitRelayState::new(initial));

            if sdk_configured {
                init_brainbit_relay(app.handle());
            } else {
                let state = app.state::<BrainBitRelayState>();
                emit_status(app.handle(), &state);
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                let app_handle = window.app_handle();
                let state = app_handle.state::<BrainBitRelayState>();

                set_status(
                    &state,
                    BrainBitRelayPhase::Stopped,
                    Some("BrainBit service stopped.".to_string()),
                );
                emit_status(&app_handle, &state);

                let child = {
                    let child = match state.child.lock() {
                        Ok(mut child_guard) => child_guard.take(),
                        Err(_) => None,
                    };
                    child
                };

                if let Some(mut child) = child {
                    println!("[BrainBit sidecar] Stopping relay.");
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Tauri app");
}
