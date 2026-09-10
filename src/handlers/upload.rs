use axum::{
    extract::{Multipart, State},
    response::IntoResponse,
    Json,
};
use serde_json::json;
use std::path::Path;
use tokio::fs::File;
use tokio::io::AsyncWriteExt;
use uuid::Uuid;

use crate::main_types::{AppError, AppState};

pub async fn upload_file(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<impl IntoResponse, AppError> {
    tokio::fs::create_dir_all(&state.uploads_dir)
        .await
        .map_err(|e| AppError::Io(e.to_string()))?;

    let mut saved_filename: Option<String> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        let file_name = field.file_name().map(|s| s.to_string());
        let data = field
            .bytes()
            .await
            .map_err(|e| AppError::BadRequest(e.to_string()))?;

        if data.is_empty() {
            continue;
        }

        // Determine extension
        let ext = file_name
            .as_deref()
            .and_then(|name| Path::new(name).extension())
            .and_then(|ext| ext.to_str())
            .map(|s| s.to_lowercase())
            .unwrap_or_else(|| "png".into());

        // Sanitize extension
        let safe_ext = match ext.as_str() {
            "jpg" | "jpeg" | "png" | "gif" | "webp" | "svg" | "bmp" | "ico" => ext,
            _ => "png".into(),
        };

        let unique_name = format!("{}.{}", Uuid::new_v4(), safe_ext);
        let dest_path = state.uploads_dir.join(&unique_name);

        let mut file = File::create(&dest_path)
            .await
            .map_err(|e| AppError::Io(e.to_string()))?;

        file.write_all(&data)
            .await
            .map_err(|e| AppError::Io(e.to_string()))?;

        saved_filename = Some(unique_name);
        break; // Only save the first file field
    }

    match saved_filename {
        Some(name) => Ok(Json(json!({
            "status": "success",
            "filename": name,
            "url": format!("/uploads/{}", name)
        }))),
        None => Err(AppError::BadRequest("No file uploaded in form data".into())),
    }
}
