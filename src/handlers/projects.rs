use axum::{
    body::Body,
    extract::{Multipart, Path, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use rusqlite::{params, Connection};
use serde_json::json;
use std::collections::HashMap;
use std::fs::File;
use std::io::{Cursor, Read, Write};
use std::path::Path as FsPath;

use crate::{
    db::{ensure_project_storage, project_folder},
    handlers::tags::{attach_tag_internal, get_tags_for_entity},
    main_types::{AppError, AppState},
    models::{
        Board, BoardItem, Character, CopyProjectDto, CreateProjectDto, Link, MergeProjectDto,
        Project, ProjectAttachment, ProjectManifest, ProjectPart, Prompt, TransferProjectDto,
        UpdateProjectDto,
    },
};

pub fn sync_project_json(
    conn: &Connection,
    project_id: i64,
    data_dir: &FsPath,
) -> Result<(), AppError> {
    // 1. Fetch project row
    let mut stmt = conn.prepare(
        "SELECT id, name, description, status, color, created_at, updated_at
         FROM projects WHERE id = ?",
    )?;
    let mut rows = stmt.query([project_id])?;
    let project_row = match rows.next()? {
        Some(r) => {
            let id: i64 = r.get(0)?;
            let name: String = r.get(1)?;
            let description: Option<String> = r.get(2)?;
            let status: String = r.get(3)?;
            let color: String = r.get(4)?;
            let created_at: String = r.get(5)?;
            let updated_at: String = r.get(6)?;
            (id, name, description, status, color, created_at, updated_at)
        }
        None => return Ok(()), // Project does not exist, nothing to sync
    };

    // Calculate counts
    let prompts_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM prompts WHERE project_id = ?",
            [project_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let characters_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM characters WHERE project_id = ?",
            [project_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let links_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM links WHERE project_id = ?",
            [project_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let boards_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM boards WHERE project_id = ?",
            [project_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let parts_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM project_parts WHERE project_id = ?",
            [project_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let completed_parts_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM project_parts WHERE project_id = ? AND status = 'Done'",
            [project_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let progress_percent = if parts_count == 0 {
        0
    } else {
        ((completed_parts_count as f64 / parts_count as f64) * 100.0).round() as i64
    };

    let project = Project {
        id: project_row.0,
        name: project_row.1,
        description: project_row.2,
        status: project_row.3,
        color: project_row.4,
        created_at: project_row.5,
        updated_at: project_row.6,
        prompts_count: Some(prompts_count),
        characters_count: Some(characters_count),
        links_count: Some(links_count),
        boards_count: Some(boards_count),
        parts_count: Some(parts_count),
        completed_parts_count: Some(completed_parts_count),
        progress_percent: Some(progress_percent),
    };

    // 2. Fetch parts with linked entity IDs
    let mut stmt = conn.prepare(
        "SELECT id, project_id, title, part_type, status, order_index, description, notes, board_id,
                created_at, updated_at, completed_at
         FROM project_parts WHERE project_id = ? ORDER BY order_index ASC, id ASC",
    )?;
    let parts_rows = stmt
        .query_map([project_id], |row| {
            Ok(ProjectPart {
                id: row.get(0)?,
                project_id: row.get(1)?,
                title: row.get(2)?,
                part_type: row.get(3)?,
                status: row.get(4)?,
                order_index: row.get(5)?,
                description: row.get(6)?,
                notes: row.get(7)?,
                board_id: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                completed_at: row.get(11)?,
                linked_character_ids: Vec::new(),
                linked_prompt_ids: Vec::new(),
                linked_link_ids: Vec::new(),
                linked_characters: Vec::new(),
                linked_prompts: Vec::new(),
                linked_links: Vec::new(),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut parts = Vec::new();
    for mut part in parts_rows {
        let mut ent_stmt = conn.prepare(
            "SELECT entity_type, entity_id FROM part_entities WHERE part_id = ? ORDER BY entity_id ASC",
        )?;
        let mut ent_rows = ent_stmt.query([part.id])?;
        while let Some(erow) = ent_rows.next()? {
            let etype: String = erow.get(0)?;
            let eid: i64 = erow.get(1)?;
            match etype.as_str() {
                "character" => part.linked_character_ids.push(eid),
                "prompt" => part.linked_prompt_ids.push(eid),
                "link" => part.linked_link_ids.push(eid),
                _ => {}
            }
        }
        parts.push(part);
    }

    // 3. Fetch prompts
    let mut stmt = conn.prepare(
        "SELECT p.id, p.title, p.body, p.system_prompt, p.parameters, p.model_used,
                p.category, p.notes, p.is_favorite, p.character_id, p.project_id, p.created_at, p.updated_at,
                c.name as character_name
         FROM prompts p
         LEFT JOIN characters c ON p.character_id = c.id
         WHERE p.project_id = ? ORDER BY p.id ASC",
    )?;
    let prompts_rows = stmt
        .query_map([project_id], |row| {
            let id: i64 = row.get(0)?;
            let title: String = row.get(1)?;
            let body: String = row.get(2)?;
            let system_prompt: Option<String> = row.get(3)?;
            let parameters: Option<String> = row.get(4)?;
            let model_used: Option<String> = row.get(5)?;
            let category: Option<String> = row.get(6)?;
            let notes: Option<String> = row.get(7)?;
            let is_fav_int: i64 = row.get(8)?;
            let character_id: Option<i64> = row.get(9)?;
            let proj_id: Option<i64> = row.get(10)?;
            let created_at: String = row.get(11)?;
            let updated_at: Option<String> = row.get(12)?;
            let character_name: Option<String> = row.get(13)?;
            Ok(Prompt {
                id,
                title,
                body,
                system_prompt,
                parameters,
                model_used,
                category,
                notes,
                is_favorite: is_fav_int != 0,
                character_id,
                project_id: proj_id,
                created_at,
                updated_at,
                tags: Vec::new(),
                character_name,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut prompts = Vec::new();
    for mut p in prompts_rows {
        p.tags = get_tags_for_entity(conn, "prompt", p.id).unwrap_or_default();
        prompts.push(p);
    }

    // 4. Fetch characters
    let mut stmt = conn.prepare(
        "SELECT id, name, description, traits, image_path, notes, project_id, created_at, updated_at
         FROM characters WHERE project_id = ? ORDER BY id ASC",
    )?;
    let characters_rows = stmt
        .query_map([project_id], |row| {
            Ok(Character {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                traits: row.get(3)?,
                image_path: row.get(4)?,
                notes: row.get(5)?,
                project_id: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
                tags: Vec::new(),
                prompts_count: None,
                prompts: None,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut characters = Vec::new();
    for mut c in characters_rows {
        c.tags = get_tags_for_entity(conn, "character", c.id).unwrap_or_default();
        characters.push(c);
    }

    // 5. Fetch links
    let mut stmt = conn.prepare(
        "SELECT id, url, platform, title, description, thumbnail_url, project_id, created_at, updated_at
         FROM links WHERE project_id = ? ORDER BY id ASC",
    )?;
    let links_rows = stmt
        .query_map([project_id], |row| {
            Ok(Link {
                id: row.get(0)?,
                url: row.get(1)?,
                platform: row.get(2)?,
                title: row.get(3)?,
                description: row.get(4)?,
                thumbnail_url: row.get(5)?,
                project_id: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
                tags: Vec::new(),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut links = Vec::new();
    for mut l in links_rows {
        l.tags = get_tags_for_entity(conn, "link", l.id).unwrap_or_default();
        links.push(l);
    }

    // 6. Fetch boards & board items
    let mut stmt = conn.prepare(
        "SELECT id, name, theme, canvas_style, pan_x, pan_y, zoom, drawing_data, project_id, created_at, updated_at
         FROM boards WHERE project_id = ? ORDER BY id ASC",
    )?;
    let boards = stmt
        .query_map([project_id], |row| {
            let drawing_str: String = row.get(7)?;
            let drawing_data =
                serde_json::from_str(&drawing_str).unwrap_or_else(|_| serde_json::json!([]));
            Ok(Board {
                id: row.get(0)?,
                name: row.get(1)?,
                theme: row.get(2)?,
                canvas_style: row.get(3)?,
                pan_x: row.get(4)?,
                pan_y: row.get(5)?,
                zoom: row.get(6)?,
                drawing_data,
                project_id: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                items_count: None,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut all_board_items = Vec::new();
    for b in &boards {
        let mut item_stmt = conn.prepare(
            "SELECT id, board_id, entity_type, entity_id, note_text, pos_x, pos_y, width, height, z_index, color, created_at
             FROM board_items WHERE board_id = ? ORDER BY id ASC",
        )?;
        let items = item_stmt
            .query_map([b.id], |row| {
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
        all_board_items.extend(items);
    }

    // 7. Fetch attachments
    let mut stmt = conn.prepare(
        "SELECT id, project_id, part_id, name, addon_type, file_path, file_size, mime_type, notes, created_at, updated_at
         FROM project_attachments WHERE project_id = ? ORDER BY id ASC",
    )?;
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

    let manifest = ProjectManifest {
        project,
        parts,
        prompts,
        characters,
        links,
        boards,
        board_items: all_board_items,
        attachments,
    };

    // Ensure folder structure
    let base_folder = ensure_project_storage(data_dir, project_id)?;
    let manifest_path = base_folder.join("project.json");

    let json_str = serde_json::to_string_pretty(&manifest)
        .map_err(|e| AppError::Internal(format!("Failed to serialize manifest: {}", e)))?;
    std::fs::write(&manifest_path, json_str)?;

    Ok(())
}

fn fetch_project_summary(conn: &Connection, id: i64) -> Result<Project, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, name, description, status, color, created_at, updated_at
         FROM projects WHERE id = ?",
    )?;
    let mut rows = stmt.query([id])?;
    let r = rows
        .next()?
        .ok_or_else(|| AppError::NotFound(format!("Project {} not found", id)))?;

    let p_id: i64 = r.get(0)?;
    let name: String = r.get(1)?;
    let description: Option<String> = r.get(2)?;
    let status: String = r.get(3)?;
    let color: String = r.get(4)?;
    let created_at: String = r.get(5)?;
    let updated_at: String = r.get(6)?;

    let prompts_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM prompts WHERE project_id = ?",
            [p_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let characters_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM characters WHERE project_id = ?",
            [p_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let links_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM links WHERE project_id = ?",
            [p_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let boards_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM boards WHERE project_id = ?",
            [p_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let parts_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM project_parts WHERE project_id = ?",
            [p_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let completed_parts_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM project_parts WHERE project_id = ? AND status = 'Done'",
            [p_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let progress_percent = if parts_count == 0 {
        0
    } else {
        ((completed_parts_count as f64 / parts_count as f64) * 100.0).round() as i64
    };

    Ok(Project {
        id: p_id,
        name,
        description,
        status,
        color,
        created_at,
        updated_at,
        prompts_count: Some(prompts_count),
        characters_count: Some(characters_count),
        links_count: Some(links_count),
        boards_count: Some(boards_count),
        parts_count: Some(parts_count),
        completed_parts_count: Some(completed_parts_count),
        progress_percent: Some(progress_percent),
    })
}

// GET /api/projects
pub async fn list_projects(State(state): State<AppState>) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get()?;
    let mut stmt = conn.prepare("SELECT id FROM projects ORDER BY id ASC")?;
    let ids = stmt
        .query_map([], |r| r.get::<_, i64>(0))?
        .collect::<Result<Vec<_>, _>>()?;

    let mut projects = Vec::new();
    for id in ids {
        if let Ok(p) = fetch_project_summary(&conn, id) {
            projects.push(p);
        }
    }

    Ok(Json(projects))
}

// POST /api/projects
pub async fn create_project(
    State(state): State<AppState>,
    Json(dto): Json<CreateProjectDto>,
) -> Result<impl IntoResponse, AppError> {
    let name = dto.name.trim();
    if name.is_empty() {
        return Err(AppError::BadRequest("Project name cannot be empty".into()));
    }

    let status = dto
        .status
        .unwrap_or_else(|| "In Progress".into())
        .trim()
        .to_string();
    let color = dto
        .color
        .unwrap_or_else(|| "#38bdf8".into())
        .trim()
        .to_string();
    let description = dto.description.map(|d| d.trim().to_string());

    let conn = state.pool.get()?;
    conn.execute(
        "INSERT INTO projects (name, description, status, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))",
        params![name, description, status, color],
    )?;

    let id = conn.last_insert_rowid();
    let _ = ensure_project_storage(&state.data_dir, id);
    let _ = sync_project_json(&conn, id, &state.data_dir);

    let project = fetch_project_summary(&conn, id)?;
    Ok((StatusCode::CREATED, Json(project)))
}

// GET /api/projects/:id
pub async fn get_project(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get()?;
    let project = fetch_project_summary(&conn, id)?;
    Ok(Json(project))
}

// PUT /api/projects/:id
pub async fn update_project(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(dto): Json<UpdateProjectDto>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get()?;
    let existing = fetch_project_summary(&conn, id)?;

    let new_name = match dto.name {
        Some(ref n) => {
            let tr = n.trim();
            if tr.is_empty() {
                return Err(AppError::BadRequest("Project name cannot be empty".into()));
            }
            tr.to_string()
        }
        None => existing.name,
    };

    let new_desc = match dto.description {
        Some(d) => Some(d.trim().to_string()),
        None => existing.description,
    };

    let new_status = match dto.status {
        Some(ref s) => {
            let tr = s.trim();
            if tr.is_empty() {
                existing.status
            } else {
                tr.to_string()
            }
        }
        None => existing.status,
    };

    let new_color = match dto.color {
        Some(ref c) => {
            let tr = c.trim();
            if tr.is_empty() {
                existing.color
            } else {
                tr.to_string()
            }
        }
        None => existing.color,
    };

    conn.execute(
        "UPDATE projects SET name = ?, description = ?, status = ?, color = ?, updated_at = datetime('now')
         WHERE id = ?",
        params![new_name, new_desc, new_status, new_color, id],
    )?;

    let _ = sync_project_json(&conn, id, &state.data_dir);
    let updated = fetch_project_summary(&conn, id)?;
    Ok(Json(updated))
}

// DELETE /api/projects/:id
pub async fn delete_project(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    let mut conn = state.pool.get()?;
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM projects WHERE id = ?",
        [id],
        |r| r.get(0),
    )?;
    if count == 0 {
        return Err(AppError::NotFound(format!("Project {} not found", id)));
    }

    let total_projects: i64 = conn.query_row(
        "SELECT COUNT(*) FROM projects",
        [],
        |r| r.get(0),
    )?;
    if total_projects <= 1 {
        return Err(AppError::BadRequest(
            "Cannot delete the only remaining workspace project".into(),
        ));
    }

    let tx = conn.transaction()?;
    tx.execute("DELETE FROM project_attachments WHERE project_id = ?", [id])?;
    tx.execute(
        "DELETE FROM part_entities WHERE part_id IN (SELECT id FROM project_parts WHERE project_id = ?)",
        [id],
    )?;
    tx.execute("DELETE FROM project_parts WHERE project_id = ?", [id])?;
    tx.execute(
        "DELETE FROM board_items WHERE board_id IN (SELECT id FROM boards WHERE project_id = ?)",
        [id],
    )?;
    tx.execute("DELETE FROM boards WHERE project_id = ?", [id])?;
    tx.execute("DELETE FROM prompts WHERE project_id = ?", [id])?;
    tx.execute("DELETE FROM characters WHERE project_id = ?", [id])?;
    tx.execute("DELETE FROM links WHERE project_id = ?", [id])?;
    tx.execute("DELETE FROM projects WHERE id = ?", [id])?;
    tx.commit()?;

    // Remove project folder from filesystem
    let folder = project_folder(&state.data_dir, id);
    if folder.exists() {
        let _ = std::fs::remove_dir_all(&folder);
    }

    Ok(Json(json!({ "success": true, "deleted_id": id })))
}

// POST /api/projects/:id/copy
pub async fn copy_project(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(dto): Json<CopyProjectDto>,
) -> Result<impl IntoResponse, AppError> {
    let mut conn = state.pool.get()?;
    let source = fetch_project_summary(&conn, id)?;

    let copy_name = dto
        .new_name
        .filter(|n| !n.trim().is_empty())
        .unwrap_or_else(|| format!("{} (Copy)", source.name));

    let tx = conn.transaction()?;

    tx.execute(
        "INSERT INTO projects (name, description, status, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))",
        params![copy_name, source.description, source.status, source.color],
    )?;
    let new_project_id = tx.last_insert_rowid();

    // Copy storage folder contents
    let src_folder = project_folder(&state.data_dir, id);
    let dst_folder = ensure_project_storage(&state.data_dir, new_project_id)?;

    if src_folder.exists() {
        for sub in &["audio", "documents", "images", "videos", "exports"] {
            let src_sub = src_folder.join(sub);
            let dst_sub = dst_folder.join(sub);
            if src_sub.exists() {
                for entry in walkdir::WalkDir::new(&src_sub).min_depth(1) {
                    if let Ok(ent) = entry {
                        if ent.file_type().is_file() {
                            if let Ok(rel) = ent.path().strip_prefix(&src_sub) {
                                let target_file = dst_sub.join(rel);
                                if let Some(p) = target_file.parent() {
                                    let _ = std::fs::create_dir_all(p);
                                }
                                let _ = std::fs::copy(ent.path(), target_file);
                            }
                        }
                    }
                }
            }
        }
    }

    // 1. Clone characters
    let mut char_map: HashMap<i64, i64> = HashMap::new();
    {
        let mut stmt = tx.prepare(
            "SELECT id, name, description, traits, image_path, notes FROM characters WHERE project_id = ?",
        )?;
        let chars = stmt
            .query_map([id], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        for (old_id, name, desc, traits, img, notes) in chars {
            tx.execute(
                "INSERT INTO characters (project_id, name, description, traits, image_path, notes, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
                params![new_project_id, name, desc, traits, img, notes],
            )?;
            let new_char_id = tx.last_insert_rowid();
            char_map.insert(old_id, new_char_id);

            // Copy tags
            let tags = get_tags_for_entity(&tx, "character", old_id).unwrap_or_default();
            for t in tags {
                let _ = attach_tag_internal(&tx, "character", new_char_id, &t);
            }
        }
    }

    // 2. Clone prompts
    let mut prompt_map: HashMap<i64, i64> = HashMap::new();
    {
        let mut stmt = tx.prepare(
            "SELECT id, title, body, system_prompt, parameters, model_used, category, notes, is_favorite, character_id
             FROM prompts WHERE project_id = ?",
        )?;
        let prompts = stmt
            .query_map([id], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, Option<String>>(7)?,
                    row.get::<_, i64>(8)?,
                    row.get::<_, Option<i64>>(9)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        for (old_id, title, body, sys, params_val, model, cat, notes, is_fav, old_cid) in prompts {
            let new_cid = old_cid.and_then(|cid| char_map.get(&cid).copied());
            tx.execute(
                "INSERT INTO prompts (project_id, title, body, system_prompt, parameters, model_used, category, notes, is_favorite, character_id, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
                params![new_project_id, title, body, sys, params_val, model, cat, notes, is_fav, new_cid],
            )?;
            let new_pid = tx.last_insert_rowid();
            prompt_map.insert(old_id, new_pid);

            let tags = get_tags_for_entity(&tx, "prompt", old_id).unwrap_or_default();
            for t in tags {
                let _ = attach_tag_internal(&tx, "prompt", new_pid, &t);
            }
        }
    }

    // 3. Clone links
    let mut link_map: HashMap<i64, i64> = HashMap::new();
    {
        let mut stmt = tx.prepare(
            "SELECT id, url, platform, title, description, thumbnail_url FROM links WHERE project_id = ?",
        )?;
        let links = stmt
            .query_map([id], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        for (old_id, url, plat, title, desc, thumb) in links {
            tx.execute(
                "INSERT INTO links (project_id, url, platform, title, description, thumbnail_url, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
                params![new_project_id, url, plat, title, desc, thumb],
            )?;
            let new_lid = tx.last_insert_rowid();
            link_map.insert(old_id, new_lid);

            let tags = get_tags_for_entity(&tx, "link", old_id).unwrap_or_default();
            for t in tags {
                let _ = attach_tag_internal(&tx, "link", new_lid, &t);
            }
        }
    }

    // 4. Clone boards & items
    let mut board_map: HashMap<i64, i64> = HashMap::new();
    {
        let mut stmt = tx.prepare(
            "SELECT id, name, theme, canvas_style, pan_x, pan_y, zoom, drawing_data FROM boards WHERE project_id = ?",
        )?;
        let boards = stmt
            .query_map([id], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, f64>(4)?,
                    row.get::<_, f64>(5)?,
                    row.get::<_, f64>(6)?,
                    row.get::<_, String>(7)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        for (old_bid, name, theme, style, px, py, zm, drawing) in boards {
            tx.execute(
                "INSERT INTO boards (project_id, name, theme, canvas_style, pan_x, pan_y, zoom, drawing_data, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
                params![new_project_id, name, theme, style, px, py, zm, drawing],
            )?;
            let new_bid = tx.last_insert_rowid();
            board_map.insert(old_bid, new_bid);

            let mut item_stmt = tx.prepare(
                "SELECT entity_type, entity_id, note_text, pos_x, pos_y, width, height, z_index, color
                 FROM board_items WHERE board_id = ?",
            )?;
            let items = item_stmt
                .query_map([old_bid], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, Option<i64>>(1)?,
                        row.get::<_, Option<String>>(2)?,
                        row.get::<_, f64>(3)?,
                        row.get::<_, f64>(4)?,
                        row.get::<_, f64>(5)?,
                        row.get::<_, f64>(6)?,
                        row.get::<_, i64>(7)?,
                        row.get::<_, Option<String>>(8)?,
                    ))
                })?
                .collect::<Result<Vec<_>, _>>()?;

            for (etype, old_eid, ntext, x, y, w, h, z, col) in items {
                let new_eid = match etype.as_str() {
                    "character" => old_eid.and_then(|e| char_map.get(&e).copied()),
                    "prompt" => old_eid.and_then(|e| prompt_map.get(&e).copied()),
                    "link" => old_eid.and_then(|e| link_map.get(&e).copied()),
                    _ => old_eid,
                };
                tx.execute(
                    "INSERT INTO board_items (board_id, entity_type, entity_id, note_text, pos_x, pos_y, width, height, z_index, color, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
                    params![new_bid, etype, new_eid, ntext, x, y, w, h, z, col],
                )?;
            }
        }
    }

    // 5. Clone parts & part_entities
    let mut part_map: HashMap<i64, i64> = HashMap::new();
    {
        let mut stmt = tx.prepare(
            "SELECT id, title, part_type, status, order_index, description, notes, board_id, completed_at
             FROM project_parts WHERE project_id = ? ORDER BY order_index ASC, id ASC",
        )?;
        let parts = stmt
            .query_map([id], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, Option<i64>>(7)?,
                    row.get::<_, Option<String>>(8)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        for (old_part_id, title, ptype, status, ord, desc, notes, old_bid, comp) in parts {
            let new_bid = old_bid.and_then(|b| board_map.get(&b).copied());
            tx.execute(
                "INSERT INTO project_parts (project_id, title, part_type, status, order_index, description, notes, board_id, completed_at, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
                params![new_project_id, title, ptype, status, ord, desc, notes, new_bid, comp],
            )?;
            let new_part_id = tx.last_insert_rowid();
            part_map.insert(old_part_id, new_part_id);

            let mut ent_stmt = tx.prepare(
                "SELECT entity_type, entity_id FROM part_entities WHERE part_id = ?",
            )?;
            let ents = ent_stmt
                .query_map([old_part_id], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
                })?
                .collect::<Result<Vec<_>, _>>()?;

            for (etype, old_eid) in ents {
                let mapped_eid = match etype.as_str() {
                    "character" => char_map.get(&old_eid).copied(),
                    "prompt" => prompt_map.get(&old_eid).copied(),
                    "link" => link_map.get(&old_eid).copied(),
                    _ => None,
                };
                if let Some(neid) = mapped_eid {
                    tx.execute(
                        "INSERT OR IGNORE INTO part_entities (part_id, entity_type, entity_id) VALUES (?, ?, ?)",
                        params![new_part_id, etype, neid],
                    )?;
                }
            }
        }

        // Remap board items referencing parts
        for (old_pid, new_pid) in &part_map {
            tx.execute(
                "UPDATE board_items SET entity_id = ?
                 WHERE board_id IN (SELECT id FROM boards WHERE project_id = ?)
                   AND entity_type = 'part' AND entity_id = ?",
                params![new_pid, new_project_id, old_pid],
            )?;
        }
    }

    // 6. Clone attachments
    {
        let mut stmt = tx.prepare(
            "SELECT part_id, name, addon_type, file_path, file_size, mime_type, notes
             FROM project_attachments WHERE project_id = ?",
        )?;
        let atts = stmt
            .query_map([id], |row| {
                Ok((
                    row.get::<_, Option<i64>>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<i64>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, Option<String>>(6)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        for (old_pid, name, atype, fpath, fsize, mime, notes) in atts {
            let new_pid = old_pid.and_then(|p| part_map.get(&p).copied());
            tx.execute(
                "INSERT INTO project_attachments (project_id, part_id, name, addon_type, file_path, file_size, mime_type, notes, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
                params![new_project_id, new_pid, name, atype, fpath, fsize, mime, notes],
            )?;
        }
    }

    tx.commit()?;

    let _ = sync_project_json(&conn, new_project_id, &state.data_dir);
    let cloned = fetch_project_summary(&conn, new_project_id)?;
    Ok((StatusCode::CREATED, Json(cloned)))
}

// POST /api/projects/:id/merge
pub async fn merge_projects(
    State(state): State<AppState>,
    Path(path_id): Path<i64>,
    Json(dto): Json<MergeProjectDto>,
) -> Result<impl IntoResponse, AppError> {
    let (source_id, target_id) = if let Some(tgt) = dto.target_project_id {
        (path_id, tgt)
    } else if let Some(src) = dto.source_project_id {
        (src, path_id)
    } else {
        return Err(AppError::BadRequest(
            "Either target_project_id or source_project_id must be specified".into(),
        ));
    };

    if target_id == source_id {
        return Err(AppError::BadRequest(
            "Cannot merge project into itself".into(),
        ));
    }

    let mut conn = state.pool.get()?;
    let _target = fetch_project_summary(&conn, target_id)?;
    let source = fetch_project_summary(&conn, source_id)?;

    let keep_source = dto.keep_source.unwrap_or(true);
    let copy_media = dto.copy_media.unwrap_or(true);

    let src_folder = project_folder(&state.data_dir, source_id);
    let dst_folder = ensure_project_storage(&state.data_dir, target_id)?;

    // Copy files
    if copy_media && src_folder.exists() {
        for sub in &["audio", "documents", "images", "videos", "exports"] {
            let src_sub = src_folder.join(sub);
            let dst_sub = dst_folder.join(sub);
            if src_sub.exists() {
                for entry in walkdir::WalkDir::new(&src_sub).min_depth(1) {
                    if let Ok(ent) = entry {
                        if ent.file_type().is_file() {
                            if let Ok(rel) = ent.path().strip_prefix(&src_sub) {
                                let target_file = dst_sub.join(rel);
                                if let Some(p) = target_file.parent() {
                                    let _ = std::fs::create_dir_all(p);
                                }
                                let _ = std::fs::copy(ent.path(), target_file);
                            }
                        }
                    }
                }
            }
        }
    }

    let tx = conn.transaction()?;

    if keep_source {
        // Copy entities into target project (deep duplicate)
        // Characters
        let mut char_map = HashMap::new();
        {
            let mut stmt = tx.prepare(
                "SELECT id, name, description, traits, image_path, notes FROM characters WHERE project_id = ?",
            )?;
            let chars = stmt
                .query_map([source_id], |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, Option<String>>(2)?,
                        row.get::<_, Option<String>>(3)?,
                        row.get::<_, Option<String>>(4)?,
                        row.get::<_, Option<String>>(5)?,
                    ))
                })?
                .collect::<Result<Vec<_>, _>>()?;

            for (old_id, name, desc, traits, img, notes) in chars {
                // Check name collision
                let exists: i64 = tx
                    .query_row(
                        "SELECT COUNT(*) FROM characters WHERE project_id = ? AND LOWER(name) = LOWER(?)",
                        params![target_id, name],
                        |r| r.get(0),
                    )
                    .unwrap_or(0);
                let final_name = if exists > 0 {
                    format!("{} ({})", name, source.name)
                } else {
                    name
                };

                tx.execute(
                    "INSERT INTO characters (project_id, name, description, traits, image_path, notes, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
                    params![target_id, final_name, desc, traits, img, notes],
                )?;
                let new_cid = tx.last_insert_rowid();
                char_map.insert(old_id, new_cid);
                let tags = get_tags_for_entity(&tx, "character", old_id).unwrap_or_default();
                for t in tags {
                    let _ = attach_tag_internal(&tx, "character", new_cid, &t);
                }
            }
        }

        // Prompts
        let mut prompt_map = HashMap::new();
        {
            let mut stmt = tx.prepare(
                "SELECT id, title, body, system_prompt, parameters, model_used, category, notes, is_favorite, character_id
                 FROM prompts WHERE project_id = ?",
            )?;
            let prompts = stmt
                .query_map([source_id], |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, Option<String>>(3)?,
                        row.get::<_, Option<String>>(4)?,
                        row.get::<_, Option<String>>(5)?,
                        row.get::<_, Option<String>>(6)?,
                        row.get::<_, Option<String>>(7)?,
                        row.get::<_, i64>(8)?,
                        row.get::<_, Option<i64>>(9)?,
                    ))
                })?
                .collect::<Result<Vec<_>, _>>()?;

            for (old_id, title, body, sys, params_val, model, cat, notes, is_fav, old_cid) in
                prompts
            {
                let exists: i64 = tx
                    .query_row(
                        "SELECT COUNT(*) FROM prompts WHERE project_id = ? AND LOWER(title) = LOWER(?)",
                        params![target_id, title],
                        |r| r.get(0),
                    )
                    .unwrap_or(0);
                let final_title = if exists > 0 {
                    format!("{} ({})", title, source.name)
                } else {
                    title
                };
                let new_cid = old_cid.and_then(|c| char_map.get(&c).copied());

                tx.execute(
                    "INSERT INTO prompts (project_id, title, body, system_prompt, parameters, model_used, category, notes, is_favorite, character_id, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
                    params![target_id, final_title, body, sys, params_val, model, cat, notes, is_fav, new_cid],
                )?;
                let new_pid = tx.last_insert_rowid();
                prompt_map.insert(old_id, new_pid);
                let tags = get_tags_for_entity(&tx, "prompt", old_id).unwrap_or_default();
                for t in tags {
                    let _ = attach_tag_internal(&tx, "prompt", new_pid, &t);
                }
            }
        }

        // Links
        let mut link_map = HashMap::new();
        {
            let mut stmt = tx.prepare(
                "SELECT id, url, platform, title, description, thumbnail_url FROM links WHERE project_id = ?",
            )?;
            let links = stmt
                .query_map([source_id], |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, Option<String>>(2)?,
                        row.get::<_, Option<String>>(3)?,
                        row.get::<_, Option<String>>(4)?,
                        row.get::<_, Option<String>>(5)?,
                    ))
                })?
                .collect::<Result<Vec<_>, _>>()?;

            for (old_id, url, plat, title, desc, thumb) in links {
                tx.execute(
                    "INSERT INTO links (project_id, url, platform, title, description, thumbnail_url, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
                    params![target_id, url, plat, title, desc, thumb],
                )?;
                let new_lid = tx.last_insert_rowid();
                link_map.insert(old_id, new_lid);
                let tags = get_tags_for_entity(&tx, "link", old_id).unwrap_or_default();
                for t in tags {
                    let _ = attach_tag_internal(&tx, "link", new_lid, &t);
                }
            }
        }

        // Boards & Items
        let mut board_map = HashMap::new();
        {
            let mut stmt = tx.prepare(
                "SELECT id, name, theme, canvas_style, pan_x, pan_y, zoom, drawing_data FROM boards WHERE project_id = ?",
            )?;
            let boards = stmt
                .query_map([source_id], |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, f64>(4)?,
                        row.get::<_, f64>(5)?,
                        row.get::<_, f64>(6)?,
                        row.get::<_, String>(7)?,
                    ))
                })?
                .collect::<Result<Vec<_>, _>>()?;

            for (old_bid, name, theme, style, px, py, zm, drawing) in boards {
                let exists: i64 = tx
                    .query_row(
                        "SELECT COUNT(*) FROM boards WHERE project_id = ? AND LOWER(name) = LOWER(?)",
                        params![target_id, name],
                        |r| r.get(0),
                    )
                    .unwrap_or(0);
                let final_name = if exists > 0 {
                    format!("{} ({})", name, source.name)
                } else {
                    name
                };

                tx.execute(
                    "INSERT INTO boards (project_id, name, theme, canvas_style, pan_x, pan_y, zoom, drawing_data, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
                    params![target_id, final_name, theme, style, px, py, zm, drawing],
                )?;
                let new_bid = tx.last_insert_rowid();
                board_map.insert(old_bid, new_bid);

                let mut item_stmt = tx.prepare(
                    "SELECT entity_type, entity_id, note_text, pos_x, pos_y, width, height, z_index, color
                     FROM board_items WHERE board_id = ?",
                )?;
                let items = item_stmt
                    .query_map([old_bid], |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, Option<i64>>(1)?,
                            row.get::<_, Option<String>>(2)?,
                            row.get::<_, f64>(3)?,
                            row.get::<_, f64>(4)?,
                            row.get::<_, f64>(5)?,
                            row.get::<_, f64>(6)?,
                            row.get::<_, i64>(7)?,
                            row.get::<_, Option<String>>(8)?,
                        ))
                    })?
                    .collect::<Result<Vec<_>, _>>()?;

                for (etype, old_eid, ntext, x, y, w, h, z, col) in items {
                    let new_eid = match etype.as_str() {
                        "character" => old_eid.and_then(|e| char_map.get(&e).copied()),
                        "prompt" => old_eid.and_then(|e| prompt_map.get(&e).copied()),
                        "link" => old_eid.and_then(|e| link_map.get(&e).copied()),
                        _ => old_eid,
                    };
                    tx.execute(
                        "INSERT INTO board_items (board_id, entity_type, entity_id, note_text, pos_x, pos_y, width, height, z_index, color, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
                        params![new_bid, etype, new_eid, ntext, x, y, w, h, z, col],
                    )?;
                }
            }
        }

        // Parts
        let mut part_map = HashMap::new();
        {
            let max_order: i64 = tx
                .query_row(
                    "SELECT COALESCE(MAX(order_index) + 1, 0) FROM project_parts WHERE project_id = ?",
                    [target_id],
                    |r| r.get(0),
                )
                .unwrap_or(0);

            let mut stmt = tx.prepare(
                "SELECT id, title, part_type, status, order_index, description, notes, board_id, completed_at
                 FROM project_parts WHERE project_id = ? ORDER BY order_index ASC, id ASC",
            )?;
            let parts = stmt
                .query_map([source_id], |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, i64>(4)?,
                        row.get::<_, Option<String>>(5)?,
                        row.get::<_, Option<String>>(6)?,
                        row.get::<_, Option<i64>>(7)?,
                        row.get::<_, Option<String>>(8)?,
                    ))
                })?
                .collect::<Result<Vec<_>, _>>()?;

            for (old_part_id, title, ptype, status, ord, desc, notes, old_bid, comp) in parts {
                let new_bid = old_bid.and_then(|b| board_map.get(&b).copied());
                tx.execute(
                    "INSERT INTO project_parts (project_id, title, part_type, status, order_index, description, notes, board_id, completed_at, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
                    params![target_id, title, ptype, status, max_order + ord, desc, notes, new_bid, comp],
                )?;
                let new_part_id = tx.last_insert_rowid();
                part_map.insert(old_part_id, new_part_id);

                let mut ent_stmt = tx.prepare(
                    "SELECT entity_type, entity_id FROM part_entities WHERE part_id = ?",
                )?;
                let ents = ent_stmt
                    .query_map([old_part_id], |row| {
                        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
                    })?
                    .collect::<Result<Vec<_>, _>>()?;

                for (etype, old_eid) in ents {
                    let mapped_eid = match etype.as_str() {
                        "character" => char_map.get(&old_eid).copied(),
                        "prompt" => prompt_map.get(&old_eid).copied(),
                        "link" => link_map.get(&old_eid).copied(),
                        _ => None,
                    };
                    if let Some(neid) = mapped_eid {
                        tx.execute(
                            "INSERT OR IGNORE INTO part_entities (part_id, entity_type, entity_id) VALUES (?, ?, ?)",
                            params![new_part_id, etype, neid],
                        )?;
                    }
                }
            }

            // Remap board items referencing parts
            for (old_pid, new_pid) in &part_map {
                tx.execute(
                    "UPDATE board_items SET entity_id = ?
                     WHERE board_id IN (SELECT id FROM boards WHERE project_id = ?)
                       AND entity_type = 'part' AND entity_id = ?",
                    params![new_pid, target_id, old_pid],
                )?;
            }
        }
    } else {
        // Move source entities to target project
        // Suffix colliding characters
        {
            let mut stmt = tx.prepare(
                "SELECT id, name FROM characters WHERE project_id = ?",
            )?;
            let chars = stmt
                .query_map([source_id], |row| {
                    Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
                })?
                .collect::<Result<Vec<_>, _>>()?;
            for (cid, name) in chars {
                let exists: i64 = tx
                    .query_row(
                        "SELECT COUNT(*) FROM characters WHERE project_id = ? AND LOWER(name) = LOWER(?)",
                        params![target_id, name],
                        |r| r.get(0),
                    )
                    .unwrap_or(0);
                if exists > 0 {
                    let new_name = format!("{} ({})", name, source.name);
                    tx.execute(
                        "UPDATE characters SET name = ? WHERE id = ?",
                        params![new_name, cid],
                    )?;
                }
            }
        }

        // Suffix colliding prompts
        {
            let mut stmt = tx.prepare(
                "SELECT id, title FROM prompts WHERE project_id = ?",
            )?;
            let prompts = stmt
                .query_map([source_id], |row| {
                    Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
                })?
                .collect::<Result<Vec<_>, _>>()?;
            for (pid, title) in prompts {
                let exists: i64 = tx
                    .query_row(
                        "SELECT COUNT(*) FROM prompts WHERE project_id = ? AND LOWER(title) = LOWER(?)",
                        params![target_id, title],
                        |r| r.get(0),
                    )
                    .unwrap_or(0);
                if exists > 0 {
                    let new_title = format!("{} ({})", title, source.name);
                    tx.execute(
                        "UPDATE prompts SET title = ? WHERE id = ?",
                        params![new_title, pid],
                    )?;
                }
            }
        }

        // Suffix colliding boards
        {
            let mut stmt = tx.prepare(
                "SELECT id, name FROM boards WHERE project_id = ?",
            )?;
            let boards = stmt
                .query_map([source_id], |row| {
                    Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
                })?
                .collect::<Result<Vec<_>, _>>()?;
            for (bid, name) in boards {
                let exists: i64 = tx
                    .query_row(
                        "SELECT COUNT(*) FROM boards WHERE project_id = ? AND LOWER(name) = LOWER(?)",
                        params![target_id, name],
                        |r| r.get(0),
                    )
                    .unwrap_or(0);
                if exists > 0 {
                    let new_name = format!("{} ({})", name, source.name);
                    tx.execute(
                        "UPDATE boards SET name = ? WHERE id = ?",
                        params![new_name, bid],
                    )?;
                }
            }
        }

        // Move all entities to target project
        tx.execute(
            "UPDATE characters SET project_id = ? WHERE project_id = ?",
            params![target_id, source_id],
        )?;
        tx.execute(
            "UPDATE prompts SET project_id = ? WHERE project_id = ?",
            params![target_id, source_id],
        )?;
        tx.execute(
            "UPDATE links SET project_id = ? WHERE project_id = ?",
            params![target_id, source_id],
        )?;
        tx.execute(
            "UPDATE boards SET project_id = ? WHERE project_id = ?",
            params![target_id, source_id],
        )?;

        let max_order: i64 = tx
            .query_row(
                "SELECT COALESCE(MAX(order_index) + 1, 0) FROM project_parts WHERE project_id = ?",
                [target_id],
                |r| r.get(0),
            )
            .unwrap_or(0);
        tx.execute(
            "UPDATE project_parts SET project_id = ?, order_index = order_index + ? WHERE project_id = ?",
            params![target_id, max_order, source_id],
        )?;

        tx.execute(
            "UPDATE project_attachments SET project_id = ? WHERE project_id = ?",
            params![target_id, source_id],
        )?;

        // Delete source project record
        tx.execute("DELETE FROM projects WHERE id = ?", [source_id])?;

        // Delete source filesystem folder
        let _ = std::fs::remove_dir_all(&src_folder);
    }

    tx.execute(
        "UPDATE projects SET updated_at = datetime('now') WHERE id = ?",
        [target_id],
    )?;

    tx.commit()?;

    let _ = sync_project_json(&conn, target_id, &state.data_dir);
    if keep_source {
        let _ = sync_project_json(&conn, source_id, &state.data_dir);
    }

    let updated_target = fetch_project_summary(&conn, target_id)?;
    Ok(Json(updated_target))
}

// POST /api/projects/transfer
pub async fn transfer_items(
    State(state): State<AppState>,
    Json(dto): Json<TransferProjectDto>,
) -> Result<impl IntoResponse, AppError> {
    if dto.source_project_id == dto.target_project_id {
        return Err(AppError::BadRequest(
            "Source and target projects must be different".into(),
        ));
    }
    if dto.action != "move" && dto.action != "copy" {
        return Err(AppError::BadRequest(
            "Action must be either 'move' or 'copy'".into(),
        ));
    }

    let mut conn = state.pool.get()?;
    let _source = fetch_project_summary(&conn, dto.source_project_id)?;
    let _target = fetch_project_summary(&conn, dto.target_project_id)?;

    let is_move = dto.action == "move";
    let tx = conn.transaction()?;
    let mut transferred_count = 0;

    for item in dto.items {
        match item.entity_type.as_str() {
            "prompt" => {
                if is_move {
                    let rows = tx.execute(
                        "UPDATE prompts SET project_id = ?, updated_at = datetime('now') WHERE id = ? AND project_id = ?",
                        params![dto.target_project_id, item.entity_id, dto.source_project_id],
                    )?;
                    if rows > 0 {
                        transferred_count += 1;
                    }
                } else {
                    let mut stmt = tx.prepare(
                        "SELECT title, body, system_prompt, parameters, model_used, category, notes, is_favorite, character_id
                         FROM prompts WHERE id = ? AND project_id = ?",
                    )?;
                    let prompt = stmt.query_row([item.entity_id, dto.source_project_id], |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, Option<String>>(2)?,
                            row.get::<_, Option<String>>(3)?,
                            row.get::<_, Option<String>>(4)?,
                            row.get::<_, Option<String>>(5)?,
                            row.get::<_, Option<String>>(6)?,
                            row.get::<_, i64>(7)?,
                            row.get::<_, Option<i64>>(8)?,
                        ))
                    });
                    if let Ok((t, b, sys, params_val, m, cat, notes, is_fav, _cid)) = prompt {
                        tx.execute(
                            "INSERT INTO prompts (project_id, title, body, system_prompt, parameters, model_used, category, notes, is_favorite, character_id, created_at, updated_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, datetime('now'), datetime('now'))",
                            params![dto.target_project_id, t, b, sys, params_val, m, cat, notes, is_fav],
                        )?;
                        let new_id = tx.last_insert_rowid();
                        let tags =
                            get_tags_for_entity(&tx, "prompt", item.entity_id).unwrap_or_default();
                        for tag in tags {
                            let _ = attach_tag_internal(&tx, "prompt", new_id, &tag);
                        }
                        transferred_count += 1;
                    }
                }
            }
            "character" => {
                if is_move {
                    let rows = tx.execute(
                        "UPDATE characters SET project_id = ?, updated_at = datetime('now') WHERE id = ? AND project_id = ?",
                        params![dto.target_project_id, item.entity_id, dto.source_project_id],
                    )?;
                    if rows > 0 {
                        transferred_count += 1;
                    }
                } else {
                    let mut stmt = tx.prepare(
                        "SELECT name, description, traits, image_path, notes FROM characters WHERE id = ? AND project_id = ?",
                    )?;
                    let ch = stmt.query_row([item.entity_id, dto.source_project_id], |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, Option<String>>(1)?,
                            row.get::<_, Option<String>>(2)?,
                            row.get::<_, Option<String>>(3)?,
                            row.get::<_, Option<String>>(4)?,
                        ))
                    });
                    if let Ok((n, d, tr, img, nt)) = ch {
                        tx.execute(
                            "INSERT INTO characters (project_id, name, description, traits, image_path, notes, created_at, updated_at)
                             VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
                            params![dto.target_project_id, n, d, tr, img, nt],
                        )?;
                        let new_id = tx.last_insert_rowid();
                        let tags = get_tags_for_entity(&tx, "character", item.entity_id)
                            .unwrap_or_default();
                        for tag in tags {
                            let _ = attach_tag_internal(&tx, "character", new_id, &tag);
                        }
                        transferred_count += 1;
                    }
                }
            }
            "link" => {
                if is_move {
                    let rows = tx.execute(
                        "UPDATE links SET project_id = ?, updated_at = datetime('now') WHERE id = ? AND project_id = ?",
                        params![dto.target_project_id, item.entity_id, dto.source_project_id],
                    )?;
                    if rows > 0 {
                        transferred_count += 1;
                    }
                } else {
                    let mut stmt = tx.prepare(
                        "SELECT url, platform, title, description, thumbnail_url FROM links WHERE id = ? AND project_id = ?",
                    )?;
                    let lk = stmt.query_row([item.entity_id, dto.source_project_id], |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, Option<String>>(1)?,
                            row.get::<_, Option<String>>(2)?,
                            row.get::<_, Option<String>>(3)?,
                            row.get::<_, Option<String>>(4)?,
                        ))
                    });
                    if let Ok((u, pl, t, d, th)) = lk {
                        tx.execute(
                            "INSERT INTO links (project_id, url, platform, title, description, thumbnail_url, created_at, updated_at)
                             VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
                            params![dto.target_project_id, u, pl, t, d, th],
                        )?;
                        let new_id = tx.last_insert_rowid();
                        let tags =
                            get_tags_for_entity(&tx, "link", item.entity_id).unwrap_or_default();
                        for tag in tags {
                            let _ = attach_tag_internal(&tx, "link", new_id, &tag);
                        }
                        transferred_count += 1;
                    }
                }
            }
            "board" => {
                if is_move {
                    let rows = tx.execute(
                        "UPDATE boards SET project_id = ?, updated_at = datetime('now') WHERE id = ? AND project_id = ?",
                        params![dto.target_project_id, item.entity_id, dto.source_project_id],
                    )?;
                    if rows > 0 {
                        transferred_count += 1;
                    }
                } else {
                    let mut stmt = tx.prepare(
                        "SELECT name, theme, canvas_style, pan_x, pan_y, zoom, drawing_data FROM boards WHERE id = ? AND project_id = ?",
                    )?;
                    let bd = stmt.query_row([item.entity_id, dto.source_project_id], |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, f64>(3)?,
                            row.get::<_, f64>(4)?,
                            row.get::<_, f64>(5)?,
                            row.get::<_, String>(6)?,
                        ))
                    });
                    if let Ok((n, th, cs, px, py, zm, dr)) = bd {
                        tx.execute(
                            "INSERT INTO boards (project_id, name, theme, canvas_style, pan_x, pan_y, zoom, drawing_data, created_at, updated_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
                            params![dto.target_project_id, n, th, cs, px, py, zm, dr],
                        )?;
                        let new_bid = tx.last_insert_rowid();

                        let mut istmt = tx.prepare(
                            "SELECT entity_type, entity_id, note_text, pos_x, pos_y, width, height, z_index, color
                             FROM board_items WHERE board_id = ?",
                        )?;
                        let items = istmt
                            .query_map([item.entity_id], |row| {
                                Ok((
                                    row.get::<_, String>(0)?,
                                    row.get::<_, Option<i64>>(1)?,
                                    row.get::<_, Option<String>>(2)?,
                                    row.get::<_, f64>(3)?,
                                    row.get::<_, f64>(4)?,
                                    row.get::<_, f64>(5)?,
                                    row.get::<_, f64>(6)?,
                                    row.get::<_, i64>(7)?,
                                    row.get::<_, Option<String>>(8)?,
                                ))
                            })?
                            .collect::<Result<Vec<_>, _>>()?;
                        for (et, eid, nt, x, y, w, h, z, col) in items {
                            tx.execute(
                                "INSERT INTO board_items (board_id, entity_type, entity_id, note_text, pos_x, pos_y, width, height, z_index, color, created_at)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
                                params![new_bid, et, eid, nt, x, y, w, h, z, col],
                            )?;
                        }
                        transferred_count += 1;
                    }
                }
            }
            "part" => {
                if is_move {
                    let rows = tx.execute(
                        "UPDATE project_parts SET project_id = ?, updated_at = datetime('now') WHERE id = ? AND project_id = ?",
                        params![dto.target_project_id, item.entity_id, dto.source_project_id],
                    )?;
                    if rows > 0 {
                        transferred_count += 1;
                    }
                } else {
                    let mut stmt = tx.prepare(
                        "SELECT title, part_type, status, order_index, description, notes, board_id, completed_at
                         FROM project_parts WHERE id = ? AND project_id = ?",
                    )?;
                    let pt = stmt.query_row([item.entity_id, dto.source_project_id], |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, i64>(3)?,
                            row.get::<_, Option<String>>(4)?,
                            row.get::<_, Option<String>>(5)?,
                            row.get::<_, Option<i64>>(6)?,
                            row.get::<_, Option<String>>(7)?,
                        ))
                    });
                    if let Ok((t, pt, s, ord, desc, nt, _bid, comp)) = pt {
                        tx.execute(
                            "INSERT INTO project_parts (project_id, title, part_type, status, order_index, description, notes, board_id, completed_at, created_at, updated_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, datetime('now'), datetime('now'))",
                            params![dto.target_project_id, t, pt, s, ord, desc, nt, comp],
                        )?;
                        transferred_count += 1;
                    }
                }
            }
            _ => {}
        }
    }

    tx.execute(
        "UPDATE projects SET updated_at = datetime('now') WHERE id IN (?, ?)",
        params![dto.source_project_id, dto.target_project_id],
    )?;

    tx.commit()?;

    let _ = sync_project_json(&conn, dto.source_project_id, &state.data_dir);
    let _ = sync_project_json(&conn, dto.target_project_id, &state.data_dir);

    Ok(Json(json!({
        "transferred": transferred_count,
        "transferred_count": transferred_count,
        "action": dto.action,
        "source_project_id": dto.source_project_id,
        "target_project_id": dto.target_project_id
    })))
}

// POST /api/projects/:id/reload-json
pub async fn reload_project_json(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    let manifest_path = project_folder(&state.data_dir, id).join("project.json");
    if !manifest_path.exists() {
        return Err(AppError::NotFound(format!(
            "project.json for project {} does not exist on disk",
            id
        )));
    }

    let content = std::fs::read_to_string(&manifest_path)?;
    let manifest: ProjectManifest = serde_json::from_str(&content)
        .map_err(|e| AppError::BadRequest(format!("Failed to parse project.json: {}", e)))?;

    let mut conn = state.pool.get()?;
    let tx = conn.transaction()?;

    // 1. Update project row
    tx.execute(
        "INSERT INTO projects (id, name, description, status, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            description = excluded.description,
            status = excluded.status,
            color = excluded.color,
            updated_at = datetime('now')",
        params![
            id,
            manifest.project.name,
            manifest.project.description,
            manifest.project.status,
            manifest.project.color,
            manifest.project.created_at
        ],
    )?;

    // 2. Clear old entities for this project
    tx.execute(
        "DELETE FROM project_attachments WHERE project_id = ?",
        [id],
    )?;
    tx.execute("DELETE FROM project_parts WHERE project_id = ?", [id])?;
    tx.execute("DELETE FROM prompts WHERE project_id = ?", [id])?;
    tx.execute("DELETE FROM characters WHERE project_id = ?", [id])?;
    tx.execute("DELETE FROM links WHERE project_id = ?", [id])?;
    tx.execute("DELETE FROM boards WHERE project_id = ?", [id])?;

    // 3. Re-insert characters
    let mut char_id_map: HashMap<i64, i64> = HashMap::new();
    for c in &manifest.characters {
        if c.id > 0 {
            tx.execute(
                "INSERT INTO characters (id, project_id, name, description, traits, image_path, notes, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
                params![c.id, id, c.name, c.description, c.traits, c.image_path, c.notes, c.created_at],
            )?;
            char_id_map.insert(c.id, c.id);
        } else {
            tx.execute(
                "INSERT INTO characters (project_id, name, description, traits, image_path, notes, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
                params![id, c.name, c.description, c.traits, c.image_path, c.notes],
            )?;
            let new_cid = tx.last_insert_rowid();
            char_id_map.insert(c.id, new_cid);
        }
        let assigned_id = *char_id_map.get(&c.id).unwrap_or(&c.id);
        for tag in &c.tags {
            let _ = attach_tag_internal(&tx, "character", assigned_id, tag);
        }
    }

    // 4. Re-insert prompts
    for p in &manifest.prompts {
        let assigned_cid = p.character_id.and_then(|cid| char_id_map.get(&cid).copied().or(Some(cid)));
        let new_pid = if p.id > 0 {
            tx.execute(
                "INSERT INTO prompts (id, project_id, title, body, system_prompt, parameters, model_used, category, notes, is_favorite, character_id, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
                params![
                    p.id,
                    id,
                    p.title,
                    p.body,
                    p.system_prompt,
                    p.parameters,
                    p.model_used,
                    p.category,
                    p.notes,
                    if p.is_favorite { 1 } else { 0 },
                    assigned_cid,
                    p.created_at
                ],
            )?;
            p.id
        } else {
            tx.execute(
                "INSERT INTO prompts (project_id, title, body, system_prompt, parameters, model_used, category, notes, is_favorite, character_id, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
                params![
                    id,
                    p.title,
                    p.body,
                    p.system_prompt,
                    p.parameters,
                    p.model_used,
                    p.category,
                    p.notes,
                    if p.is_favorite { 1 } else { 0 },
                    assigned_cid
                ],
            )?;
            tx.last_insert_rowid()
        };
        for tag in &p.tags {
            let _ = attach_tag_internal(&tx, "prompt", new_pid, tag);
        }
    }

    // 5. Re-insert links
    for l in &manifest.links {
        let new_lid = if l.id > 0 {
            tx.execute(
                "INSERT INTO links (id, project_id, url, platform, title, description, thumbnail_url, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
                params![l.id, id, l.url, l.platform, l.title, l.description, l.thumbnail_url, l.created_at],
            )?;
            l.id
        } else {
            tx.execute(
                "INSERT INTO links (project_id, url, platform, title, description, thumbnail_url, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
                params![id, l.url, l.platform, l.title, l.description, l.thumbnail_url],
            )?;
            tx.last_insert_rowid()
        };
        for tag in &l.tags {
            let _ = attach_tag_internal(&tx, "link", new_lid, tag);
        }
    }

    // 6. Re-insert boards & items
    for b in &manifest.boards {
        let dr_str = serde_json::to_string(&b.drawing_data).unwrap_or_else(|_| "[]".into());
        if b.id > 0 {
            tx.execute(
                "INSERT INTO boards (id, project_id, name, theme, canvas_style, pan_x, pan_y, zoom, drawing_data, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
                params![b.id, id, b.name, b.theme, b.canvas_style, b.pan_x, b.pan_y, b.zoom, dr_str, b.created_at],
            )?;
        } else {
            tx.execute(
                "INSERT INTO boards (project_id, name, theme, canvas_style, pan_x, pan_y, zoom, drawing_data, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
                params![id, b.name, b.theme, b.canvas_style, b.pan_x, b.pan_y, b.zoom, dr_str],
            )?;
        }
    }

    for item in &manifest.board_items {
        if item.id > 0 {
            tx.execute(
                "INSERT INTO board_items (id, board_id, entity_type, entity_id, note_text, pos_x, pos_y, width, height, z_index, color, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                params![
                    item.id,
                    item.board_id,
                    item.entity_type,
                    item.entity_id,
                    item.note_text,
                    item.pos_x,
                    item.pos_y,
                    item.width,
                    item.height,
                    item.z_index,
                    item.color,
                    item.created_at
                ],
            )?;
        } else {
            tx.execute(
                "INSERT INTO board_items (board_id, entity_type, entity_id, note_text, pos_x, pos_y, width, height, z_index, color, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
                params![
                    item.board_id,
                    item.entity_type,
                    item.entity_id,
                    item.note_text,
                    item.pos_x,
                    item.pos_y,
                    item.width,
                    item.height,
                    item.z_index,
                    item.color
                ],
            )?;
        }
    }

    // 7. Re-insert parts & part_entities
    for part in &manifest.parts {
        let new_part_id = if part.id > 0 {
            tx.execute(
                "INSERT INTO project_parts (id, project_id, title, part_type, status, order_index, description, notes, board_id, created_at, updated_at, completed_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)",
                params![
                    part.id,
                    id,
                    part.title,
                    part.part_type,
                    part.status,
                    part.order_index,
                    part.description,
                    part.notes,
                    part.board_id,
                    part.created_at,
                    part.completed_at
                ],
            )?;
            part.id
        } else {
            tx.execute(
                "INSERT INTO project_parts (project_id, title, part_type, status, order_index, description, notes, board_id, created_at, updated_at, completed_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)",
                params![
                    id,
                    part.title,
                    part.part_type,
                    part.status,
                    part.order_index,
                    part.description,
                    part.notes,
                    part.board_id,
                    part.completed_at
                ],
            )?;
            tx.last_insert_rowid()
        };

        for cid in &part.linked_character_ids {
            let actual_cid = char_id_map.get(cid).copied().unwrap_or(*cid);
            let _ = tx.execute(
                "INSERT OR IGNORE INTO part_entities (part_id, entity_type, entity_id) VALUES (?, 'character', ?)",
                params![new_part_id, actual_cid],
            );
        }
        for pid in &part.linked_prompt_ids {
            let _ = tx.execute(
                "INSERT OR IGNORE INTO part_entities (part_id, entity_type, entity_id) VALUES (?, 'prompt', ?)",
                params![new_part_id, pid],
            );
        }
        for lid in &part.linked_link_ids {
            let _ = tx.execute(
                "INSERT OR IGNORE INTO part_entities (part_id, entity_type, entity_id) VALUES (?, 'link', ?)",
                params![new_part_id, lid],
            );
        }
    }

    // 8. Re-insert attachments
    for att in &manifest.attachments {
        tx.execute(
            "INSERT INTO project_attachments (id, project_id, part_id, name, addon_type, file_path, file_size, mime_type, notes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
            params![
                att.id,
                id,
                att.part_id,
                att.name,
                att.addon_type,
                att.file_path,
                att.file_size,
                att.mime_type,
                att.notes,
                att.created_at
            ],
        )?;
    }

    tx.commit()?;

    let updated = fetch_project_summary(&conn, id)?;
    Ok(Json(updated))
}

// GET /api/projects/:id/export
pub async fn export_project_package(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<Response, AppError> {
    let conn = state.pool.get()?;
    let project = fetch_project_summary(&conn, id)?;
    let _ = sync_project_json(&conn, id, &state.data_dir);

    let proj_dir = project_folder(&state.data_dir, id);
    if !proj_dir.exists() {
        return Err(AppError::NotFound(format!("Project folder {} not found", id)));
    }

    let mut buffer = Cursor::new(Vec::new());
    {
        let mut zip = zip::ZipWriter::new(&mut buffer);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        for entry in walkdir::WalkDir::new(&proj_dir) {
            let entry = entry.map_err(|e| AppError::Internal(e.to_string()))?;
            let path = entry.path();
            let relative = path
                .strip_prefix(&proj_dir)
                .map_err(|e| AppError::Internal(e.to_string()))?;

            let rel_str = relative.to_string_lossy().replace('\\', "/");
            if rel_str.is_empty() {
                continue;
            }

            if entry.file_type().is_dir() {
                zip.add_directory(&rel_str, options)
                    .map_err(|e| AppError::Internal(e.to_string()))?;
            } else if entry.file_type().is_file() {
                zip.start_file(&rel_str, options)
                    .map_err(|e| AppError::Internal(e.to_string()))?;
                let mut f = File::open(path)?;
                let mut content = Vec::new();
                f.read_to_end(&mut content)?;
                zip.write_all(&content)
                    .map_err(|e| AppError::Internal(e.to_string()))?;
            }
        }
        zip.finish()
            .map_err(|e| AppError::Internal(format!("Failed to finalize zip: {}", e)))?;
    }

    let zip_bytes = buffer.into_inner();
    let sanitized_name: String = project
        .name
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect();

    let filename = format!("project-{}-{}.zip", id, sanitized_name);

    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/zip"),
    );
    headers.insert(
        header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&format!("attachment; filename=\"{}\"", filename))
            .unwrap_or_else(|_| HeaderValue::from_static("attachment")),
    );

    Ok((headers, Body::from(zip_bytes)).into_response())
}

// POST /api/projects/import
pub async fn import_project_package(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<impl IntoResponse, AppError> {
    let mut file_bytes: Option<Vec<u8>> = None;
    let mut file_name: Option<String> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        if field.name() == Some("file") {
            file_name = field.file_name().map(|s| s.to_string());
            let data = field
                .bytes()
                .await
                .map_err(|e| AppError::BadRequest(e.to_string()))?;
            file_bytes = Some(data.to_vec());
            break;
        }
    }

    let bytes = file_bytes.ok_or_else(|| AppError::BadRequest("No file uploaded".into()))?;
    let name_str = file_name.unwrap_or_else(|| "import.zip".into());

    let mut conn = state.pool.get()?;

    if name_str.ends_with(".json") {
        let manifest: ProjectManifest = serde_json::from_slice(&bytes)
            .map_err(|e| AppError::BadRequest(format!("Invalid JSON manifest: {}", e)))?;

        // Create new project
        conn.execute(
            "INSERT INTO projects (name, description, status, color, created_at, updated_at)
             VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))",
            params![
                format!("{} (Imported)", manifest.project.name),
                manifest.project.description,
                manifest.project.status,
                manifest.project.color
            ],
        )?;
        let new_id = conn.last_insert_rowid();
        let _ = ensure_project_storage(&state.data_dir, new_id)?;

        // Reconcile entities
        let tx = conn.transaction()?;
        for c in manifest.characters {
            tx.execute(
                "INSERT INTO characters (project_id, name, description, traits, image_path, notes, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
                params![new_id, c.name, c.description, c.traits, c.image_path, c.notes],
            )?;
        }
        for p in manifest.prompts {
            tx.execute(
                "INSERT INTO prompts (project_id, title, body, system_prompt, parameters, model_used, category, notes, is_favorite, character_id, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, datetime('now'), datetime('now'))",
                params![new_id, p.title, p.body, p.system_prompt, p.parameters, p.model_used, p.category, p.notes, if p.is_favorite { 1 } else { 0 }],
            )?;
        }
        for l in manifest.links {
            tx.execute(
                "INSERT INTO links (project_id, url, platform, title, description, thumbnail_url, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
                params![new_id, l.url, l.platform, l.title, l.description, l.thumbnail_url],
            )?;
        }
        for part in manifest.parts {
            tx.execute(
                "INSERT INTO project_parts (project_id, title, part_type, status, order_index, description, notes, board_id, completed_at, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, datetime('now'), datetime('now'))",
                params![new_id, part.title, part.part_type, part.status, part.order_index, part.description, part.notes, part.completed_at],
            )?;
        }
        tx.commit()?;

        let _ = sync_project_json(&conn, new_id, &state.data_dir);
        let imported = fetch_project_summary(&conn, new_id)?;
        return Ok((StatusCode::CREATED, Json(imported)));
    }

    // Zip package import
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes))
        .map_err(|e| AppError::BadRequest(format!("Failed to open zip archive: {}", e)))?;

    let mut manifest_content = String::new();
    {
        let mut file = archive
            .by_name("project.json")
            .map_err(|_| AppError::BadRequest("Archive missing project.json".into()))?;
        file.read_to_string(&mut manifest_content)?;
    }

    let manifest: ProjectManifest = serde_json::from_str(&manifest_content)
        .map_err(|e| AppError::BadRequest(format!("Invalid project.json in archive: {}", e)))?;

    conn.execute(
        "INSERT INTO projects (name, description, status, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))",
        params![
            format!("{} (Imported)", manifest.project.name),
            manifest.project.description,
            manifest.project.status,
            manifest.project.color
        ],
    )?;
    let new_id = conn.last_insert_rowid();
    let dst_dir = ensure_project_storage(&state.data_dir, new_id)?;

    // Extract files from zip
    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| AppError::Internal(e.to_string()))?;

        // Protect against Zip Slip path traversal
        let enclosed = match file.enclosed_name() {
            Some(p) => p.to_owned(),
            None => {
                return Err(AppError::BadRequest(format!(
                    "Unsafe path in zip archive: {}",
                    file.name()
                )));
            }
        };

        if enclosed.to_string_lossy() == "project.json" || file.name().ends_with('/') {
            continue;
        }

        let outpath = dst_dir.join(&enclosed);
        if !outpath.starts_with(&dst_dir) {
            return Err(AppError::BadRequest(format!(
                "Path traversal detected in archive: {}",
                file.name()
            )));
        }

        if let Some(parent) = outpath.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let mut outfile = File::create(&outpath)?;
        std::io::copy(&mut file, &mut outfile)?;
    }

    // Reconcile entities into DB
    let tx = conn.transaction()?;
    for c in manifest.characters {
        tx.execute(
            "INSERT INTO characters (project_id, name, description, traits, image_path, notes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
            params![new_id, c.name, c.description, c.traits, c.image_path, c.notes],
        )?;
    }
    for p in manifest.prompts {
        tx.execute(
            "INSERT INTO prompts (project_id, title, body, system_prompt, parameters, model_used, category, notes, is_favorite, character_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, datetime('now'), datetime('now'))",
            params![new_id, p.title, p.body, p.system_prompt, p.parameters, p.model_used, p.category, p.notes, if p.is_favorite { 1 } else { 0 }],
        )?;
    }
    for l in manifest.links {
        tx.execute(
            "INSERT INTO links (project_id, url, platform, title, description, thumbnail_url, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
            params![new_id, l.url, l.platform, l.title, l.description, l.thumbnail_url],
        )?;
    }
    for b in manifest.boards {
        let dr_str = serde_json::to_string(&b.drawing_data).unwrap_or_else(|_| "[]".into());
        tx.execute(
            "INSERT INTO boards (project_id, name, theme, canvas_style, pan_x, pan_y, zoom, drawing_data, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
            params![new_id, b.name, b.theme, b.canvas_style, b.pan_x, b.pan_y, b.zoom, dr_str],
        )?;
    }
    for part in manifest.parts {
        tx.execute(
            "INSERT INTO project_parts (project_id, title, part_type, status, order_index, description, notes, board_id, completed_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, datetime('now'), datetime('now'))",
            params![new_id, part.title, part.part_type, part.status, part.order_index, part.description, part.notes, part.completed_at],
        )?;
    }
    for att in manifest.attachments {
        tx.execute(
            "INSERT INTO project_attachments (project_id, part_id, name, addon_type, file_path, file_size, mime_type, notes, created_at, updated_at)
             VALUES (?, NULL, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
            params![new_id, att.name, att.addon_type, att.file_path, att.file_size, att.mime_type, att.notes],
        )?;
    }
    tx.commit()?;

    let _ = sync_project_json(&conn, new_id, &state.data_dir);
    let imported = fetch_project_summary(&conn, new_id)?;
    Ok((StatusCode::CREATED, Json(imported)))
}
