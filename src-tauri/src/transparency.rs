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

// `SetWindowCompositionAttribute` is not exported in user32.lib at
// link time — it's only resolvable at runtime via GetProcAddress. So
// we load it dynamically from user32.dll on first use.
#[cfg(windows)]
type SetWindowCompositionAttributeFn = unsafe extern "system" fn(
    hwnd: *mut core::ffi::c_void,
    data: *mut WindowCompositionAttribData,
) -> i32;

#[cfg(windows)]
fn resolve_swca() -> Option<SetWindowCompositionAttributeFn> {
    use windows::core::{s, PCSTR, PCWSTR};
    use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};

    // user32.dll is always already loaded in any GUI process — LoadLibraryW
    // just bumps the refcount and returns the existing handle.
    let user32: PCWSTR = windows::core::w!("user32.dll");
    let handle = unsafe { LoadLibraryW(user32).ok()? };
    let name: PCSTR = s!("SetWindowCompositionAttribute");
    let addr = unsafe { GetProcAddress(handle, name)? };
    Some(unsafe { core::mem::transmute::<_, SetWindowCompositionAttributeFn>(addr) })
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

    // Step 1: documented DWM call. Margins (-1,-1,-1,-1) tells DWM to
    // treat the entire client area as part of the composed window —
    // this is what gets per-pixel alpha to actually paint through.
    // Without this, the accent policy alone tends to be ignored on
    // borderless windows.
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Dwm::DwmExtendFrameIntoClientArea;
    use windows::Win32::UI::Controls::MARGINS;
    let dwm_hwnd = HWND(raw_hwnd);
    let margins = MARGINS {
        cxLeftWidth: -1,
        cxRightWidth: -1,
        cyTopHeight: -1,
        cyBottomHeight: -1,
    };
    let dwm_rc = unsafe { DwmExtendFrameIntoClientArea(dwm_hwnd, &margins) };
    if dwm_rc.is_err() {
        return Err(format!("DwmExtendFrameIntoClientArea failed: {dwm_rc:?}"));
    }

    // Step 2: SetWindowCompositionAttribute as the belt to DWM's
    // braces. ACCENT_ENABLE_TRANSPARENTGRADIENT with a zero gradient
    // colour tells the DWM accent renderer to paint nothing — combined
    // with step 1 the webview's alpha=0 pixels actually composite to
    // "nothing" instead of black.
    let swca = resolve_swca()
        .ok_or_else(|| "SetWindowCompositionAttribute not found in user32".to_string())?;
    let rc = unsafe { swca(raw_hwnd, &mut data) };
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
