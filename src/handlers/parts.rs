use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use rusqlite::{params, Connection};
use serde_json::json;

use crate::{
    handlers::{
        characters::get_character_by_id,
        projects::sync_project_json,
        prompts::get_prompt_by_id,
    },
    main_types::{AppError, AppState},
    models::{
        AttachPartEntityDto, Character, CreatePartDto, Link, ProjectPart, Prompt,
        ReorderPartsDto, UpdatePartDto, UpdatePartStatusDto,
    },
};

fn fetch_part_with_entities(conn: &Connection, id: i64) -> Result<ProjectPart, AppError> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, title, part_type, status, order_index, description, notes, board_id,
                created_at, updated_at, completed_at
         FROM project_parts WHERE id = ?",
    )?;
    let mut rows = stmt.query([id])?;
    let r = rows
        .next()?
        .ok_or_else(|| AppError::NotFound(format!("Part {} not found", id)))?;

    let part_id: i64 = r.get(0)?;
    let project_id: i64 = r.get(1)?;
    let title: String = r.get(2)?;
    let part_type: String = r.get(3)?;
    let status: String = r.get(4)?;
    let order_index: i64 = r.get(5)?;
    let description: Option<String> = r.get(6)?;
    let notes: Option<String> = r.get(7)?;
    let board_id: Option<i64> = r.get(8)?;
    let created_at: String = r.get(9)?;
    let updated_at: String = r.get(10)?;
    let completed_at: Option<String> = r.get(11)?;

    let mut linked_character_ids = Vec::new();
    let mut linked_prompt_ids = Vec::new();
    let mut linked_link_ids = Vec::new();

    let mut ent_stmt = conn.prepare(
        "SELECT entity_type, entity_id FROM part_entities WHERE part_id = ? ORDER BY entity_id ASC",
    )?;
    let mut ent_rows = ent_stmt.query([part_id])?;
    while let Some(erow) = ent_rows.next()? {
        let etype: String = erow.get(0)?;
        let eid: i64 = erow.get(1)?;
        match etype.as_str() {
            "character" => linked_character_ids.push(eid),
            "prompt" => linked_prompt_ids.push(eid),
            "link" => linked_link_ids.push(eid),
            _ => {}
        }
    }

    let mut linked_characters: Vec<Character> = Vec::new();
    for &cid in &linked_character_ids {
        if let Ok(c) = get_character_by_id(conn, cid, false) {
            linked_characters.push(c);
        }
    }

    let mut linked_prompts: Vec<Prompt> = Vec::new();
    for &pid in &linked_prompt_ids {
        if let Ok(p) = get_prompt_by_id(conn, pid) {
            linked_prompts.push(p);
        }
    }

    let mut linked_links: Vec<Link> = Vec::new();
    for &lid in &linked_link_ids {
        let mut lstmt = conn.prepare(
            "SELECT id, url, platform, title, description, thumbnail_url, project_id, created_at, updated_at
             FROM links WHERE id = ?",
        )?;
        if let Ok(link) = lstmt.query_row([lid], |row| {
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
        }) {
            linked_links.push(link);
        }
    }

    Ok(ProjectPart {
        id: part_id,
        project_id,
        title,
        part_type,
        status,
        order_index,
        description,
        notes,
        board_id,
        created_at,
        updated_at,
        completed_at,
        linked_character_ids,
        linked_prompt_ids,
        linked_link_ids,
        linked_characters,
        linked_prompts,
        linked_links,
    })
}

// GET /api/projects/:id/parts
pub async fn list_parts(
    State(state): State<AppState>,
    Path(project_id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id FROM project_parts WHERE project_id = ? ORDER BY order_index ASC, id ASC",
    )?;
    let ids = stmt
        .query_map([project_id], |r| r.get::<_, i64>(0))?
        .collect::<Result<Vec<_>, _>>()?;

    let mut parts = Vec::new();
    for id in ids {
        if let Ok(p) = fetch_part_with_entities(&conn, id) {
            parts.push(p);
        }
    }

    Ok(Json(parts))
}

