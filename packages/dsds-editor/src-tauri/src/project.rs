//! Filesystem-backed project operations for the DSDS editor.
//!
//! A "project" is simply a directory on disk. DSDS documents are `*.dsds.json`
//! files anywhere within it — including nested subdirectories. Documents are
//! addressed by their **project-relative path** (POSIX `/` separators), e.g.
//! `components/button.dsds.json`, which is also the stable key the UI uses to
//! select, read, rename, and delete them. There is no database and no history:
//! the filesystem is the single source of truth. Every function here is a pure,
//! side-effecting operation over a base directory so it can be unit-tested with
//! a temporary directory, independent of Tauri.

use serde::Serialize;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

/// The suffix that marks a file as a DSDS document.
pub const DSDS_SUFFIX: &str = ".dsds.json";

/// A single DSDS document file, as surfaced to the UI.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DocEntry {
    /// Base file name including the suffix, e.g. `button.dsds.json`.
    pub name: String,
    /// Project-relative path with `/` separators, e.g.
    /// `components/button.dsds.json`. Unique within a project.
    pub rel_path: String,
    /// Absolute path to the file on disk.
    pub path: String,
    /// Last-modified time in milliseconds since the Unix epoch.
    pub modified: u64,
    /// File size in bytes.
    pub size: u64,
}

/// Errors that can arise from project operations. Kept as a flat enum so the
/// Tauri command layer can map them to plain strings for the frontend.
#[derive(Debug)]
pub enum ProjectError {
    NotADirectory(String),
    InvalidName(String),
    AlreadyExists(String),
    NotFound(String),
    Io(io::Error),
}

impl std::fmt::Display for ProjectError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ProjectError::NotADirectory(p) => write!(f, "Not a directory: {p}"),
            ProjectError::InvalidName(n) => write!(f, "Invalid document path: {n}"),
            ProjectError::AlreadyExists(n) => write!(f, "A document named {n} already exists"),
            ProjectError::NotFound(n) => write!(f, "Document not found: {n}"),
            ProjectError::Io(e) => write!(f, "{e}"),
        }
    }
}

impl From<io::Error> for ProjectError {
    fn from(e: io::Error) -> Self {
        ProjectError::Io(e)
    }
}

pub type Result<T> = std::result::Result<T, ProjectError>;

/// Validate that `rel` is a safe, project-relative DSDS document path.
///
/// The path must end in `.dsds.json`, use `/` separators, be relative (not
/// absolute), and contain no `.`/`..`/empty segments, backslashes, or NUL
/// bytes. This guarantees a caller can never escape the project directory
/// through a crafted path.
pub fn is_valid_doc_path(rel: &str) -> bool {
    if !rel.ends_with(DSDS_SUFFIX) {
        return false;
    }
    if rel.contains('\\') || rel.contains('\0') || rel.starts_with('/') {
        return false;
    }
    let segments: Vec<&str> = rel.split('/').collect();
    for (i, seg) in segments.iter().enumerate() {
        if seg.is_empty() || *seg == "." || *seg == ".." {
            return false;
        }
        // The final segment must have a non-empty stem before the suffix.
        if i == segments.len() - 1 && seg.len() <= DSDS_SUFFIX.len() {
            return false;
        }
    }
    true
}

/// Resolve a validated relative document path against the project directory.
fn resolve(dir: &Path, rel: &str) -> Result<PathBuf> {
    if !is_valid_doc_path(rel) {
        return Err(ProjectError::InvalidName(rel.to_string()));
    }
    let mut path = dir.to_path_buf();
    for seg in rel.split('/') {
        path.push(seg);
    }
    Ok(path)
}

/// The base file name (last `/` segment) of a relative path.
fn base_name(rel: &str) -> String {
    rel.rsplit('/').next().unwrap_or(rel).to_string()
}

