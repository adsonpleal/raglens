// On-demand fetch + on-disk cache for per-map minimap PNGs from
// divine-pride.net. The last-teleport addon renders these as the
// background of its map overlay so the player sees the actual map
// with their teleport history drawn on top (instead of trying to
// align an invisible overlay with the in-game minimap UI).
//
// URL: https://www.divine-pride.net/img/map/raw/{mapname}  (no
// extension, returns image/png). The `/raw` endpoint is the bare
// cell grid — image pixels are 1:1 with map cells, no decorative
// parchment frame. This makes marker placement trivial: cell coord
// (x, y) maps directly to image pixel (x, height-y) with no inset
// or letterbox math. The decorated `/original` variant was tried
// briefly but the frame's extra pixels caused marker drift on
// padded maps (prontera 412×512 image vs 312×392 cells) — not
// worth the visual cost.
//
// Variant lives in its own subdir (`map-images/raw/`) so switching
// variants in the future doesn't conflict with previously cached
// files of the same name.
//
// Missing maps either:
//   - 302 to `static.divine-pride.net/images/no_img.png` (57×57), or
//   - return the same canonical no_img bytes inline.
// In both cases we return Ok(None) so the frontend can render with
// no background image and just the markers on the transparent area.
//
// On-disk layout: <app_data_dir>/map-images/<safe>.png. Same
// directory convention as `sounds.rs`. The on-disk file IS the
// cache — no in-memory state, no expiry. Minimap images don't
// change.

use std::fs;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{AppHandle, Manager};

const USER_AGENT: &str = concat!(
    "Raglens/",
    env!("CARGO_PKG_VERSION"),
    " (+https://github.com/adsonleal/raglens)"
);

#[tauri::command]
pub async fn get_map_image_path(
    app: AppHandle,
    map_name: String,
) -> Result<Option<String>, String> {
    let safe = sanitize_map_name(&map_name)?;
    let dir = map_images_dir(&app)?;
    let target = dir.join(format!("{safe}.png"));

    // Cache hit. We treat any non-empty file as authoritative —
    // partials use a `.partial` sidecar (see the fetch path) so a
    // crash mid-download won't leave a half-written .png behind.
    if let Ok(meta) = fs::metadata(&target) {
        if meta.is_file() && meta.len() > 0 {
            return Ok(Some(target.to_string_lossy().into_owned()));
        }
    }

    // Cache miss → fetch on a blocking thread so we don't tie up the
    // Tauri IPC thread. `tauri::async_runtime` ships with the framework;
    // no `tokio` dep needed.
    let dir_clone = dir.clone();
    let target_clone = target.clone();
    let safe_clone = safe.clone();
    let fetched = tauri::async_runtime::spawn_blocking(move || {
        fetch_and_write(&dir_clone, &target_clone, &safe_clone)
    })
    .await
    .map_err(|e| format!("join: {e}"))??;

    if fetched {
        Ok(Some(target.to_string_lossy().into_owned()))
    } else {
        Ok(None)
    }
}

fn fetch_and_write(
    dir: &std::path::Path,
    target: &std::path::Path,
    safe: &str,
) -> Result<bool, String> {
    fs::create_dir_all(dir).map_err(|e| format!("mkdir: {e}"))?;

    let url = format!("https://www.divine-pride.net/img/map/raw/{safe}");
    let client = reqwest::blocking::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|e| format!("client build: {e}"))?;

    let resp = client.get(&url).send().map_err(|e| format!("get: {e}"))?;
    if !resp.status().is_success() {
        return Ok(false);
    }
    // The 302-to-no_img path is followed by the redirect policy and
    // lands us on static.divine-pride.net. Detect that and treat it
    // as "no image available" so we don't cache the placeholder.
    if resp.url().as_str().contains("no_img") {
        return Ok(false);
    }
    let bytes = resp.bytes().map_err(|e| format!("body: {e}"))?;

    // Atomic write: a crashed render won't leave a half-baked .png
    // that the cache-hit branch above would treat as authoritative.
    let partial = dir.join(format!("{safe}.png.partial"));
    fs::write(&partial, &bytes).map_err(|e| format!("write: {e}"))?;
    fs::rename(&partial, target).map_err(|e| format!("rename: {e}"))?;
    Ok(true)
}

fn map_images_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    Ok(base.join("map-images").join("raw"))
}

/// Ragnarok map names are ASCII identifiers; instance maps add `@`
/// and a digit prefix (e.g. `1@4cdn`). We accept those plus the
/// usual filename-safe punctuation, and reject anything that could
/// escape the map-images directory.
fn sanitize_map_name(input: &str) -> Result<String, String> {
    let cleaned: String = input
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | '@'))
        .collect();
    if cleaned.is_empty() {
        return Err("map name empty after sanitisation".into());
    }
    if cleaned.contains("..") {
        return Err("map name contains '..'".into());
    }
    Ok(cleaned)
}

#[cfg(test)]
mod tests {
    use super::sanitize_map_name;

    #[test]
    fn keeps_standard_map_names() {
        assert_eq!(sanitize_map_name("prontera").unwrap(), "prontera");
        assert_eq!(sanitize_map_name("prt_sewb2").unwrap(), "prt_sewb2");
        assert_eq!(sanitize_map_name("alde_dun01").unwrap(), "alde_dun01");
    }

    #[test]
    fn keeps_instance_map_names() {
        // `1@4cdn`, `1@adv`, etc. — `@` and leading digit both required.
        assert_eq!(sanitize_map_name("1@4cdn").unwrap(), "1@4cdn");
        assert_eq!(sanitize_map_name("1@adv").unwrap(), "1@adv");
    }

    #[test]
    fn rejects_traversal() {
        assert!(sanitize_map_name("../etc/passwd").is_err());
        // Slashes get filtered out, but `..` survives — block it.
        assert!(sanitize_map_name("a..b").is_err());
    }

    #[test]
    fn rejects_empty() {
        assert!(sanitize_map_name("").is_err());
        assert!(sanitize_map_name("///").is_err());
    }
}
