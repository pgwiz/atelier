use axum::{
    extract::{Query, State},
    response::IntoResponse,
    Json,
};
use rusqlite::Connection;
use serde::Deserialize;

use crate::{
    handlers::{safe_truncate, tags::get_tags_for_entity},
    main_types::{AppError, AppState},
    models::SearchResult,
};

#[derive(Debug, Deserialize)]
pub struct SearchQueryParams {
    pub q: Option<String>,
    pub tag: Option<String>,
    #[serde(rename = "type")]
    pub entity_type: Option<String>,
    pub favorite: Option<bool>,
    pub project_id: Option<i64>,
}

pub fn search_entities(
    conn: &Connection,
    params: &SearchQueryParams,
) -> Result<Vec<SearchResult>, rusqlite::Error> {
    let mut results: Vec<SearchResult> = Vec::new();

    let target_type = params
        .entity_type
        .as_deref()
        .map(|s| s.trim().to_lowercase())
        .unwrap_or_else(|| "all".into());

    let include_prompts = target_type == "all" || target_type == "prompt" || target_type == "prompts";
    let include_characters = (target_type == "all" || target_type == "character" || target_type == "characters") && params.favorite != Some(true);
    let include_links = (target_type == "all" || target_type == "link" || target_type == "links") && params.favorite != Some(true);

    let q_trimmed = params.q.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty());
    let tag_trimmed = params.tag.as_deref().map(|s| s.trim().to_lowercase()).filter(|s| !s.is_empty());

    // 1. Prompts
    if include_prompts {
        let mut sql = String::from(
            "SELECT p.id, p.title, p.body, p.notes, p.is_favorite, p.created_at
             FROM prompts p
             WHERE 1=1",
        );
        let mut bind_params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(pid) = params.project_id {
            sql.push_str(" AND p.project_id = ?");
            bind_params.push(Box::new(pid));
        }

        if let Some(fav) = params.favorite {
            sql.push_str(" AND p.is_favorite = ?");
            bind_params.push(Box::new(if fav { 1 } else { 0 }));
        }

        if let Some(q) = q_trimmed {
            let pattern = format!("%{}%", q);
            sql.push_str(" AND (p.title LIKE ? OR p.body LIKE ? OR p.notes LIKE ?)");
            bind_params.push(Box::new(pattern.clone()));
            bind_params.push(Box::new(pattern.clone()));
            bind_params.push(Box::new(pattern));
        }

        if let Some(ref t) = tag_trimmed {
            sql.push_str(
                " AND p.id IN (
                    SELECT tg.entity_id FROM taggables tg
                    JOIN tags t ON tg.tag_id = t.id
                    WHERE tg.entity_type = 'prompt' AND LOWER(t.name) = ?
                )",
            );
            bind_params.push(Box::new(t.clone()));
        }

        sql.push_str(" ORDER BY p.id DESC");

        let mut stmt = conn.prepare(&sql)?;
        let rusqlite_params: Vec<&dyn rusqlite::ToSql> = bind_params.iter().map(|b| b.as_ref()).collect();

        let rows = stmt.query_map(rusqlite_params.as_slice(), |row| {
            let id: i64 = row.get(0)?;
            let title: String = row.get(1)?;
            let body: String = row.get(2)?;
            let notes: Option<String> = row.get(3)?;
            let is_fav: i64 = row.get(4)?;
            let created_at: String = row.get(5)?;
            Ok((id, title, body, notes, is_fav != 0, created_at))
        })?;

        for r in rows {
            let (id, title, body, _notes, is_fav, created_at) = r?;
            let tags = get_tags_for_entity(conn, "prompt", id).unwrap_or_default();
            let snippet = safe_truncate(&body, 140);

            results.push(SearchResult {
                entity_type: "prompt".into(),
                id,
                title,
                snippet,
                image_path: None,
                tags,
                created_at,
                is_favorite: Some(is_fav),
            });
        }
    }

    // 2. Characters
    if include_characters {
        let mut sql = String::from(
            "SELECT c.id, c.name, c.description, c.traits, c.image_path, c.created_at
             FROM characters c
             WHERE 1=1",
        );
        let mut bind_params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(pid) = params.project_id {
            sql.push_str(" AND c.project_id = ?");
            bind_params.push(Box::new(pid));
        }

        if let Some(q) = q_trimmed {
            let pattern = format!("%{}%", q);
            sql.push_str(" AND (c.name LIKE ? OR c.description LIKE ? OR c.traits LIKE ? OR c.notes LIKE ?)");
            bind_params.push(Box::new(pattern.clone()));
            bind_params.push(Box::new(pattern.clone()));
            bind_params.push(Box::new(pattern.clone()));
            bind_params.push(Box::new(pattern));
        }

        if let Some(ref t) = tag_trimmed {
            sql.push_str(
                " AND c.id IN (
                    SELECT tg.entity_id FROM taggables tg
                    JOIN tags t ON tg.tag_id = t.id
                    WHERE tg.entity_type = 'character' AND LOWER(t.name) = ?
                )",
            );
            bind_params.push(Box::new(t.clone()));
        }

        sql.push_str(" ORDER BY c.id DESC");

        let mut stmt = conn.prepare(&sql)?;
        let rusqlite_params: Vec<&dyn rusqlite::ToSql> = bind_params.iter().map(|b| b.as_ref()).collect();

        let rows = stmt.query_map(rusqlite_params.as_slice(), |row| {
            let id: i64 = row.get(0)?;
            let name: String = row.get(1)?;
            let desc: Option<String> = row.get(2)?;
            let traits: Option<String> = row.get(3)?;
            let image_path: Option<String> = row.get(4)?;
            let created_at: String = row.get(5)?;
            Ok((id, name, desc, traits, image_path, created_at))
        })?;

        for r in rows {
            let (id, name, desc, traits, image_path, created_at) = r?;
            let tags = get_tags_for_entity(conn, "character", id).unwrap_or_default();
            let snippet = desc
                .or(traits)
                .unwrap_or_else(|| "No description".into());
            let snippet_trimmed = safe_truncate(&snippet, 140);

            results.push(SearchResult {
                entity_type: "character".into(),
                id,
                title: name,
                snippet: snippet_trimmed,
                image_path,
                tags,
                created_at,
                is_favorite: None,
            });
        }
    }

    // 3. Links
    if include_links {
        let mut sql = String::from(
            "SELECT l.id, l.title, l.url, l.description, l.thumbnail_url, l.created_at
             FROM links l
             WHERE 1=1",
        );
        let mut bind_params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(pid) = params.project_id {
            sql.push_str(" AND l.project_id = ?");
            bind_params.push(Box::new(pid));
        }

        if let Some(q) = q_trimmed {
            let pattern = format!("%{}%", q);
            sql.push_str(" AND (l.title LIKE ? OR l.url LIKE ? OR l.description LIKE ?)");
            bind_params.push(Box::new(pattern.clone()));
            bind_params.push(Box::new(pattern.clone()));
            bind_params.push(Box::new(pattern));
        }

        if let Some(ref t) = tag_trimmed {
            sql.push_str(
                " AND l.id IN (
                    SELECT tg.entity_id FROM taggables tg
                    JOIN tags t ON tg.tag_id = t.id
                    WHERE tg.entity_type = 'link' AND LOWER(t.name) = ?
                )",
            );
            bind_params.push(Box::new(t.clone()));
        }

        sql.push_str(" ORDER BY l.id DESC");

        let mut stmt = conn.prepare(&sql)?;
        let rusqlite_params: Vec<&dyn rusqlite::ToSql> = bind_params.iter().map(|b| b.as_ref()).collect();

        let rows = stmt.query_map(rusqlite_params.as_slice(), |row| {
            let id: i64 = row.get(0)?;
            let title: Option<String> = row.get(1)?;
            let url: String = row.get(2)?;
            let desc: Option<String> = row.get(3)?;
            let thumbnail_url: Option<String> = row.get(4)?;
            let created_at: String = row.get(5)?;
            Ok((id, title, url, desc, thumbnail_url, created_at))
        })?;

        for r in rows {
            let (id, title_opt, url, desc, thumbnail_url, created_at) = r?;
            let tags = get_tags_for_entity(conn, "link", id).unwrap_or_default();
            let title = title_opt.filter(|t| !t.trim().is_empty()).unwrap_or_else(|| url.clone());
            let snippet = desc.unwrap_or(url);
            let snippet_trimmed = safe_truncate(&snippet, 140);

            results.push(SearchResult {
                entity_type: "link".into(),
                id,
                title,
                snippet: snippet_trimmed,
                image_path: thumbnail_url,
                tags,
                created_at,
                is_favorite: None,
            });
        }
    }

    Ok(results)
}

// GET /api/search
pub async fn search_handler(
    State(state): State<AppState>,
    Query(params): Query<SearchQueryParams>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    let results = search_entities(&conn, &params).map_err(|e| AppError::Database(e.to_string()))?;
    Ok(Json(results))
}