fn modified_millis(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Build a `DocEntry` for a file that is known to exist at `rel`.
fn entry_for(dir: &Path, rel: &str) -> Result<DocEntry> {
    let path = resolve(dir, rel)?;
    let meta = fs::metadata(&path)?;
    Ok(DocEntry {
        name: base_name(rel),
        rel_path: rel.to_string(),
        path: path.display().to_string(),
        modified: modified_millis(&meta),
        size: meta.len(),
    })
}

/// Recursively list every `*.dsds.json` document under `dir`, sorted by
/// relative path. Hidden directories (leading `.`) and symlinks are skipped;
/// non-DSDS files are ignored.
///
/// Returns an error if `dir` does not exist or is not a directory.
pub fn list_docs(dir: &Path) -> Result<Vec<DocEntry>> {
    if !dir.is_dir() {
        return Err(ProjectError::NotADirectory(dir.display().to_string()));
    }
    let mut docs = Vec::new();
    collect(dir, "", &mut docs)?;
    docs.sort_by(|a, b| a.rel_path.to_lowercase().cmp(&b.rel_path.to_lowercase()));
    Ok(docs)
}

/// Depth-first walk that accumulates DSDS documents. `prefix` is the relative
/// path of `current` from the project root (empty at the top level).
fn collect(current: &Path, prefix: &str, out: &mut Vec<DocEntry>) -> Result<()> {
    for entry in fs::read_dir(current)? {
        let entry = entry?;
        let file_type = match entry.file_type() {
            Ok(t) => t,
            Err(_) => continue,
        };
        // Never follow symlinks — avoids cycles and escapes.
        if file_type.is_symlink() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let rel = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{prefix}/{name}")
        };
        if file_type.is_dir() {
            if name.starts_with('.') {
                continue;
            }
            collect(&entry.path(), &rel, out)?;
        } else if file_type.is_file() && name.ends_with(DSDS_SUFFIX) {
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            out.push(DocEntry {
                name,
                rel_path: rel,
                path: entry.path().display().to_string(),
                modified: modified_millis(&meta),
                size: meta.len(),
            });
        }
    }
    Ok(())
}

/// Read the raw contents of a document as a UTF-8 string.
pub fn read_doc(dir: &Path, rel: &str) -> Result<String> {
    let path = resolve(dir, rel)?;
    if !path.is_file() {
        return Err(ProjectError::NotFound(rel.to_string()));
    }
    Ok(fs::read_to_string(path)?)
}

/// Ensure the parent directory of `path` exists, creating it if needed.
fn ensure_parent(path: &Path) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    Ok(())
}

/// Write `contents` to a document, creating it (and any missing parent
/// directories) or overwriting it. Returns the document's refreshed metadata.
pub fn write_doc(dir: &Path, rel: &str, contents: &str) -> Result<DocEntry> {
    if !dir.is_dir() {
        return Err(ProjectError::NotADirectory(dir.display().to_string()));
    }
    let path = resolve(dir, rel)?;
    ensure_parent(&path)?;
    fs::write(&path, contents)?;
    entry_for(dir, rel)
}

/// Create a new document. Fails if a file with the same relative path already
/// exists so the caller never silently clobbers an existing document.
pub fn create_doc(dir: &Path, rel: &str, contents: &str) -> Result<DocEntry> {
    let path = resolve(dir, rel)?;
    if path.exists() {
        return Err(ProjectError::AlreadyExists(rel.to_string()));
    }
    write_doc(dir, rel, contents)
}

/// Rename/move a document within the project. Fails if the source is missing
/// or the destination already exists. Missing destination folders are created.
pub fn rename_doc(dir: &Path, from: &str, to: &str) -> Result<DocEntry> {
    let from_path = resolve(dir, from)?;
    let to_path = resolve(dir, to)?;
    if !from_path.is_file() {
        return Err(ProjectError::NotFound(from.to_string()));
    }
    if to_path.exists() {
        return Err(ProjectError::AlreadyExists(to.to_string()));
    }
    ensure_parent(&to_path)?;
    fs::rename(&from_path, &to_path)?;
    entry_for(dir, to)
}

