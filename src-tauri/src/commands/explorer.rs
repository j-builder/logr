use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::Manager;
use walkdir::WalkDir;

mod platform;
use platform::{explorer_roots, is_visible};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplorerEntry {
    name: String,
    path: String,
    relative_path: String,
    is_directory: bool,
}

#[derive(Serialize)]
pub struct DirectoryListing {
    directory: PathBuf,
    parent: Option<PathBuf>,
    entries: Vec<ExplorerEntry>,
    partial: bool,
}

#[derive(Serialize)]
pub struct ExplorerLocations {
    home: PathBuf,
    roots: Vec<PathBuf>,
}

#[tauri::command]
pub async fn explorer_locations(app: tauri::AppHandle) -> Result<ExplorerLocations, String> {
    let home = app.path().home_dir().map_err(|err| err.to_string())?;
    tokio::task::spawn_blocking(move || Ok(ExplorerLocations { home, roots: explorer_roots()? }))
        .await
        .map_err(|err| err.to_string())?
}

fn list_directory(root: &Path, query: &str) -> Result<DirectoryListing, String> {
    std::fs::read_dir(root).map_err(|err| format!("{} — {err}", root.display()))?;
    let needle = query.trim().to_lowercase();
    let searching = !needle.is_empty();
    let mut listing = DirectoryListing {
        directory: root.to_owned(),
        parent: root.parent().map(Path::to_owned),
        entries: Vec::new(),
        partial: false,
    };

    let mut walk = WalkDir::new(root).min_depth(1);
    if !searching {
        walk = walk.max_depth(1);
    }
    for (index, entry) in walk.into_iter().filter_entry(is_visible).enumerate() {
        if searching && index >= 100_000 {
            listing.partial = true;
            break;
        }
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => {
                listing.partial = true;
                continue;
            }
        };
        let name = entry.file_name().to_string_lossy();
        if searching && !name.to_lowercase().contains(&needle) {
            continue;
        }
        // Directory links may be opened manually, but are never traversed by a search.
        let kind = if entry.file_type().is_symlink() {
            match std::fs::metadata(entry.path()) {
                Ok(metadata) => metadata.file_type(),
                Err(_) => continue,
            }
        } else {
            entry.file_type()
        };
        if !kind.is_file() && !kind.is_dir() {
            continue;
        }
        let Some(path) = entry.path().to_str() else {
            listing.partial = true;
            continue;
        };
        if searching && listing.entries.len() == 500 {
            listing.partial = true;
            break;
        }
        listing.entries.push(ExplorerEntry {
            name: name.into_owned(),
            path: path.to_owned(),
            relative_path: entry.path().strip_prefix(root).unwrap_or(entry.path()).display().to_string(),
            is_directory: kind.is_dir(),
        });
    }
    listing.entries.sort_by_cached_key(|entry| (!entry.is_directory, entry.relative_path.to_lowercase()));
    Ok(listing)
}

#[tauri::command]
pub async fn browse_directory(
    app: tauri::AppHandle,
    path: Option<PathBuf>,
    query: String,
) -> Result<DirectoryListing, String> {
    let path = match path {
        Some(path) => path,
        None => app.path().home_dir().map_err(|err| err.to_string())?,
    };
    tokio::task::spawn_blocking(move || list_directory(&path, &query))
        .await
        .map_err(|err| err.to_string())?
}

#[tauri::command]
pub async fn explorer_is_directory(path: PathBuf) -> Result<bool, String> {
    let kind = tokio::fs::metadata(&path)
        .await
        .map_err(|err| format!("{} — {err}", path.display()))?;
    if kind.is_dir() || kind.is_file() {
        Ok(kind.is_dir())
    } else {
        Err(format!("{} — unsupported file type", path.display()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(target_os = "macos")]
    fn mac_roots_include_volumes() {
        assert_eq!(explorer_roots().unwrap(), [Path::new("/"), Path::new("/Volumes")]);
    }

    #[test]
    #[cfg(windows)]
    fn windows_roots_include_the_system_drive() {
        let system = PathBuf::from(std::env::var_os("SystemRoot").unwrap());
        let drive = system.ancestors().last().unwrap();
        assert!(explorer_roots().unwrap().contains(&drive.to_owned()));
    }

    #[test]
    fn hidden_items_and_their_descendants_are_absent() {
        let root = tempfile::tempdir().unwrap();
        let directory = root.path();
        std::fs::create_dir(directory.join(".hidden")).unwrap();
        std::fs::write(directory.join(".hidden/result.log"), "").unwrap();
        std::fs::write(directory.join(".result.log"), "").unwrap();
        std::fs::write(directory.join("result.log"), "").unwrap();

        #[cfg(any(target_os = "macos", windows))]
        {
            let flagged = directory.join("hidden-folder");
            let file = directory.join("hidden-result.log");
            std::fs::create_dir(&flagged).unwrap();
            std::fs::write(flagged.join("nested-result.log"), "").unwrap();
            std::fs::write(&file, "").unwrap();
            for path in [&flagged, &file] {
                #[cfg(target_os = "macos")]
                let command = ("chflags", "hidden");
                #[cfg(windows)]
                let command = ("attrib", "+H");
                assert!(std::process::Command::new(command.0).arg(command.1).arg(path).status().unwrap().success());
            }
        }
        #[cfg(target_os = "macos")]
        {
            let path = directory.join("finder-result.log");
            std::fs::write(&path, "").unwrap();
            let mut info = [0; 32];
            info[8] = 0x40;
            xattr::set(path, "com.apple.FinderInfo", &info).unwrap();
        }
        for query in ["", "result"] {
            let listing = list_directory(directory, query).unwrap();
            assert_eq!(listing.entries.len(), 1);
            assert_eq!(listing.entries[0].name, "result.log");
            assert!(!listing.partial);
        }
    }

    #[tokio::test]
    async fn browses_one_level_and_finds_nested_files_by_name() {
        let root = tempfile::tempdir().unwrap();
        let nested = root.path().join("archive");
        std::fs::create_dir(&nested).unwrap();
        std::fs::write(root.path().join("latest.log"), "").unwrap();
        std::fs::write(nested.join("Latest.LOG"), "nested log line\n").unwrap();
        let listing = list_directory(root.path(), "").unwrap();
        assert_eq!(listing.parent.as_deref(), root.path().parent());
        assert_eq!(listing.entries.len(), 2);
        assert!(listing.entries[0].is_directory);
        let folders = list_directory(root.path(), "ARCH").unwrap();
        assert_eq!(folders.entries.len(), 1);
        assert!(folders.entries[0].is_directory);
        let children = list_directory(Path::new(&folders.entries[0].path), "").unwrap();
        assert_eq!(children.directory, nested);
        assert_eq!(children.entries.len(), 1);
        assert_eq!(children.entries[0].name, "Latest.LOG");
        assert!(!children.entries[0].is_directory);
        let file = &children.entries[0].path;
        assert!(!explorer_is_directory(PathBuf::from(file)).await.unwrap());
        assert!(explorer_is_directory(nested.clone()).await.unwrap());
        let lines = super::super::file::read_tail(file.clone(), 10, "UTF-8".into()).await.unwrap();
        assert_eq!(lines[0].content, "nested log line");
        let matches = list_directory(root.path(), "LaTeSt").unwrap();
        assert_eq!(matches.entries.len(), 2);
        assert_eq!(matches.entries[0].path, nested.join("Latest.LOG").to_str().unwrap());
        assert!(!matches.partial);
        assert!(list_directory(&nested.join("missing"), "").is_err());
    }
}
