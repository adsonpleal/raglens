// User-imported sound file management. Files live under
// `<app_data_dir>/sounds/` (alongside `raglens.json`), so they
// survive process restarts and updates without the user worrying
// about where the source file came from.
//
// The flow:
//   1. JS reads the picked file's bytes (HTML <input type="file">
//      returns a Blob — no extra Tauri plugin needed for the picker).
//   2. JS calls `import_sound { name, bytes }`. We sanitise the
//      filename, write into the sounds dir, and return the cleaned-up
//      name so the dropdown can reference it later.
//   3. At playback time, JS calls `read_sound { name }` to pull the
//      bytes back, wraps them in a Blob URL, and plays via Audio.
//   4. `list_sounds` enumerates the dir so the settings dropdown
//      shows everything the user has imported.
//
// We deliberately don't add `tauri-plugin-dialog` or `tauri-plugin-fs`
// for this — the existing capabilities + custom commands are enough.

use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn import_sound(
    app: AppHandle,
    name: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    let dir = sounds_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|e| format!("mkdir: {e}"))?;
    let safe = sanitize_filename(&name)?;
    let path = dir.join(&safe);
    fs::write(&path, &bytes).map_err(|e| format!("write: {e}"))?;
    Ok(safe)
}

#[tauri::command]
pub fn list_sounds(app: AppHandle) -> Result<Vec<String>, String> {
    let dir = sounds_dir(&app)?;
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut names = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| format!("read_dir: {e}"))? {
        let entry = entry.map_err(|e| format!("dir entry: {e}"))?;
        let file_type = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        if !file_type.is_file() {
            continue;
        }
        if let Some(n) = entry.file_name().to_str() {
            names.push(n.to_string());
        }
    }
    names.sort();
    Ok(names)
}

#[tauri::command]
pub fn read_sound(app: AppHandle, name: String) -> Result<Vec<u8>, String> {
    let dir = sounds_dir(&app)?;
    let safe = sanitize_filename(&name)?;
    let path = dir.join(&safe);
    fs::read(&path).map_err(|e| format!("read: {e}"))
}

fn sounds_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    Ok(base.join("sounds"))
}

/// Strip path separators and any character that's not a basic
/// filename rune. We don't trust the JS-supplied name beyond using
/// it as a key — the on-disk filename has to land inside our sounds
/// dir, not arbitrary places.
fn sanitize_filename(input: &str) -> Result<String, String> {
    let cleaned: String = input
        .chars()
        .filter(|c| {
            c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | ' ')
        })
        .collect();
    let cleaned = cleaned.trim();
    if cleaned.is_empty() {
        return Err("filename empty after sanitisation".into());
    }
    // Block traversal explicitly even after stripping.
    if cleaned.contains("..") {
        return Err("filename contains '..'".into());
    }
    Ok(cleaned.to_string())
}

#[cfg(test)]
mod tests {
    use super::sanitize_filename;

    #[test]
    fn keeps_simple_audio_names() {
        assert_eq!(
            sanitize_filename("chime.mp3").unwrap(),
            "chime.mp3"
        );
        assert_eq!(
            sanitize_filename("Soft Bell 1.ogg").unwrap(),
            "Soft Bell 1.ogg"
        );
    }

    #[test]
    fn strips_path_separators() {
        assert_eq!(
            sanitize_filename("..\\..\\evil.exe").unwrap_err(),
            "filename contains '..'"
        );
        // Forward slash is silently dropped — never reaches the
        // traversal check because the dot-dot rune sequence is the
        // attack surface, not the slash itself.
        assert_eq!(sanitize_filename("a/b/c.mp3").unwrap(), "abc.mp3");
    }

    #[test]
    fn rejects_after_sanitisation_empty() {
        assert!(sanitize_filename("///").is_err());
        assert!(sanitize_filename("").is_err());
    }
}