/// Delete a document from the project.
pub fn delete_doc(dir: &Path, rel: &str) -> Result<()> {
    let path = resolve(dir, rel)?;
    if !path.is_file() {
        return Err(ProjectError::NotFound(rel.to_string()));
    }
    fs::remove_file(path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::time::SystemTime;

    /// Create a unique temporary directory for a test and return its path.
    fn temp_dir() -> PathBuf {
        static COUNTER: AtomicU32 = AtomicU32::new(0);
        let n = COUNTER.fetch_add(1, Ordering::Relaxed);
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("dsds-test-{nanos}-{n}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn valid_doc_paths_are_accepted() {
        assert!(is_valid_doc_path("button.dsds.json"));
        assert!(is_valid_doc_path("color-text.dsds.json"));
        assert!(is_valid_doc_path("components/button.dsds.json"));
        assert!(is_valid_doc_path("a/b/c/deep.dsds.json"));
    }

    #[test]
    fn invalid_doc_paths_are_rejected() {
        assert!(!is_valid_doc_path("button.json"));
        assert!(!is_valid_doc_path(".dsds.json")); // empty stem
        assert!(!is_valid_doc_path("../escape.dsds.json"));
        assert!(!is_valid_doc_path("a/../b.dsds.json"));
        assert!(!is_valid_doc_path("a//b.dsds.json")); // empty segment
        assert!(!is_valid_doc_path("/abs/x.dsds.json")); // absolute
        assert!(!is_valid_doc_path("nested\\win.dsds.json"));
        assert!(!is_valid_doc_path("plain.txt"));
        assert!(!is_valid_doc_path(""));
    }

    #[test]
    fn list_docs_recurses_and_returns_relative_paths() {
        let dir = temp_dir();
        fs::write(dir.join("root.dsds.json"), "{}").unwrap();
        fs::create_dir_all(dir.join("components")).unwrap();
        fs::write(dir.join("components/button.dsds.json"), "{}").unwrap();
        fs::create_dir_all(dir.join("tokens/color")).unwrap();
        fs::write(dir.join("tokens/color/primary.dsds.json"), "{}").unwrap();
        fs::write(dir.join("components/notes.txt"), "ignore").unwrap();

        let docs = list_docs(&dir).unwrap();
        let rels: Vec<_> = docs.iter().map(|d| d.rel_path.as_str()).collect();
        assert_eq!(
            rels,
            vec![
                "components/button.dsds.json",
                "root.dsds.json",
                "tokens/color/primary.dsds.json",
            ]
        );
        // Base name is the last segment.
        let button = docs.iter().find(|d| d.rel_path.contains("button")).unwrap();
        assert_eq!(button.name, "button.dsds.json");
    }

    #[test]
    fn list_docs_skips_hidden_directories() {
        let dir = temp_dir();
        fs::create_dir_all(dir.join(".git")).unwrap();
        fs::write(dir.join(".git/config.dsds.json"), "{}").unwrap();
        fs::write(dir.join("keep.dsds.json"), "{}").unwrap();

        let docs = list_docs(&dir).unwrap();
        let rels: Vec<_> = docs.iter().map(|d| d.rel_path.as_str()).collect();
        assert_eq!(rels, vec!["keep.dsds.json"]);
    }

    #[test]
    fn list_docs_errors_on_missing_dir() {
        let dir = temp_dir().join("does-not-exist");
        assert!(matches!(
            list_docs(&dir),
            Err(ProjectError::NotADirectory(_))
        ));
    }

    #[test]
    fn create_read_write_round_trip_in_subfolder() {
        let dir = temp_dir();
        let entry = create_doc(&dir, "components/button.dsds.json", "{\"a\":1}").unwrap();
        assert_eq!(entry.name, "button.dsds.json");
        assert_eq!(entry.rel_path, "components/button.dsds.json");
        // Parent directory was created on demand.
        assert!(dir.join("components").is_dir());

        let content = read_doc(&dir, "components/button.dsds.json").unwrap();
        assert_eq!(content, "{\"a\":1}");

        write_doc(&dir, "components/button.dsds.json", "{\"a\":2}").unwrap();
        assert_eq!(
            read_doc(&dir, "components/button.dsds.json").unwrap(),
            "{\"a\":2}"
        );
    }

    #[test]
    fn create_doc_refuses_to_clobber() {
        let dir = temp_dir();
        create_doc(&dir, "button.dsds.json", "{}").unwrap();
        assert!(matches!(
            create_doc(&dir, "button.dsds.json", "{}"),
            Err(ProjectError::AlreadyExists(_))
        ));
    }

    #[test]
    fn read_missing_doc_errors() {
        let dir = temp_dir();
        assert!(matches!(
            read_doc(&dir, "ghost.dsds.json"),
            Err(ProjectError::NotFound(_))
        ));
    }

    #[test]
    fn rename_can_move_across_folders() {
        let dir = temp_dir();
        create_doc(&dir, "old.dsds.json", "{}").unwrap();
        rename_doc(&dir, "old.dsds.json", "components/new.dsds.json").unwrap();
        assert!(matches!(
            read_doc(&dir, "old.dsds.json"),
            Err(ProjectError::NotFound(_))
        ));
        assert_eq!(
            read_doc(&dir, "components/new.dsds.json").unwrap(),
            "{}"
        );
    }

    #[test]
    fn rename_refuses_existing_destination() {
        let dir = temp_dir();
        create_doc(&dir, "a.dsds.json", "{}").unwrap();
        create_doc(&dir, "b.dsds.json", "{}").unwrap();
        assert!(matches!(
            rename_doc(&dir, "a.dsds.json", "b.dsds.json"),
            Err(ProjectError::AlreadyExists(_))
        ));
    }

    #[test]
    fn delete_removes_the_file() {
        let dir = temp_dir();
        create_doc(&dir, "sub/gone.dsds.json", "{}").unwrap();
        delete_doc(&dir, "sub/gone.dsds.json").unwrap();
        assert!(matches!(
            delete_doc(&dir, "sub/gone.dsds.json"),
            Err(ProjectError::NotFound(_))
        ));
    }

    #[test]
    fn operations_reject_path_traversal() {
        let dir = temp_dir();
        assert!(matches!(
            create_doc(&dir, "../escape.dsds.json", "{}"),
            Err(ProjectError::InvalidName(_))
        ));
        assert!(matches!(
            read_doc(&dir, "a/../../etc/passwd.dsds.json"),
            Err(ProjectError::InvalidName(_))
        ));
    }
}
