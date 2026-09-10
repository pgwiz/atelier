use axum::{
    extract::{Path, State},
    response::IntoResponse,
    Json,
};
use rusqlite::{params, Connection};
use serde_json::json;

use crate::{
    main_types::{AppError, AppState},
    models::{AttachTagDto, TagWithCount},
};

pub fn get_tags_for_entity(
    conn: &Connection,
    entity_type: &str,
    entity_id: i64,
) -> Result<Vec<String>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT t.name
         FROM tags t
         JOIN taggables tg ON t.id = tg.tag_id
         WHERE tg.entity_type = ?1 AND tg.entity_id = ?2
         ORDER BY t.name ASC",
    )?;

    let rows = stmt.query_map(params![entity_type, entity_id], |row| row.get(0))?;
    let mut tags = Vec::new();
    for tag in rows {
        tags.push(tag?);
    }
    Ok(tags)
}

pub fn set_entity_tags(
    conn: &Connection,
    entity_type: &str,
    entity_id: i64,
    tags: &[String],
) -> Result<(), rusqlite::Error> {
    conn.execute(
        "DELETE FROM taggables WHERE entity_type = ?1 AND entity_id = ?2",
        params![entity_type, entity_id],
    )?;

    for tag in tags {
        let tag_name = tag.trim().to_lowercase();
        if tag_name.is_empty() {
            continue;
        }

        conn.execute(
            "INSERT INTO tags (name) VALUES (?1) ON CONFLICT(name) DO NOTHING",
            params![tag_name],
        )?;

        let tag_id: i64 = conn.query_row(
            "SELECT id FROM tags WHERE name = ?1",
            params![tag_name],
            |row| row.get(0),
        )?;

        conn.execute(
            "INSERT OR IGNORE INTO taggables (tag_id, entity_type, entity_id) VALUES (?1, ?2, ?3)",
            params![tag_id, entity_type, entity_id],
        )?;
    }

    Ok(())
}

pub fn attach_tag_internal(
    conn: &Connection,
    entity_type: &str,
    entity_id: i64,
    raw_tag: &str,
) -> Result<(), rusqlite::Error> {
    let tag_name = raw_tag.trim().to_lowercase();
    if tag_name.is_empty() {
        return Ok(());
    }

    conn.execute(
        "INSERT INTO tags (name) VALUES (?1) ON CONFLICT(name) DO NOTHING",
        params![tag_name],
    )?;

    let tag_id: i64 = conn.query_row(
        "SELECT id FROM tags WHERE name = ?1",
        params![tag_name],
        |row| row.get(0),
    )?;

    conn.execute(
        "INSERT OR IGNORE INTO taggables (tag_id, entity_type, entity_id) VALUES (?1, ?2, ?3)",
        params![tag_id, entity_type, entity_id],
    )?;

    Ok(())
}

pub fn detach_tag_internal(
    conn: &Connection,
    entity_type: &str,
    entity_id: i64,
    raw_tag: &str,
) -> Result<(), rusqlite::Error> {
    let tag_name = raw_tag.trim().to_lowercase();
    let tag_id_opt: Result<i64, rusqlite::Error> = conn.query_row(
        "SELECT id FROM tags WHERE name = ?1",
        params![tag_name],
        |row| row.get(0),
    );

    if let Ok(tag_id) = tag_id_opt {
        conn.execute(
            "DELETE FROM taggables WHERE tag_id = ?1 AND entity_type = ?2 AND entity_id = ?3",
            params![tag_id, entity_type, entity_id],
        )?;
    }

    Ok(())
}

// GET /api/tags
pub async fn list_tags(State(state): State<AppState>) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    let mut stmt = conn
        .prepare(
            "SELECT t.name, COUNT(tg.tag_id) as count
             FROM tags t
             LEFT JOIN taggables tg ON t.id = tg.tag_id
             GROUP BY t.id, t.name
             ORDER BY count DESC, t.name ASC",
        )
        .map_err(|e| AppError::Database(e.to_string()))?;

    let tag_rows = stmt
        .query_map([], |row| {
            Ok(TagWithCount {
                name: row.get(0)?,
                count: row.get(1)?,
            })
        })
        .map_err(|e| AppError::Database(e.to_string()))?;

    let mut tags = Vec::new();
    for tag in tag_rows {
        tags.push(tag.map_err(|e| AppError::Database(e.to_string()))?);
    }

    Ok(Json(tags))
}

