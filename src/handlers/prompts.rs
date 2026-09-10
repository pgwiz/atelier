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
    models::{CreatePromptDto, Prompt, UpdatePromptDto},
};

#[derive(Debug, Deserialize)]
pub struct PromptFilterParams {
    pub character_id: Option<i64>,
    pub category: Option<String>,
    pub favorite: Option<bool>,
    pub tag: Option<String>,
    pub q: Option<String>,
    pub project_id: Option<i64>,
}

fn row_to_prompt(conn: &Connection, row: &rusqlite::Row) -> Result<Prompt, rusqlite::Error> {
    let id: i64 = row.get(0)?;
    let title: String = row.get(1)?;
    let body: String = row.get(2)?;
    let system_prompt: Option<String> = row.get(3)?;
    let parameters: Option<String> = row.get(4)?;
    let model_used: Option<String> = row.get(5)?;
    let category: Option<String> = row.get(6)?;
    let notes: Option<String> = row.get(7)?;
    let is_favorite_int: i64 = row.get(8)?;
    let character_id: Option<i64> = row.get(9)?;
    let project_id: Option<i64> = row.get(10)?;
    let created_at: String = row.get(11)?;
    let updated_at: Option<String> = row.get(12)?;
    let character_name: Option<String> = row.get(13)?;

    let tags = get_tags_for_entity(conn, "prompt", id).unwrap_or_default();

    Ok(Prompt {
        id,
        title,
        body,
        system_prompt,
        parameters,
        model_used,
        category,
        notes,
        is_favorite: is_favorite_int != 0,
        character_id,
        project_id,
        created_at,
        updated_at,
        tags,
        character_name,
    })
}

// GET /api/prompts
pub async fn list_prompts(
    State(state): State<AppState>,
    Query(params): Query<PromptFilterParams>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get().map_err(|e| AppError::Database(e.to_string()))?;

    let mut sql = String::from(
        "SELECT p.id, p.title, p.body, p.system_prompt, p.parameters, p.model_used,
                p.category, p.notes, p.is_favorite, p.character_id, p.project_id,
                p.created_at, p.updated_at,
                c.name as character_name
         FROM prompts p
         LEFT JOIN characters c ON p.character_id = c.id
         WHERE 1=1",
    );

    let mut bind_params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(proj_id) = params.project_id {
        sql.push_str(" AND p.project_id = ?");
        bind_params.push(Box::new(proj_id));
    }

    if let Some(cid) = params.character_id {
        sql.push_str(" AND p.character_id = ?");
        bind_params.push(Box::new(cid));
    }

    if let Some(cat) = params.category {
        if !cat.trim().is_empty() {
            sql.push_str(" AND LOWER(p.category) = LOWER(?)");
            bind_params.push(Box::new(cat));
        }
    }

    if let Some(fav) = params.favorite {
        sql.push_str(" AND p.is_favorite = ?");
        bind_params.push(Box::new(if fav { 1 } else { 0 }));
    }

    if let Some(ref q) = params.q {
        let pattern = format!("%{}%", q.trim());
        sql.push_str(" AND (p.title LIKE ? OR p.body LIKE ? OR p.notes LIKE ?)");
        bind_params.push(Box::new(pattern.clone()));
        bind_params.push(Box::new(pattern.clone()));
        bind_params.push(Box::new(pattern));
    }

    if let Some(ref tag) = params.tag {
        let normalized = tag.trim().to_lowercase();
        if !normalized.is_empty() {
            sql.push_str(
                " AND p.id IN (
                    SELECT tg.entity_id FROM taggables tg
                    JOIN tags t ON tg.tag_id = t.id
                    WHERE tg.entity_type = 'prompt' AND LOWER(t.name) = ?
                )",
            );
            bind_params.push(Box::new(normalized));
        }
    }

    sql.push_str(" ORDER BY p.id DESC");

    let mut stmt = conn.prepare(&sql).map_err(|e| AppError::Database(e.to_string()))?;

    let rusqlite_params: Vec<&dyn rusqlite::ToSql> = bind_params.iter().map(|p| p.as_ref()).collect();

    let prompt_iter = stmt
        .query_map(rusqlite_params.as_slice(), |row| {
            let id: i64 = row.get(0)?;
            let title: String = row.get(1)?;
            let body: String = row.get(2)?;
            let system_prompt: Option<String> = row.get(3)?;
            let parameters: Option<String> = row.get(4)?;
            let model_used: Option<String> = row.get(5)?;
            let category: Option<String> = row.get(6)?;
            let notes: Option<String> = row.get(7)?;
            let is_favorite_int: i64 = row.get(8)?;
            let character_id: Option<i64> = row.get(9)?;
            let project_id: Option<i64> = row.get(10)?;
            let created_at: String = row.get(11)?;
            let updated_at: Option<String> = row.get(12)?;
            let character_name: Option<String> = row.get(13)?;

            Ok((
                id,
                title,
                body,
                system_prompt,
                parameters,
                model_used,
                category,
                notes,
                is_favorite_int,
                character_id,
                project_id,
                created_at,
                updated_at,
                character_name,
            ))
        })
        .map_err(|e| AppError::Database(e.to_string()))?;

    let mut prompts = Vec::new();
    for item in prompt_iter {
        let (
            id,
            title,
            body,
            system_prompt,
            parameters,
            model_used,
            category,
            notes,
            is_favorite_int,
            character_id,
            project_id,
            created_at,
            updated_at,
            character_name,
        ) = item.map_err(|e| AppError::Database(e.to_string()))?;

        let tags = get_tags_for_entity(&conn, "prompt", id).unwrap_or_default();

        prompts.push(Prompt {
            id,
            title,
            body,
            system_prompt,
            parameters,
            model_used,
            category,
            notes,
            is_favorite: is_favorite_int != 0,
            character_id,
            project_id,
            created_at,
            updated_at,
            tags,
            character_name,
        });
    }

    Ok(Json(prompts))
}

