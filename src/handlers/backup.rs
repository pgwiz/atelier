use axum::{
    body::Body,
    extract::{Multipart, State},
    http::{header, HeaderMap, HeaderValue},
    response::{IntoResponse, Response},
    Json,
};
use chrono::Utc;
use rusqlite::{params, Connection};
use serde_json::json;
use std::{
    collections::HashMap,
    fs::File,
    io::{Cursor, Read, Write},
    path::Path,
};
use tempfile::NamedTempFile;
use walkdir::WalkDir;

use crate::{
    main_types::{AppError, AppState},
    models::{
        BackupCounts, BackupManifest, Board, BoardItem, Character, FullBackupData, Link, Prompt,
        Tag, TaggableRecord,
    },
};

pub fn extract_full_backup_data(conn: &Connection) -> Result<FullBackupData, rusqlite::Error> {
    // 1. Characters
    let mut stmt = conn.prepare(
        "SELECT id, name, description, traits, image_path, notes, created_at FROM characters ORDER BY id ASC",
    )?;
    let characters = stmt
        .query_map([], |row| {
            Ok(Character {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                traits: row.get(3)?,
                image_path: row.get(4)?,
                notes: row.get(5)?,
                created_at: row.get(6)?,
                tags: Vec::new(),
                prompts_count: None,
                prompts: None,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    // 2. Prompts
    let mut stmt = conn.prepare(
        "SELECT id, title, body, system_prompt, parameters, model_used, category, notes, is_favorite, character_id, created_at
         FROM prompts ORDER BY id ASC",
    )?;
    let prompts = stmt
        .query_map([], |row| {
            let is_fav: i64 = row.get(8)?;
            Ok(Prompt {
                id: row.get(0)?,
                title: row.get(1)?,
                body: row.get(2)?,
                system_prompt: row.get(3)?,
                parameters: row.get(4)?,
                model_used: row.get(5)?,
                category: row.get(6)?,
                notes: row.get(7)?,
                is_favorite: is_fav != 0,
                character_id: row.get(9)?,
                created_at: row.get(10)?,
                tags: Vec::new(),
                character_name: None,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    // 3. Links
    let mut stmt = conn.prepare(
        "SELECT id, url, platform, title, description, thumbnail_url, created_at FROM links ORDER BY id ASC",
    )?;
    let links = stmt
        .query_map([], |row| {
            Ok(Link {
                id: row.get(0)?,
                url: row.get(1)?,
                platform: row.get(2)?,
                title: row.get(3)?,
                description: row.get(4)?,
                thumbnail_url: row.get(5)?,
                created_at: row.get(6)?,
                tags: Vec::new(),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    // 4. Tags
    let mut stmt = conn.prepare("SELECT id, name FROM tags ORDER BY id ASC")?;
    let tags = stmt
        .query_map([], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    // 5. Taggables
    let mut stmt = conn.prepare(
        "SELECT tag_id, entity_type, entity_id FROM taggables ORDER BY tag_id ASC, entity_id ASC",
    )?;
    let taggables = stmt
        .query_map([], |row| {
            Ok(TaggableRecord {
                tag_id: row.get(0)?,
                entity_type: row.get(1)?,
                entity_id: row.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    // 6. Boards
    let mut stmt = conn.prepare(
        "SELECT id, name, theme, canvas_style, pan_x, pan_y, zoom, drawing_data, created_at FROM boards ORDER BY id ASC",
    )?;
    let boards = stmt
        .query_map([], |row| {
            let drawing_data_str: String = row.get(7)?;
            let drawing_data = serde_json::from_str(&drawing_data_str).unwrap_or_else(|_| serde_json::json!([]));
            Ok(Board {
                id: row.get(0)?,
                name: row.get(1)?,
                theme: row.get(2)?,
                canvas_style: row.get(3)?,
                pan_x: row.get(4)?,
                pan_y: row.get(5)?,
                zoom: row.get(6)?,
                drawing_data,
                created_at: row.get(8)?,
                items_count: None,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    // 7. Board Items
    let mut stmt = conn.prepare(
        "SELECT id, board_id, entity_type, entity_id, note_text, pos_x, pos_y, width, height, z_index, color, created_at
         FROM board_items ORDER BY id ASC",
    )?;
    let board_items = stmt
        .query_map([], |row| {
            Ok(BoardItem {
                id: row.get(0)?,
                board_id: row.get(1)?,
                entity_type: row.get(2)?,
                entity_id: row.get(3)?,
                note_text: row.get(4)?,
                pos_x: row.get(5)?,
                pos_y: row.get(6)?,
                width: row.get(7)?,
                height: row.get(8)?,
                z_index: row.get(9)?,
                color: row.get(10)?,
                created_at: row.get(11)?,
                entity_title: None,
                entity_subtitle: None,
                entity_image: None,
                entity_tags: Vec::new(),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(FullBackupData {
        characters,
        prompts,
        links,
        tags,
        taggables,
        boards,
        board_items,
    })
}

pub fn restore_full_backup_data(
    conn: &mut Connection,
    data: &FullBackupData,
) -> Result<BackupCounts, AppError> {
    let tx = conn.transaction().map_err(|e| AppError::Database(e.to_string()))?;

    // Temporarily turn off foreign keys to allow bulk replace
    tx.execute_batch(
        "PRAGMA foreign_keys = OFF;
         DELETE FROM taggables;
         DELETE FROM tags;
         DELETE FROM board_items;
         DELETE FROM boards;
         DELETE FROM prompts;
         DELETE FROM links;
         DELETE FROM characters;",
    )
    .map_err(|e| AppError::Database(e.to_string()))?;

    // 1. Characters
    for c in &data.characters {
        tx.execute(
            "INSERT INTO characters (id, name, description, traits, image_path, notes, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![c.id, c.name, c.description, c.traits, c.image_path, c.notes, c.created_at],
        )
        .map_err(|e| AppError::Database(e.to_string()))?;
    }

    // 2. Prompts
    for p in &data.prompts {
        let is_fav = if p.is_favorite { 1 } else { 0 };
        tx.execute(
            "INSERT INTO prompts (id, title, body, system_prompt, parameters, model_used, category, notes, is_favorite, character_id, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                p.id,
                p.title,
                p.body,
                p.system_prompt,
                p.parameters,
                p.model_used,
                p.category,
                p.notes,
                is_fav,
                p.character_id,
                p.created_at,
            ],
        )
        .map_err(|e| AppError::Database(e.to_string()))?;
    }

    // 3. Links
    for l in &data.links {
        tx.execute(
            "INSERT INTO links (id, url, platform, title, description, thumbnail_url, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![l.id, l.url, l.platform, l.title, l.description, l.thumbnail_url, l.created_at],
        )
        .map_err(|e| AppError::Database(e.to_string()))?;
    }

    // 4. Tags
    for t in &data.tags {
        tx.execute(
            "INSERT INTO tags (id, name) VALUES (?1, ?2)",
            params![t.id, t.name],
        )
        .map_err(|e| AppError::Database(e.to_string()))?;
    }

    // 5. Taggables
    for tg in &data.taggables {
        tx.execute(
            "INSERT INTO taggables (tag_id, entity_type, entity_id) VALUES (?1, ?2, ?3)",
            params![tg.tag_id, tg.entity_type, tg.entity_id],
        )
        .map_err(|e| AppError::Database(e.to_string()))?;
    }

    // 6. Boards
    for b in &data.boards {
        let drawing_data_str = b.drawing_data.to_string();
        tx.execute(
            "INSERT INTO boards (id, name, theme, canvas_style, pan_x, pan_y, zoom, drawing_data, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                b.id,
                b.name,
                b.theme,
                b.canvas_style,
                b.pan_x,
                b.pan_y,
                b.zoom,
                drawing_data_str,
                b.created_at,
            ],
        )
        .map_err(|e| AppError::Database(e.to_string()))?;
    }

    // 7. Board Items
    for bi in &data.board_items {
        tx.execute(
            "INSERT INTO board_items (id, board_id, entity_type, entity_id, note_text, pos_x, pos_y, width, height, z_index, color, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                bi.id,
                bi.board_id,
                bi.entity_type,
                bi.entity_id,
                bi.note_text,
                bi.pos_x,
                bi.pos_y,
                bi.width,
                bi.height,
                bi.z_index,
                bi.color,
                bi.created_at,
            ],
        )
        .map_err(|e| AppError::Database(e.to_string()))?;
    }

    // Re-enable foreign keys
    tx.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|e| AppError::Database(e.to_string()))?;

    tx.commit().map_err(|e| AppError::Database(e.to_string()))?;

    Ok(BackupCounts {
        characters: data.characters.len(),
        prompts: data.prompts.len(),
        links: data.links.len(),
        tags: data.tags.len(),
        taggables: data.taggables.len(),
        boards: data.boards.len(),
        board_items: data.board_items.len(),
        uploads: 0,
    })
}

// GET /api/export and /api/backup/export
pub async fn export_json(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    let data = extract_full_backup_data(&conn).map_err(|e| AppError::Database(e.to_string()))?;

    let json_bytes = serde_json::to_vec_pretty(&data)
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let timestamp = Utc::now().format("%Y%m%d-%H%M%S").to_string();
    let filename = format!("atelier-export-{}.json", timestamp);

    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&format!("attachment; filename=\"{}\"", filename))
            .unwrap_or_else(|_| HeaderValue::from_static("attachment; filename=\"atelier-export.json\"")),
    );

    Ok((headers, Body::from(json_bytes)))
}

// POST /api/import and /api/backup/import
pub async fn import_json(
    State(state): State<AppState>,
    Json(data): Json<FullBackupData>,
) -> Result<impl IntoResponse, AppError> {
    let mut conn = state.pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    let counts = restore_full_backup_data(&mut conn, &data)?;

    Ok(Json(json!({
        "status": "success",
        "message": "Database successfully restored from JSON backup",
        "counts": counts
    })))
}

// GET /api/backup/archive
pub async fn export_archive(
    State(state): State<AppState>,
) -> Result<Response, AppError> {
    let conn = state.pool.get().map_err(|e| AppError::Database(e.to_string()))?;

    // 1. Checkpoint WAL and create clean SQLite backup file
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
        .map_err(|e| AppError::Database(e.to_string()))?;

    let temp_db_file = NamedTempFile::new().map_err(|e| AppError::Io(e.to_string()))?;
    {
        let mut dest_conn = Connection::open(temp_db_file.path())
            .map_err(|e| AppError::Database(e.to_string()))?;
        let backup = rusqlite::backup::Backup::new(&conn, &mut dest_conn)
            .map_err(|e: rusqlite::Error| AppError::Database(e.to_string()))?;
        backup.run_to_completion(5, std::time::Duration::from_millis(250), None)
            .map_err(|e: rusqlite::Error| AppError::Database(e.to_string()))?;
    }

    let mut clean_db_bytes = Vec::new();
    {
        let mut f = File::open(temp_db_file.path()).map_err(|e| AppError::Io(e.to_string()))?;
        f.read_to_end(&mut clean_db_bytes)
            .map_err(|e| AppError::Io(e.to_string()))?;
    }

    // 2. Export database.json
    let full_data = extract_full_backup_data(&conn).map_err(|e| AppError::Database(e.to_string()))?;
    let db_json_bytes = serde_json::to_vec_pretty(&full_data)
        .map_err(|e| AppError::Internal(e.to_string()))?;

    // 3. Collect media uploads
    let mut upload_files: Vec<(String, Vec<u8>)> = Vec::new();
    if state.uploads_dir.exists() {
        for entry in WalkDir::new(&state.uploads_dir).into_iter().filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_file() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name == ".gitkeep" {
                        continue;
                    }
                    if let Ok(mut f) = File::open(path) {
                        let mut bytes = Vec::new();
                        if f.read_to_end(&mut bytes).is_ok() {
                            upload_files.push((name.to_string(), bytes));
                        }
                    }
                }
            }
        }
    }

    // 4. Manifest
    let mut checksums = HashMap::new();
    checksums.insert("atelier.db_bytes".into(), clean_db_bytes.len().to_string());
    checksums.insert("database.json_bytes".into(), db_json_bytes.len().to_string());

    let manifest = BackupManifest {
        version: "1.0.0".into(),
        app_name: "Atelier".into(),
        created_at: Utc::now().to_rfc3339(),
        counts: BackupCounts {
            characters: full_data.characters.len(),
            prompts: full_data.prompts.len(),
            links: full_data.links.len(),
            tags: full_data.tags.len(),
            taggables: full_data.taggables.len(),
            boards: full_data.boards.len(),
            board_items: full_data.board_items.len(),
            uploads: upload_files.len(),
        },
        checksums,
    };
    let manifest_bytes = serde_json::to_vec_pretty(&manifest)
        .map_err(|e| AppError::Internal(e.to_string()))?;

    // 5. Build ZIP in memory
    let mut zip_buffer = Cursor::new(Vec::new());
    {
        let mut zip_writer = zip::ZipWriter::new(&mut zip_buffer);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        zip_writer
            .start_file("manifest.json", options)
            .map_err(|e| AppError::Internal(e.to_string()))?;
        zip_writer
            .write_all(&manifest_bytes)
            .map_err(|e| AppError::Internal(e.to_string()))?;

        zip_writer
            .start_file("database.json", options)
            .map_err(|e| AppError::Internal(e.to_string()))?;
        zip_writer
            .write_all(&db_json_bytes)
            .map_err(|e| AppError::Internal(e.to_string()))?;

        zip_writer
            .start_file("atelier.db", options)
            .map_err(|e| AppError::Internal(e.to_string()))?;
        zip_writer
            .write_all(&clean_db_bytes)
            .map_err(|e| AppError::Internal(e.to_string()))?;

        for (filename, file_bytes) in upload_files {
            let zip_path = format!("uploads/{}", filename);
            zip_writer
                .start_file(&zip_path, options)
                .map_err(|e| AppError::Internal(e.to_string()))?;
            zip_writer
                .write_all(&file_bytes)
                .map_err(|e| AppError::Internal(e.to_string()))?;
        }

        zip_writer
            .finish()
            .map_err(|e| AppError::Internal(e.to_string()))?;
    }

    let timestamp = Utc::now().format("%Y%m%d-%H%M%S").to_string();
    let filename = format!("atelier-backup-{}.zip", timestamp);

    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, HeaderValue::from_static("application/zip"));
    headers.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&format!("attachment; filename=\"{}\"", filename))
            .unwrap_or_else(|_| HeaderValue::from_static("attachment; filename=\"atelier-backup.zip\"")),
    );

    Ok((headers, Body::from(zip_buffer.into_inner())).into_response())
}

// POST /api/backup/restore
pub async fn restore_archive(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<impl IntoResponse, AppError> {
    let mut zip_bytes: Option<Vec<u8>> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        let data = field
            .bytes()
            .await
            .map_err(|e| AppError::BadRequest(e.to_string()))?;

        if !data.is_empty() {
            zip_bytes = Some(data.to_vec());
            break;
        }
    }

    let raw_zip = zip_bytes
        .ok_or_else(|| AppError::BadRequest("No zip file provided in request".into()))?;

    let cursor = Cursor::new(raw_zip);
    let mut archive = zip::ZipArchive::new(cursor)
        .map_err(|e| AppError::BadRequest(format!("Invalid zip archive: {}", e)))?;

    // Read files from archive
    let mut manifest_opt: Option<BackupManifest> = None;
    let mut db_json_opt: Option<Vec<u8>> = None;
    let mut uploads_to_extract: Vec<(String, Vec<u8>)> = Vec::new();

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| AppError::BadRequest(e.to_string()))?;
        let name = file.name().to_string();

        if file.is_dir() {
            continue;
        }

        if name == "manifest.json" {
            let mut bytes = Vec::new();
            file.read_to_end(&mut bytes)
                .map_err(|e| AppError::Internal(e.to_string()))?;
            let manifest: BackupManifest = serde_json::from_slice(&bytes)
                .map_err(|e| AppError::BadRequest(format!("Invalid manifest.json: {}", e)))?;
            manifest_opt = Some(manifest);
        } else if name == "database.json" {
            let mut bytes = Vec::new();
            file.read_to_end(&mut bytes)
                .map_err(|e| AppError::Internal(e.to_string()))?;
            db_json_opt = Some(bytes);
        } else if name.starts_with("uploads/") {
            let subname = name.trim_start_matches("uploads/").to_string();
            if !subname.is_empty() && subname != ".gitkeep" {
                let mut bytes = Vec::new();
                file.read_to_end(&mut bytes)
                    .map_err(|e| AppError::Internal(e.to_string()))?;
                uploads_to_extract.push((subname, bytes));
            }
        }
    }

    // Require manifest.json
    let manifest = manifest_opt
        .ok_or_else(|| AppError::BadRequest("Archive missing manifest.json".into()))?;

    // We must have database.json
    let db_json = db_json_opt
        .ok_or_else(|| AppError::BadRequest("Archive missing database.json".into()))?;

    let parsed_data: FullBackupData = serde_json::from_slice(&db_json)
        .map_err(|e| AppError::BadRequest(format!("Corrupt database.json in archive: {}", e)))?;

    // Validate entity counts against manifest
    if manifest.counts.prompts != parsed_data.prompts.len()
        || manifest.counts.characters != parsed_data.characters.len()
        || manifest.counts.links != parsed_data.links.len()
        || manifest.counts.boards != parsed_data.boards.len()
    {
        return Err(AppError::BadRequest("Archive validation failed: manifest entity counts mismatch".into()));
    }

    // Transactionally restore database
    let mut conn = state.pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    let mut counts = restore_full_backup_data(&mut conn, &parsed_data)?;

    // Extract uploads
    std::fs::create_dir_all(&state.uploads_dir).map_err(|e| AppError::Io(e.to_string()))?;

    let mut restored_uploads = 0;
    for (filename, bytes) in uploads_to_extract {
        // Sanitize filename to prevent directory traversal
        let safe_filename = Path::new(&filename)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(&filename);

        let dest = state.uploads_dir.join(safe_filename);
        if let Ok(mut f) = File::create(dest) {
            if f.write_all(&bytes).is_ok() {
                restored_uploads += 1;
            }
        }
    }
    counts.uploads = restored_uploads;

    Ok(Json(json!({
        "status": "success",
        "message": "Archive successfully restored and verified",
        "verification_status": "verified",
        "restored": counts
    })))
}
