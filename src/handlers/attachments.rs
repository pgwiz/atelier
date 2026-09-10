use axum::{
    body::Body,
    extract::{Multipart, Path, Query, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use rusqlite::params;
use serde::Deserialize;
use serde_json::json;
use std::fs::File;
use std::io::{Read, Write};
use uuid::Uuid;

use crate::{
    db::{ensure_project_storage, project_folder},
    handlers::projects::sync_project_json,
    main_types::{AppError, AppState},
    models::ProjectAttachment,
};

#[derive(Debug, Deserialize)]
pub struct AttachmentFilterParams {
    pub part_id: Option<i64>,
}

// GET /api/projects/:id/attachments
pub async fn list_attachments(
    State(state): State<AppState>,
    Path(project_id): Path<i64>,
    Query(params): Query<AttachmentFilterParams>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get()?;
    let mut sql = String::from(
        "SELECT id, project_id, part_id, name, addon_type, file_path, file_size, mime_type, notes, created_at, updated_at
         FROM project_attachments WHERE project_id = ?",
    );
    if let Some(pid) = params.part_id {
        sql.push_str(&format!(" AND part_id = {}", pid));
    }
    sql.push_str(" ORDER BY id DESC");

    let mut stmt = conn.prepare(&sql)?;
    let attachments = stmt
        .query_map([project_id], |row| {
            let pid: i64 = row.get(1)?;
            let fpath: String = row.get(5)?;
            Ok(ProjectAttachment {
                id: row.get(0)?,
                project_id: pid,
                part_id: row.get(2)?,
                name: row.get(3)?,
                addon_type: row.get(4)?,
                file_path: fpath.clone(),
                file_size: row.get(6)?,
                mime_type: row.get(7)?,
                notes: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                download_url: Some(format!("/files/projects/{}/{}", pid, fpath)),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(Json(attachments))
}

// POST /api/projects/:id/attachments
pub async fn upload_attachment(
    State(state): State<AppState>,
    Path(project_id): Path<i64>,
    mut multipart: Multipart,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get()?;
    // Check project exists
    let proj_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM projects WHERE id = ?",
        [project_id],
        |r| r.get(0),
    )?;
    if proj_count == 0 {
        return Err(AppError::NotFound(format!(
            "Project {} not found",
            project_id
        )));
    }

    let mut file_bytes: Option<Vec<u8>> = None;
    let mut orig_filename: Option<String> = None;
    let mut name_override: Option<String> = None;
    let mut addon_type: Option<String> = None;
    let mut part_id: Option<i64> = None;
    let mut notes: Option<String> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        let field_name = field.name().unwrap_or("").to_string();
        if field_name == "file" {
            orig_filename = field.file_name().map(|s| s.to_string());
            let data = field
                .bytes()
                .await
                .map_err(|e| AppError::BadRequest(e.to_string()))?;
            file_bytes = Some(data.to_vec());
        } else if field_name == "name" {
            name_override = field.text().await.ok().filter(|s| !s.trim().is_empty());
        } else if field_name == "addon_type" {
            addon_type = field.text().await.ok().filter(|s| !s.trim().is_empty());
        } else if field_name == "part_id" {
            part_id = field.text().await.ok().and_then(|s| s.parse().ok());
        } else if field_name == "notes" {
            notes = field.text().await.ok();
        }
    }

    let bytes = file_bytes.ok_or_else(|| AppError::BadRequest("No file uploaded".into()))?;
    let raw_filename = orig_filename.unwrap_or_else(|| "attachment.bin".into());
    let display_name = name_override.unwrap_or_else(|| raw_filename.clone());

    // Guess type if not provided
    let guessed_mime = mime_guess::from_path(&raw_filename)
        .first_or_octet_stream()
        .to_string();

    let resolved_type = addon_type.unwrap_or_else(|| {
        if guessed_mime.starts_with("audio/") {
            "audio".into()
        } else if guessed_mime.starts_with("video/") {
            "video".into()
        } else if guessed_mime.starts_with("image/") {
            "image".into()
        } else if guessed_mime == "application/pdf" || guessed_mime.starts_with("text/") {
            "document".into()
        } else {
            "custom".into()
        }
    });

    let subfolder = match resolved_type.as_str() {
        "audio" => "audio",
        "video" => "videos",
        "image" => "images",
        "document" => "documents",
        _ => "documents",
    };

    let safe_ext: String = raw_filename
        .split('.')
        .last()
        .map(|e| format!(".{}", e))
        .unwrap_or_default();
    let unique_name = format!("{}_{}{}", Uuid::new_v4().simple(), subfolder, safe_ext);
    let relative_path = format!("{}/{}", subfolder, unique_name);

    let proj_dir = ensure_project_storage(&state.data_dir, project_id)?;
    let full_path = proj_dir.join(&relative_path);

    let mut out = File::create(&full_path)?;
    out.write_all(&bytes)?;

    let file_size = bytes.len() as i64;

    conn.execute(
        "INSERT INTO project_attachments (project_id, part_id, name, addon_type, file_path, file_size, mime_type, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
        params![
            project_id,
            part_id,
            display_name,
            resolved_type,
            relative_path,
            file_size,
            guessed_mime,
            notes
        ],
    )?;

    let att_id = conn.last_insert_rowid();

    let _ = conn.execute(
        "UPDATE projects SET updated_at = datetime('now') WHERE id = ?",
        [project_id],
    );
    let _ = sync_project_json(&conn, project_id, &state.data_dir);

    let attachment = ProjectAttachment {
        id: att_id,
        project_id,
        part_id,
        name: display_name,
        addon_type: resolved_type,
        file_path: relative_path.clone(),
        file_size: Some(file_size),
        mime_type: Some(guessed_mime),
        notes,
        created_at: chrono::Utc::now().to_rfc3339(),
        updated_at: chrono::Utc::now().to_rfc3339(),
        download_url: Some(format!("/files/projects/{}/{}", project_id, relative_path)),
    };

    Ok((StatusCode::CREATED, Json(attachment)))
}

// GET /api/attachments/:id
pub async fn get_attachment(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, project_id, part_id, name, addon_type, file_path, file_size, mime_type, notes, created_at, updated_at
         FROM project_attachments WHERE id = ?",
    )?;
    let mut rows = stmt.query([id])?;
    let r = rows
        .next()?
        .ok_or_else(|| AppError::NotFound(format!("Attachment {} not found", id)))?;

    let pid: i64 = r.get(1)?;
    let fpath: String = r.get(5)?;
    let attachment = ProjectAttachment {
        id: r.get(0)?,
        project_id: pid,
        part_id: r.get(2)?,
        name: r.get(3)?,
        addon_type: r.get(4)?,
        file_path: fpath.clone(),
        file_size: r.get(6)?,
        mime_type: r.get(7)?,
        notes: r.get(8)?,
        created_at: r.get(9)?,
        updated_at: r.get(10)?,
        download_url: Some(format!("/files/projects/{}/{}", pid, fpath)),
    };

    Ok(Json(attachment))
}

// DELETE /api/attachments/:id
pub async fn delete_attachment(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT project_id, file_path FROM project_attachments WHERE id = ?",
    )?;
    let mut rows = stmt.query([id])?;
    let r = rows
        .next()?
        .ok_or_else(|| AppError::NotFound(format!("Attachment {} not found", id)))?;

    let project_id: i64 = r.get(0)?;
    let file_path: String = r.get(1)?;

    conn.execute("DELETE FROM project_attachments WHERE id = ?", [id])?;

    // Delete disk file
    let disk_file = project_folder(&state.data_dir, project_id).join(&file_path);
    if disk_file.exists() {
        let _ = std::fs::remove_file(disk_file);
    }

    let _ = conn.execute(
        "UPDATE projects SET updated_at = datetime('now') WHERE id = ?",
        [project_id],
    );
    let _ = sync_project_json(&conn, project_id, &state.data_dir);

    Ok(Json(json!({ "success": true, "deleted_id": id })))
}

// GET /files/projects/:id/*path
pub async fn stream_project_file(
    State(state): State<AppState>,
    Path((project_id, raw_path)): Path<(i64, String)>,
) -> Result<Response, AppError> {
    if raw_path.contains("..") || raw_path.contains('\\') {
        return Err(AppError::BadRequest("Invalid file path".into()));
    }

    let base_dir = project_folder(&state.data_dir, project_id);
    let target = base_dir.join(&raw_path);

    let canonical_base = match base_dir.canonicalize() {
        Ok(b) => b,
        Err(_) => return Err(AppError::NotFound("Project folder not found".into())),
    };

    let canonical_target = match target.canonicalize() {
        Ok(t) => t,
        Err(_) => return Err(AppError::NotFound("File not found".into())),
    };

    if !canonical_target.starts_with(&canonical_base) {
        return Err(AppError::BadRequest("Path traversal prohibited".into()));
    }

    if !canonical_target.is_file() {
        return Err(AppError::NotFound("Target is not a file".into()));
    }

    let mut file = File::open(&canonical_target)?;
    let mut contents = Vec::new();
    file.read_to_end(&mut contents)?;

    let mime = mime_guess::from_path(&canonical_target)
        .first_or_octet_stream()
        .to_string();

    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(&mime).unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream")),
    );
    headers.insert(
        header::CONTENT_LENGTH,
        HeaderValue::from_str(&contents.len().to_string()).unwrap_or_else(|_| HeaderValue::from_static("0")),
    );

    Ok((headers, Body::from(contents)).into_response())
}