// POST /api/projects/:id/parts
pub async fn create_part(
    State(state): State<AppState>,
    Path(project_id): Path<i64>,
    Json(dto): Json<CreatePartDto>,
) -> Result<impl IntoResponse, AppError> {
    let title = dto.title.trim();
    if title.is_empty() {
        return Err(AppError::BadRequest("Part title cannot be empty".into()));
    }

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

    let part_type = dto
        .part_type
        .unwrap_or_else(|| "Scene".into())
        .trim()
        .to_string();
    let status = dto
        .status
        .unwrap_or_else(|| "Draft".into())
        .trim()
        .to_string();
    let order_index = match dto.order_index {
        Some(idx) => idx,
        None => conn
            .query_row(
                "SELECT COALESCE(MAX(order_index) + 1, 0) FROM project_parts WHERE project_id = ?",
                [project_id],
                |r| r.get(0),
            )
            .unwrap_or(0),
    };
    let description = dto.description.map(|d| d.trim().to_string());
    let notes = dto.notes.map(|n| n.trim().to_string());
    let completed_at = if status == "Done" {
        Some(chrono::Utc::now().to_rfc3339())
    } else {
        None
    };

    conn.execute(
        "INSERT INTO project_parts (project_id, title, part_type, status, order_index, description, notes, board_id, completed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
        params![
            project_id,
            title,
            part_type,
            status,
            order_index,
            description,
            notes,
            dto.board_id,
            completed_at
        ],
    )?;

    let part_id = conn.last_insert_rowid();

    if let Some(cids) = dto.linked_character_ids {
        for cid in cids {
            let _ = conn.execute(
                "INSERT OR IGNORE INTO part_entities (part_id, entity_type, entity_id) VALUES (?, 'character', ?)",
                params![part_id, cid],
            );
        }
    }

    if let Some(pids) = dto.linked_prompt_ids {
        for pid in pids {
            let _ = conn.execute(
                "INSERT OR IGNORE INTO part_entities (part_id, entity_type, entity_id) VALUES (?, 'prompt', ?)",
                params![part_id, pid],
            );
        }
    }

    if let Some(lids) = dto.linked_link_ids {
        for lid in lids {
            let _ = conn.execute(
                "INSERT OR IGNORE INTO part_entities (part_id, entity_type, entity_id) VALUES (?, 'link', ?)",
                params![part_id, lid],
            );
        }
    }

    let _ = conn.execute(
        "UPDATE projects SET updated_at = datetime('now') WHERE id = ?",
        [project_id],
    );
    let _ = sync_project_json(&conn, project_id, &state.data_dir);

    let created = fetch_part_with_entities(&conn, part_id)?;
    Ok((StatusCode::CREATED, Json(created)))
}

// GET /api/parts/:id
pub async fn get_part(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get()?;
    let part = fetch_part_with_entities(&conn, id)?;
    Ok(Json(part))
}

// PUT /api/parts/:id
pub async fn update_part(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(dto): Json<UpdatePartDto>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get()?;
    let existing = fetch_part_with_entities(&conn, id)?;

    let new_title = match dto.title {
        Some(ref t) => {
            let tr = t.trim();
            if tr.is_empty() {
                return Err(AppError::BadRequest("Part title cannot be empty".into()));
            }
            tr.to_string()
        }
        None => existing.title,
    };

    let new_type = match dto.part_type {
        Some(ref pt) => {
            let tr = pt.trim();
            if tr.is_empty() {
                existing.part_type
            } else {
                tr.to_string()
            }
        }
        None => existing.part_type,
    };

    let existing_status = existing.status.clone();
    let new_status = match dto.status {
        Some(ref st) => {
            let tr = st.trim();
            if tr.is_empty() {
                existing_status.clone()
            } else {
                tr.to_string()
            }
        }
        None => existing_status.clone(),
    };

    let new_completed_at = if new_status == "Done" {
        if existing_status != "Done" || existing.completed_at.is_none() {
            Some(chrono::Utc::now().to_rfc3339())
        } else {
            existing.completed_at.clone()
        }
    } else {
        None
    };

    let new_order = dto.order_index.unwrap_or(existing.order_index);
    let new_desc = match dto.description {
        Some(d) => Some(d.trim().to_string()),
        None => existing.description,
    };
    let new_notes = match dto.notes {
        Some(n) => Some(n.trim().to_string()),
        None => existing.notes,
    };
    let new_board_id = match dto.board_id {
        Some(b) => Some(b),
        None => existing.board_id,
    };

    conn.execute(
        "UPDATE project_parts SET title = ?, part_type = ?, status = ?, order_index = ?, description = ?, notes = ?, board_id = ?, completed_at = ?, updated_at = datetime('now')
         WHERE id = ?",
        params![
            new_title,
            new_type,
            new_status,
            new_order,
            new_desc,
            new_notes,
            new_board_id,
            new_completed_at,
            id
        ],
    )?;

    if let Some(cids) = dto.linked_character_ids {
        conn.execute(
            "DELETE FROM part_entities WHERE part_id = ? AND entity_type = 'character'",
            [id],
        )?;
        for cid in cids {
            let _ = conn.execute(
                "INSERT OR IGNORE INTO part_entities (part_id, entity_type, entity_id) VALUES (?, 'character', ?)",
                params![id, cid],
            );
        }
    }

    if let Some(pids) = dto.linked_prompt_ids {
        conn.execute(
            "DELETE FROM part_entities WHERE part_id = ? AND entity_type = 'prompt'",
            [id],
        )?;
        for pid in pids {
            let _ = conn.execute(
                "INSERT OR IGNORE INTO part_entities (part_id, entity_type, entity_id) VALUES (?, 'prompt', ?)",
                params![id, pid],
            );
        }
    }

    if let Some(lids) = dto.linked_link_ids {
        conn.execute(
            "DELETE FROM part_entities WHERE part_id = ? AND entity_type = 'link'",
            [id],
        )?;
        for lid in lids {
            let _ = conn.execute(
                "INSERT OR IGNORE INTO part_entities (part_id, entity_type, entity_id) VALUES (?, 'link', ?)",
                params![id, lid],
            );
        }
    }

    let _ = conn.execute(
        "UPDATE projects SET updated_at = datetime('now') WHERE id = ?",
        [existing.project_id],
    );
    let _ = sync_project_json(&conn, existing.project_id, &state.data_dir);

    let updated = fetch_part_with_entities(&conn, id)?;
    Ok(Json(updated))
}

