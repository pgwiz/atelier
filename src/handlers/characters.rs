use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use rusqlite::{params, Connection};
use serde::Deserialize;
use serde_json::json;

use crate::{
    handlers::{
        projects::sync_project_json,
        tags::{get_tags_for_entity, set_entity_tags},
    },
    main_types::{AppError, AppState},
    models::{Character, CreateCharacterDto, Prompt, UpdateCharacterDto},
};

#[derive(Debug, Deserialize)]
pub struct CharacterFilterParams {
    pub project_id: Option<i64>,
}

fn row_to_character(
    conn: &Connection,
    row: &rusqlite::Row,
    include_prompts: bool,
) -> Result<Character, rusqlite::Error> {
    let id: i64 = row.get(0)?;
    let name: String = row.get(1)?;
    let description: Option<String> = row.get(2)?;
    let traits: Option<String> = row.get(3)?;
    let image_path: Option<String> = row.get(4)?;
    let notes: Option<String> = row.get(5)?;
    let project_id: Option<i64> = row.get(6)?;
    let created_at: String = row.get(7)?;
    let updated_at: Option<String> = row.get(8)?;

    let tags = get_tags_for_entity(conn, "character", id).unwrap_or_default();

    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM prompts WHERE character_id = ?1",
            params![id],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let prompts = if include_prompts {
        let mut stmt = conn.prepare(
            "SELECT p.id, p.title, p.body, p.system_prompt, p.parameters, p.model_used,
                    p.category, p.notes, p.is_favorite, p.character_id, p.project_id,
                    p.created_at, p.updated_at
             FROM prompts p
             WHERE p.character_id = ?1
             ORDER BY p.id DESC",
        )?;

        let p_rows = stmt.query_map(params![id], |p_row| {
            let p_id: i64 = p_row.get(0)?;
            let p_title: String = p_row.get(1)?;
            let p_body: String = p_row.get(2)?;
            let p_system_prompt: Option<String> = p_row.get(3)?;
            let p_parameters: Option<String> = p_row.get(4)?;
            let p_model_used: Option<String> = p_row.get(5)?;
            let p_category: Option<String> = p_row.get(6)?;
            let p_notes: Option<String> = p_row.get(7)?;
            let p_fav: i64 = p_row.get(8)?;
            let p_char_id: Option<i64> = p_row.get(9)?;
            let p_proj_id: Option<i64> = p_row.get(10)?;
            let p_created_at: String = p_row.get(11)?;
            let p_updated_at: Option<String> = p_row.get(12)?;

            let p_tags = get_tags_for_entity(conn, "prompt", p_id).unwrap_or_default();

            Ok(Prompt {
                id: p_id,
                title: p_title,
                body: p_body,
                system_prompt: p_system_prompt,
                parameters: p_parameters,
                model_used: p_model_used,
                category: p_category,
                notes: p_notes,
                is_favorite: p_fav != 0,
                character_id: p_char_id,
                project_id: p_proj_id,
                created_at: p_created_at,
                updated_at: p_updated_at,
                tags: p_tags,
                character_name: Some(name.clone()),
            })
        })?;

        let mut list = Vec::new();
        for p in p_rows {
            list.push(p?);
        }
        Some(list)
    } else {
        None
    };

    Ok(Character {
        id,
        name,
        description,
        traits,
        image_path,
        notes,
        project_id,
        created_at,
        updated_at,
        tags,
        prompts_count: Some(count),
        prompts,
    })
}

// GET /api/characters
pub async fn list_characters(
    State(state): State<AppState>,
    Query(params): Query<CharacterFilterParams>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get().map_err(|e| AppError::Database(e.to_string()))?;

    let mut sql = String::from(
        "SELECT id, name, description, traits, image_path, notes, project_id, created_at, updated_at
         FROM characters WHERE 1=1",
    );

    let mut bind_params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(pid) = params.project_id {
        sql.push_str(" AND project_id = ?");
        bind_params.push(Box::new(pid));
    }

    sql.push_str(" ORDER BY name COLLATE NOCASE ASC");

    let mut stmt = conn.prepare(&sql).map_err(|e| AppError::Database(e.to_string()))?;

    let rusqlite_params: Vec<&dyn rusqlite::ToSql> = bind_params.iter().map(|p| p.as_ref()).collect();

    let rows = stmt
        .query_map(rusqlite_params.as_slice(), |row| {
            let id: i64 = row.get(0)?;
            let name: String = row.get(1)?;
            let description: Option<String> = row.get(2)?;
            let traits: Option<String> = row.get(3)?;
            let image_path: Option<String> = row.get(4)?;
            let notes: Option<String> = row.get(5)?;
            let project_id: Option<i64> = row.get(6)?;
            let created_at: String = row.get(7)?;
            let updated_at: Option<String> = row.get(8)?;
            Ok((id, name, description, traits, image_path, notes, project_id, created_at, updated_at))
        })
        .map_err(|e| AppError::Database(e.to_string()))?;

    let mut list = Vec::new();
    for row in rows {
        let (id, name, description, traits, image_path, notes, project_id, created_at, updated_at) =
            row.map_err(|e| AppError::Database(e.to_string()))?;

        let tags = get_tags_for_entity(&conn, "character", id).unwrap_or_default();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM prompts WHERE character_id = ?1",
                params![id],
                |r| r.get(0),
            )
            .unwrap_or(0);

        list.push(Character {
            id,
            name,
            description,
            traits,
            image_path,
            notes,
            project_id,
            created_at,
            updated_at,
            tags,
            prompts_count: Some(count),
            prompts: None,
        });
    }

    Ok(Json(list))
}

