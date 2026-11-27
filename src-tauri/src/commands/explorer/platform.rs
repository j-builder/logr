use std::path::PathBuf;
use walkdir::DirEntry;

#[cfg(windows)]
pub(super) fn explorer_roots() -> Result<Vec<PathBuf>, String> {
    use windows_sys::Win32::Storage::FileSystem::{GetDriveTypeW, GetLogicalDrives};
    use windows_sys::Win32::System::WindowsProgramming::{DRIVE_FIXED, DRIVE_REMOVABLE};

    // Each set bit represents one assigned drive letter, starting with A.
    let mask = unsafe { GetLogicalDrives() };
    if mask == 0 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    let mut roots = Vec::new();
    for letter in b'A'..=b'Z' {
        if mask & (1 << (letter - b'A')) == 0 {
            continue;
        }
        let path = format!("{}:\\", char::from(letter));
        let wide: Vec<u16> = path.encode_utf16().chain(Some(0)).collect();
        // The pointer refers to a NUL-terminated root path for the duration of the call.
        if matches!(unsafe { GetDriveTypeW(wide.as_ptr()) }, DRIVE_FIXED | DRIVE_REMOVABLE) {
            roots.push(PathBuf::from(path));
        }
    }
    Ok(roots)
}

#[cfg(not(windows))]
pub(super) fn explorer_roots() -> Result<Vec<PathBuf>, String> {
    #[cfg(target_os = "macos")]
    return Ok(vec![PathBuf::from("/"), PathBuf::from("/Volumes")]);
    #[cfg(not(target_os = "macos"))]
    return Ok(vec![PathBuf::from("/")]);
}

pub(super) fn is_visible(entry: &DirEntry) -> bool {
    if entry.file_name().as_encoded_bytes().starts_with(b".") {
        return false;
    }
    #[cfg(target_os = "macos")]
    {
        use std::os::darwin::fs::MetadataExt;
        if !entry.metadata().is_ok_and(|m| m.st_flags() & libc::UF_HIDDEN == 0) {
            return false;
        }
        // The legacy FinderInfo flags are a big-endian u16 at byte offset 8.
        !xattr::get(entry.path(), "com.apple.FinderInfo")
            .ok().flatten()
            .is_some_and(|info| info.get(8).is_some_and(|byte| byte & 0x40 != 0))
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        use windows_sys::Win32::Storage::FileSystem::FILE_ATTRIBUTE_HIDDEN;
        entry.metadata().is_ok_and(|m| m.file_attributes() & FILE_ATTRIBUTE_HIDDEN == 0)
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    { true }
}