// PATCH /api/parts/:id/status
pub async fn patch_part_status(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(dto): Json<UpdatePartStatusDto>,
) -> Result<impl IntoResponse, AppError> {
    let status = dto.status.trim();
    if status.is_empty() {
        return Err(AppError::BadRequest("Status cannot be empty".into()));
    }

    let conn = state.pool.get()?;
    let existing = fetch_part_with_entities(&conn, id)?;

    let completed_at = if status == "Done" {
        Some(chrono::Utc::now().to_rfc3339())
    } else {
        None
    };

    conn.execute(
        "UPDATE project_parts SET status = ?, completed_at = ?, updated_at = datetime('now') WHERE id = ?",
        params![status, completed_at, id],
    )?;

    let _ = conn.execute(
        "UPDATE projects SET updated_at = datetime('now') WHERE id = ?",
        [existing.project_id],
    );
    let _ = sync_project_json(&conn, existing.project_id, &state.data_dir);

    let updated = fetch_part_with_entities(&conn, id)?;
    Ok(Json(updated))
}

// POST /api/projects/:id/parts/reorder
pub async fn reorder_parts(
    State(state): State<AppState>,
    Path(project_id): Path<i64>,
    Json(dto): Json<ReorderPartsDto>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get()?;
    for (idx, pid) in dto.part_ids.iter().enumerate() {
        conn.execute(
            "UPDATE project_parts SET order_index = ?, updated_at = datetime('now') WHERE id = ? AND project_id = ?",
            params![idx as i64, pid, project_id],
        )?;
    }

    let _ = conn.execute(
        "UPDATE projects SET updated_at = datetime('now') WHERE id = ?",
        [project_id],
    );
    let _ = sync_project_json(&conn, project_id, &state.data_dir);

    Ok(Json(json!({ "success": true })))
}

// DELETE /api/parts/:id
pub async fn delete_part(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get()?;
    let part = fetch_part_with_entities(&conn, id)?;

    conn.execute("DELETE FROM project_parts WHERE id = ?", [id])?;

    let _ = conn.execute(
        "UPDATE projects SET updated_at = datetime('now') WHERE id = ?",
        [part.project_id],
    );
    let _ = sync_project_json(&conn, part.project_id, &state.data_dir);

    Ok(Json(json!({ "success": true, "deleted_id": id })))
}

// POST /api/parts/:id/entities
pub async fn attach_part_entity(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(dto): Json<AttachPartEntityDto>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get()?;
    let part = fetch_part_with_entities(&conn, id)?;

    match dto.entity_type.as_str() {
        "character" | "prompt" | "link" => {
            conn.execute(
                "INSERT OR IGNORE INTO part_entities (part_id, entity_type, entity_id) VALUES (?, ?, ?)",
                params![id, dto.entity_type, dto.entity_id],
            )?;
            let _ = conn.execute(
                "UPDATE projects SET updated_at = datetime('now') WHERE id = ?",
                [part.project_id],
            );
            let _ = sync_project_json(&conn, part.project_id, &state.data_dir);
            let updated = fetch_part_with_entities(&conn, id)?;
            Ok(Json(updated))
        }
        _ => Err(AppError::BadRequest(format!(
            "Invalid entity type '{}'. Must be 'character', 'prompt', or 'link'",
            dto.entity_type
        ))),
    }
}

// DELETE /api/parts/:id/entities/:entity_type/:entity_id
pub async fn detach_part_entity(
    State(state): State<AppState>,
    Path((id, entity_type, entity_id)): Path<(i64, String, i64)>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get()?;
    let part = fetch_part_with_entities(&conn, id)?;

    conn.execute(
        "DELETE FROM part_entities WHERE part_id = ? AND entity_type = ? AND entity_id = ?",
        params![id, entity_type, entity_id],
    )?;

    let _ = conn.execute(
        "UPDATE projects SET updated_at = datetime('now') WHERE id = ?",
        [part.project_id],
    );
    let _ = sync_project_json(&conn, part.project_id, &state.data_dir);

    let updated = fetch_part_with_entities(&conn, id)?;
    Ok(Json(updated))
}
