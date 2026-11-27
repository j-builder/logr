use serde::Serialize;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

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
    parent: Option<PathBuf>,
    entries: Vec<ExplorerEntry>,
    partial: bool,
}

fn list_directory(root: &Path, query: &str) -> Result<DirectoryListing, String> {
    std::fs::read_dir(root).map_err(|err| format!("{} — {err}", root.display()))?;
    let needle = query.trim().to_lowercase();
    let searching = !needle.is_empty();
    let mut listing = DirectoryListing {
        parent: root.parent().map(Path::to_owned),
        entries: Vec::new(),
        partial: false,
    };

    let mut walk = WalkDir::new(root).min_depth(1);
    if !searching {
        walk = walk.max_depth(1);
    }
    for (index, entry) in walk.into_iter().enumerate() {
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
        if !kind.is_file() && (!kind.is_dir() || searching) {
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
pub async fn browse_directory(path: PathBuf, query: String) -> Result<DirectoryListing, String> {
    tokio::task::spawn_blocking(move || list_directory(&path, &query))
        .await
        .map_err(|err| err.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn browses_one_level_and_finds_nested_files_by_name() {
        let root = tempfile::tempdir().unwrap();
        let nested = root.path().join("archive");
        std::fs::create_dir(&nested).unwrap();
        std::fs::write(root.path().join("latest.log"), "").unwrap();
        std::fs::write(nested.join("Latest.LOG"), "").unwrap();
        let listing = list_directory(root.path(), "").unwrap();
        assert_eq!(listing.parent.as_deref(), root.path().parent());
        assert_eq!(listing.entries.len(), 2);
        assert!(listing.entries[0].is_directory);
        let matches = list_directory(root.path(), "LaTeSt").unwrap();
        assert_eq!(matches.entries.len(), 2);
        assert_eq!(matches.entries[0].path, nested.join("Latest.LOG").to_str().unwrap());
        assert!(!matches.partial);
        assert!(list_directory(&nested.join("missing"), "").is_err());
    }
}
