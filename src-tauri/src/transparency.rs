// Force a Tauri webview window to truly transparent on Windows.
//
// Tauri 2 + WebView2 has a long-standing upstream bug where
// `transparent: true` lands the window in WS_EX_LAYERED mode but
// WebView2 still paints an opaque (often dark-themed) surface that
// `setBackgroundColor(null)` and CSS `background: transparent` can't
// clear. Even the resize-nudge workaround other Tauri users reported
// success with doesn't move the needle here.
//
// The reliable path is to bypass Tauri and talk to DWM directly.
// `SetWindowCompositionAttribute` with `ACCENT_ENABLE_TRANSPARENTGRADIENT`
// and a zero gradient colour tells the compositor to render the
// window as a true alpha layer with no fill — anything the webview
// paints as alpha=0 actually composites to "nothing", so the
// desktop / Ragnarok client behind shows through.
//
// `SetWindowCompositionAttribute` is undocumented Microsoft API but
// has been stable since Windows 8, is what every transparent-window
// crate on crates.io ends up calling (window-vibrancy, etc.), and is
// what File Explorer / Edge use themselves.
//
// FFI uses `*mut c_void` for HWND instead of `windows::Foundation::HWND`
// so we don't tie ourselves to whichever `windows` crate version
// Tauri itself happens to be compiled against (they re-export an HWND
// type but it's a separate symbol from the one in our `windows` dep).

use tauri::{AppHandle, Manager};

#[cfg(windows)]
#[repr(C)]
struct AccentPolicy {
    accent_state: u32,
    accent_flags: u32,
    gradient_color: u32,
    animation_id: u32,
}

#[cfg(windows)]
#[repr(C)]
struct WindowCompositionAttribData {
    attrib: u32,
    data: *mut core::ffi::c_void,
    size_of_data: usize,
}

#[cfg(windows)]
#[link(name = "user32")]
extern "system" {
    fn SetWindowCompositionAttribute(
        hwnd: *mut core::ffi::c_void,
        data: *mut WindowCompositionAttribData,
    ) -> i32;
}

#[cfg(windows)]
const WCA_ACCENT_POLICY: u32 = 19;
#[cfg(windows)]
const ACCENT_ENABLE_TRANSPARENTGRADIENT: u32 = 2;

#[tauri::command]
pub fn enable_overlay_transparency(label: String, app: AppHandle) -> Result<(), String> {
    apply(&app, &label)
}

#[cfg(windows)]
fn apply(app: &AppHandle, label: &str) -> Result<(), String> {
    let win = app
        .get_webview_window(label)
        .ok_or_else(|| format!("window not found: {label}"))?;
    let hwnd = win.hwnd().map_err(|e| e.to_string())?;
    // HWND is `pub struct HWND(pub *mut c_void)` in every `windows`
    // crate version, so the raw pointer is the stable contract.
    let raw_hwnd: *mut core::ffi::c_void = hwnd.0 as *mut _;

    let mut policy = AccentPolicy {
        accent_state: ACCENT_ENABLE_TRANSPARENTGRADIENT,
        accent_flags: 0,
        gradient_color: 0x00000000, // ABGR — all zeros = fully transparent
        animation_id: 0,
    };
    let mut data = WindowCompositionAttribData {
        attrib: WCA_ACCENT_POLICY,
        data: &mut policy as *mut _ as *mut _,
        size_of_data: core::mem::size_of::<AccentPolicy>(),
    };

    let rc = unsafe { SetWindowCompositionAttribute(raw_hwnd, &mut data) };
    if rc != 0 {
        Ok(())
    } else {
        Err("SetWindowCompositionAttribute returned FALSE".into())
    }
}

#[cfg(not(windows))]
fn apply(_app: &AppHandle, _label: &str) -> Result<(), String> {
    Ok(())
}