// POST /api/characters
pub async fn create_character(
    State(state): State<AppState>,
    Json(dto): Json<CreateCharacterDto>,
) -> Result<impl IntoResponse, AppError> {
    if dto.name.trim().is_empty() {
        return Err(AppError::BadRequest("Character name cannot be empty".into()));
    }

    let project_id = dto.project_id.unwrap_or(1);

    let mut conn = state.pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    let tx = conn.transaction().map_err(|e| AppError::Database(e.to_string()))?;

    tx.execute(
        "INSERT INTO characters (project_id, name, description, traits, image_path, notes, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'), datetime('now'))",
        params![
            project_id,
            dto.name.trim(),
            dto.description,
            dto.traits,
            dto.image_path,
            dto.notes,
        ],
    ).map_err(|e| AppError::Database(e.to_string()))?;

    let char_id = tx.last_insert_rowid();

    if let Some(tags) = dto.tags {
        set_entity_tags(&tx, "character", char_id, &tags)
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    tx.commit().map_err(|e| AppError::Database(e.to_string()))?;

    let _ = sync_project_json(&conn, project_id, &state.data_dir);
    let character = get_character_by_id(&conn, char_id, true)?;
    Ok((StatusCode::CREATED, Json(character)))
}

// GET /api/characters/:id
pub async fn get_character(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    let character = get_character_by_id(&conn, id, true)?;
    Ok(Json(character))
}

// PUT /api/characters/:id
pub async fn update_character(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(dto): Json<UpdateCharacterDto>,
) -> Result<impl IntoResponse, AppError> {
    let mut conn = state.pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    let existing = get_character_by_id(&conn, id, false)?;
    let project_id = existing.project_id.unwrap_or(1);

    let tx = conn.transaction().map_err(|e| AppError::Database(e.to_string()))?;

    if let Some(name) = dto.name {
        if name.trim().is_empty() {
            return Err(AppError::BadRequest("Character name cannot be empty".into()));
        }
        tx.execute("UPDATE characters SET name = ?1, updated_at = datetime('now') WHERE id = ?2", params![name.trim(), id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    if dto.description.is_some() {
        tx.execute("UPDATE characters SET description = ?1, updated_at = datetime('now') WHERE id = ?2", params![dto.description, id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    if dto.traits.is_some() {
        tx.execute("UPDATE characters SET traits = ?1, updated_at = datetime('now') WHERE id = ?2", params![dto.traits, id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    if dto.image_path.is_some() {
        tx.execute("UPDATE characters SET image_path = ?1, updated_at = datetime('now') WHERE id = ?2", params![dto.image_path, id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    if dto.notes.is_some() {
        tx.execute("UPDATE characters SET notes = ?1, updated_at = datetime('now') WHERE id = ?2", params![dto.notes, id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    if let Some(new_pid) = dto.project_id {
        tx.execute("UPDATE characters SET project_id = ?1, updated_at = datetime('now') WHERE id = ?2", params![new_pid, id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    if let Some(tags) = dto.tags {
        set_entity_tags(&tx, "character", id, &tags)
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    tx.commit().map_err(|e| AppError::Database(e.to_string()))?;

    let _ = sync_project_json(&conn, project_id, &state.data_dir);
    let character = get_character_by_id(&conn, id, true)?;
    Ok(Json(character))
}

// DELETE /api/characters/:id
pub async fn delete_character(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    let character = get_character_by_id(&conn, id, false)?;

    conn.execute("DELETE FROM characters WHERE id = ?1", params![id])
        .map_err(|e| AppError::Database(e.to_string()))?;

    conn.execute(
        "DELETE FROM taggables WHERE entity_type = 'character' AND entity_id = ?1",
        params![id],
    )
    .ok();

    conn.execute(
        "DELETE FROM board_items WHERE entity_type = 'character' AND entity_id = ?1",
        params![id],
    )
    .ok();

    if let Some(pid) = character.project_id {
        let _ = sync_project_json(&conn, pid, &state.data_dir);
    }

    Ok(Json(json!({
        "status": "success",
        "id": id
    })))
}

pub fn get_character_by_id(conn: &Connection, id: i64, include_prompts: bool) -> Result<Character, AppError> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, description, traits, image_path, notes, project_id, created_at, updated_at
             FROM characters
             WHERE id = ?1",
        )
        .map_err(|e| AppError::Database(e.to_string()))?;

    let character = stmt
        .query_row(params![id], |row| row_to_character(conn, row, include_prompts))
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("Character {} not found", id)),
            other => AppError::Database(other.to_string()),
        })?;

    Ok(character)
}
