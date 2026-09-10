use axum::{
    extract::{Path, State},
    response::IntoResponse,
    Json,
};
use serde_json::json;

use crate::{
    db::ensure_project_storage,
    main_types::{AppError, AppState},
    models::RevealDto,
};

// POST /api/fs/reveal
pub async fn reveal_in_explorer(
    State(state): State<AppState>,
    Json(dto): Json<RevealDto>,
) -> Result<impl IntoResponse, AppError> {
    let clean_path = dto.path.trim();
    if clean_path.is_empty() {
        return Err(AppError::BadRequest("Path cannot be empty".into()));
    }

    // Determine target path: could be relative to data_dir or absolute if it's already inside data_dir
    let target = if std::path::Path::new(clean_path).is_absolute() {
        std::path::PathBuf::from(clean_path)
    } else {
        state.data_dir.join(clean_path)
    };

    let canonical_data_dir = match state.data_dir.canonicalize() {
        Ok(d) => d,
        Err(_) => state.data_dir.clone(),
    };

    let canonical_target = match target.canonicalize() {
        Ok(t) => t,
        Err(_) => return Err(AppError::NotFound(format!("Path not found: {}", clean_path))),
    };

    if !canonical_target.starts_with(&canonical_data_dir) {
        return Err(AppError::BadRequest(
            "Access denied: path is outside the allowed data directory".into(),
        ));
    }

    #[cfg(target_os = "windows")]
    {
        let clean_target = canonical_target
            .to_str()
            .unwrap_or("")
            .strip_prefix(r"\\?\")
            .unwrap_or_else(|| canonical_target.to_str().unwrap_or(""));

        if canonical_target.is_file() {
            let _ = std::process::Command::new("explorer.exe")
                .arg(format!("/select,{}", clean_target))
                .spawn();
        } else {
            let _ = std::process::Command::new("explorer.exe")
                .arg(clean_target)
                .spawn();
        }
    }

    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .arg("-R")
            .arg(&canonical_target)
            .spawn();
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let _ = std::process::Command::new("xdg-open")
            .arg(&canonical_target)
            .spawn();
    }

    Ok(Json(json!({
        "status": "revealed",
        "path": canonical_target.to_string_lossy()
    })))
}

// POST /api/projects/:id/open-folder
pub async fn open_project_folder(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get()?;
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM projects WHERE id = ?",
        [id],
        |r| r.get(0),
    )?;
    if count == 0 {
        return Err(AppError::NotFound(format!("Project {} not found", id)));
    }

    let folder = ensure_project_storage(&state.data_dir, id)?;
    let canonical = match folder.canonicalize() {
        Ok(c) => c,
        Err(_) => folder,
    };

    #[cfg(target_os = "windows")]
    {
        let clean_folder = canonical
            .to_str()
            .unwrap_or("")
            .strip_prefix(r"\\?\")
            .unwrap_or_else(|| canonical.to_str().unwrap_or(""));

        let _ = std::process::Command::new("explorer.exe")
            .arg(clean_folder)
            .spawn();
    }

    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .arg(&canonical)
            .spawn();
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let _ = std::process::Command::new("xdg-open")
            .arg(&canonical)
            .spawn();
    }

    Ok(Json(json!({
        "status": "opened",
        "project_id": id,
        "folder": canonical.to_string_lossy()
    })))
}