// POST /api/:entity_type/:id/tags
pub async fn attach_tag(
    State(state): State<AppState>,
    Path((entity_type, id)): Path<(String, i64)>,
    Json(payload): Json<AttachTagDto>,
) -> Result<impl IntoResponse, AppError> {
    let tag_name = payload
        .get_name()
        .ok_or_else(|| AppError::BadRequest("Missing tag or name in payload".into()))?;

    let valid_types = ["prompt", "character", "link", "prompts", "characters", "links"];
    if !valid_types.contains(&entity_type.as_str()) {
        return Err(AppError::BadRequest("Invalid entity type".into()));
    }

    let singular_type = match entity_type.as_str() {
        "prompts" => "prompt",
        "characters" => "character",
        "links" => "link",
        other => other,
    };

    let conn = state.pool.get().map_err(|e| AppError::Database(e.to_string()))?;

    let entity_exists: bool = match singular_type {
        "prompt" => conn
            .query_row("SELECT EXISTS(SELECT 1 FROM prompts WHERE id = ?1)", params![id], |r| r.get(0))
            .unwrap_or(false),
        "character" => conn
            .query_row("SELECT EXISTS(SELECT 1 FROM characters WHERE id = ?1)", params![id], |r| r.get(0))
            .unwrap_or(false),
        "link" => conn
            .query_row("SELECT EXISTS(SELECT 1 FROM links WHERE id = ?1)", params![id], |r| r.get(0))
            .unwrap_or(false),
        _ => false,
    };

    if !entity_exists {
        return Err(AppError::NotFound(format!("{} {} not found", singular_type, id)));
    }

    attach_tag_internal(&conn, singular_type, id, tag_name)
        .map_err(|e| AppError::Database(e.to_string()))?;

    let current_tags = get_tags_for_entity(&conn, singular_type, id)
        .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(json!({
        "status": "success",
        "tags": current_tags
    })))
}

// DELETE /api/:entity_type/:id/tags/:tag_name
pub async fn detach_tag(
    State(state): State<AppState>,
    Path((entity_type, id, tag_name)): Path<(String, i64, String)>,
) -> Result<impl IntoResponse, AppError> {
    let valid_types = ["prompt", "character", "link", "prompts", "characters", "links"];
    if !valid_types.contains(&entity_type.as_str()) {
        return Err(AppError::BadRequest("Invalid entity type".into()));
    }

    let singular_type = match entity_type.as_str() {
        "prompts" => "prompt",
        "characters" => "character",
        "links" => "link",
        other => other,
    };

    let conn = state.pool.get().map_err(|e| AppError::Database(e.to_string()))?;

    let entity_exists: bool = match singular_type {
        "prompt" => conn
            .query_row("SELECT EXISTS(SELECT 1 FROM prompts WHERE id = ?1)", params![id], |r| r.get(0))
            .unwrap_or(false),
        "character" => conn
            .query_row("SELECT EXISTS(SELECT 1 FROM characters WHERE id = ?1)", params![id], |r| r.get(0))
            .unwrap_or(false),
        "link" => conn
            .query_row("SELECT EXISTS(SELECT 1 FROM links WHERE id = ?1)", params![id], |r| r.get(0))
            .unwrap_or(false),
        _ => false,
    };

    if !entity_exists {
        return Err(AppError::NotFound(format!("{} {} not found", singular_type, id)));
    }

    detach_tag_internal(&conn, singular_type, id, &tag_name)
        .map_err(|e| AppError::Database(e.to_string()))?;

    let current_tags = get_tags_for_entity(&conn, singular_type, id)
        .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(json!({
        "status": "success",
        "tags": current_tags
    })))
}
