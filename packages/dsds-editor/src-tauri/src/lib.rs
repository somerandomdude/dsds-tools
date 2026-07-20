//! Tauri entry point and command surface for the DSDS editor.
//!
//! The commands here are thin wrappers over [`project`], which holds the
//! testable filesystem logic. Each command takes an explicit project directory
//! path (chosen by the user through the native directory dialog on the
//! frontend) and a validated document name.

mod project;

use std::path::PathBuf;

/// Convert a project error into a plain string for the frontend boundary.
fn map_err<T>(r: project::Result<T>) -> Result<T, String> {
    r.map_err(|e| e.to_string())
}

#[tauri::command]
fn list_docs(dir: String) -> Result<Vec<project::DocEntry>, String> {
    map_err(project::list_docs(&PathBuf::from(dir)))
}

#[tauri::command]
fn read_doc(dir: String, name: String) -> Result<String, String> {
    map_err(project::read_doc(&PathBuf::from(dir), &name))
}

#[tauri::command]
fn write_doc(dir: String, name: String, contents: String) -> Result<project::DocEntry, String> {
    map_err(project::write_doc(&PathBuf::from(dir), &name, &contents))
}

#[tauri::command]
fn create_doc(dir: String, name: String, contents: String) -> Result<project::DocEntry, String> {
    map_err(project::create_doc(&PathBuf::from(dir), &name, &contents))
}

#[tauri::command]
fn rename_doc(dir: String, from: String, to: String) -> Result<project::DocEntry, String> {
    map_err(project::rename_doc(&PathBuf::from(dir), &from, &to))
}

#[tauri::command]
fn delete_doc(dir: String, name: String) -> Result<(), String> {
    map_err(project::delete_doc(&PathBuf::from(dir), &name))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_docs,
            read_doc,
            write_doc,
            create_doc,
            rename_doc,
            delete_doc
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