// POST /api/prompts
pub async fn create_prompt(
    State(state): State<AppState>,
    Json(dto): Json<CreatePromptDto>,
) -> Result<impl IntoResponse, AppError> {
    if dto.title.trim().is_empty() {
        return Err(AppError::BadRequest("Title cannot be empty".into()));
    }
    if dto.body.trim().is_empty() {
        return Err(AppError::BadRequest("Prompt body cannot be empty".into()));
    }

    let params_json = match dto.parameters {
        Some(serde_json::Value::String(s)) => Some(s),
        Some(v) => Some(v.to_string()),
        None => None,
    };

    let is_fav = if dto.is_favorite.unwrap_or(false) { 1 } else { 0 };
    let project_id = dto.project_id.unwrap_or(1);

    let mut conn = state.pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    let tx = conn.transaction().map_err(|e| AppError::Database(e.to_string()))?;

    tx.execute(
        "INSERT INTO prompts (project_id, title, body, system_prompt, parameters, model_used, category, notes, is_favorite, character_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, datetime('now'), datetime('now'))",
        params![
            project_id,
            dto.title.trim(),
            dto.body,
            dto.system_prompt,
            params_json,
            dto.model_used,
            dto.category,
            dto.notes,
            is_fav,
            dto.character_id,
        ],
    ).map_err(|e| AppError::Database(e.to_string()))?;

    let prompt_id = tx.last_insert_rowid();

    if let Some(tags) = dto.tags {
        set_entity_tags(&tx, "prompt", prompt_id, &tags)
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    tx.commit().map_err(|e| AppError::Database(e.to_string()))?;

    let _ = sync_project_json(&conn, project_id, &state.data_dir);
    let prompt = get_prompt_by_id(&conn, prompt_id)?;
    Ok((StatusCode::CREATED, Json(prompt)))
}

// GET /api/prompts/:id
pub async fn get_prompt(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    let prompt = get_prompt_by_id(&conn, id)?;
    Ok(Json(prompt))
}

// PUT /api/prompts/:id
pub async fn update_prompt(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(dto): Json<UpdatePromptDto>,
) -> Result<impl IntoResponse, AppError> {
    let mut conn = state.pool.get().map_err(|e| AppError::Database(e.to_string()))?;

    // Check existence
    let existing = get_prompt_by_id(&conn, id)?;
    let project_id = existing.project_id.unwrap_or(1);

    let tx = conn.transaction().map_err(|e| AppError::Database(e.to_string()))?;

    if let Some(title) = dto.title {
        if title.trim().is_empty() {
            return Err(AppError::BadRequest("Title cannot be empty".into()));
        }
        tx.execute("UPDATE prompts SET title = ?1, updated_at = datetime('now') WHERE id = ?2", params![title.trim(), id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    if let Some(body) = dto.body {
        if body.trim().is_empty() {
            return Err(AppError::BadRequest("Prompt body cannot be empty".into()));
        }
        tx.execute("UPDATE prompts SET body = ?1, updated_at = datetime('now') WHERE id = ?2", params![body, id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    if dto.system_prompt.is_some() {
        tx.execute("UPDATE prompts SET system_prompt = ?1, updated_at = datetime('now') WHERE id = ?2", params![dto.system_prompt, id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    if let Some(params_val) = dto.parameters {
        let json_str = match params_val {
            serde_json::Value::String(s) => s,
            other => other.to_string(),
        };
        tx.execute("UPDATE prompts SET parameters = ?1, updated_at = datetime('now') WHERE id = ?2", params![json_str, id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    if dto.model_used.is_some() {
        tx.execute("UPDATE prompts SET model_used = ?1, updated_at = datetime('now') WHERE id = ?2", params![dto.model_used, id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    if dto.category.is_some() {
        tx.execute("UPDATE prompts SET category = ?1, updated_at = datetime('now') WHERE id = ?2", params![dto.category, id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    if dto.notes.is_some() {
        tx.execute("UPDATE prompts SET notes = ?1, updated_at = datetime('now') WHERE id = ?2", params![dto.notes, id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    if let Some(fav) = dto.is_favorite {
        let fav_int = if fav { 1 } else { 0 };
        tx.execute("UPDATE prompts SET is_favorite = ?1, updated_at = datetime('now') WHERE id = ?2", params![fav_int, id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    if dto.character_id.is_some() {
        tx.execute("UPDATE prompts SET character_id = ?1, updated_at = datetime('now') WHERE id = ?2", params![dto.character_id, id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    if let Some(new_pid) = dto.project_id {
        tx.execute("UPDATE prompts SET project_id = ?1, updated_at = datetime('now') WHERE id = ?2", params![new_pid, id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    if let Some(tags) = dto.tags {
        set_entity_tags(&tx, "prompt", id, &tags)
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    tx.commit().map_err(|e| AppError::Database(e.to_string()))?;

    let _ = sync_project_json(&conn, project_id, &state.data_dir);
    let updated = get_prompt_by_id(&conn, id)?;
    Ok(Json(updated))
}

// POST /api/prompts/:id/favorite
pub async fn toggle_favorite(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    let prompt = get_prompt_by_id(&conn, id)?;

    let new_fav = if prompt.is_favorite { 0 } else { 1 };
    conn.execute(
        "UPDATE prompts SET is_favorite = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![new_fav, id],
    )
    .map_err(|e| AppError::Database(e.to_string()))?;

    if let Some(pid) = prompt.project_id {
        let _ = sync_project_json(&conn, pid, &state.data_dir);
    }

    let updated = get_prompt_by_id(&conn, id)?;
    Ok(Json(updated))
}

// DELETE /api/prompts/:id
pub async fn delete_prompt(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    let prompt = get_prompt_by_id(&conn, id)?;

    conn.execute("DELETE FROM prompts WHERE id = ?1", params![id])
        .map_err(|e| AppError::Database(e.to_string()))?;

    // Also remove tag associations and board items referencing this prompt
    conn.execute(
        "DELETE FROM taggables WHERE entity_type = 'prompt' AND entity_id = ?1",
        params![id],
    )
    .ok();

    conn.execute(
        "DELETE FROM board_items WHERE entity_type = 'prompt' AND entity_id = ?1",
        params![id],
    )
    .ok();

    if let Some(pid) = prompt.project_id {
        let _ = sync_project_json(&conn, pid, &state.data_dir);
    }

    Ok(Json(json!({
        "status": "success",
        "id": id
    })))
}

pub fn get_prompt_by_id(conn: &Connection, id: i64) -> Result<Prompt, AppError> {
    let mut stmt = conn
        .prepare(
            "SELECT p.id, p.title, p.body, p.system_prompt, p.parameters, p.model_used,
                    p.category, p.notes, p.is_favorite, p.character_id, p.project_id,
                    p.created_at, p.updated_at,
                    c.name as character_name
             FROM prompts p
             LEFT JOIN characters c ON p.character_id = c.id
             WHERE p.id = ?1",
        )
        .map_err(|e| AppError::Database(e.to_string()))?;

    let prompt = stmt
        .query_row(params![id], |row| row_to_prompt(conn, row))
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("Prompt {} not found", id)),
            other => AppError::Database(other.to_string()),
        })?;

    Ok(prompt)
}
