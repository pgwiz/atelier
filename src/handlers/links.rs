use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use rusqlite::{params, Connection};
use serde::Deserialize;
use serde_json::json;

use crate::{
    handlers::tags::{get_tags_for_entity, set_entity_tags},
    main_types::{AppError, AppState},
    models::{CreateLinkDto, Link, UpdateLinkDto},
};

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct YouTubeOEmbedResponse {
    pub title: Option<String>,
    pub thumbnail_url: Option<String>,
    pub author_name: Option<String>,
}

fn detect_platform(url: &str) -> Option<String> {
    let lower = url.to_lowercase();
    if lower.contains("youtube.com") || lower.contains("youtu.be") {
        Some("youtube".into())
    } else if lower.contains("twitter.com") || lower.contains("x.com") {
        Some("twitter".into())
    } else if lower.contains("github.com") {
        Some("github".into())
    } else if lower.contains("reddit.com") {
        Some("reddit".into())
    } else if lower.contains("instagram.com") {
        Some("instagram".into())
    } else if lower.contains("artstation.com") {
        Some("artstation".into())
    } else if lower.contains("pinterest.com") {
        Some("pinterest".into())
    } else if lower.contains("tiktok.com") {
        Some("tiktok".into())
    } else if lower.contains("vimeo.com") {
        Some("vimeo".into())
    } else {
        None
    }
}

async fn fetch_youtube_oembed(
    client: &reqwest::Client,
    url: &str,
) -> Option<YouTubeOEmbedResponse> {
    let lower = url.to_lowercase();
    if !(lower.contains("youtube.com") || lower.contains("youtu.be")) {
        return None;
    }

    let oembed_url = format!(
        "https://www.youtube.com/oembed?url={}&format=json",
        urlencoding_simple(url)
    );

    match client.get(&oembed_url).send().await {
        Ok(resp) => {
            if resp.status().is_success() {
                resp.json::<YouTubeOEmbedResponse>().await.ok()
            } else {
                None
            }
        }
        Err(_) => None,
    }
}

fn urlencoding_simple(input: &str) -> String {
    let mut encoded = String::new();
    for byte in input.bytes() {
        match byte {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char);
            }
            _ => {
                encoded.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    encoded
}

// GET /api/links
pub async fn list_links(
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get().map_err(|e| AppError::Database(e.to_string()))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, url, platform, title, description, thumbnail_url, created_at
             FROM links
             ORDER BY id DESC",
        )
        .map_err(|e| AppError::Database(e.to_string()))?;

    let rows = stmt
        .query_map([], |row| {
            let id: i64 = row.get(0)?;
            let url: String = row.get(1)?;
            let platform: Option<String> = row.get(2)?;
            let title: Option<String> = row.get(3)?;
            let description: Option<String> = row.get(4)?;
            let thumbnail_url: Option<String> = row.get(5)?;
            let created_at: String = row.get(6)?;
            Ok((id, url, platform, title, description, thumbnail_url, created_at))
        })
        .map_err(|e| AppError::Database(e.to_string()))?;

    let mut links = Vec::new();
    for row in rows {
        let (id, url, platform, title, description, thumbnail_url, created_at) =
            row.map_err(|e| AppError::Database(e.to_string()))?;

        let tags = get_tags_for_entity(&conn, "link", id).unwrap_or_default();

        links.push(Link {
            id,
            url,
            platform,
            title,
            description,
            thumbnail_url,
            created_at,
            tags,
        });
    }

    Ok(Json(links))
}

// POST /api/links
pub async fn create_link(
    State(state): State<AppState>,
    Json(mut dto): Json<CreateLinkDto>,
) -> Result<impl IntoResponse, AppError> {
    let clean_url = dto.url.trim().to_string();
    if clean_url.is_empty() {
        return Err(AppError::BadRequest("Link URL cannot be empty".into()));
    }

    // Auto-detect platform if missing
    if dto.platform.as_deref().unwrap_or("").trim().is_empty() {
        dto.platform = detect_platform(&clean_url);
    }

    // Check if YouTube and missing title or thumbnail
    if dto.title.as_deref().unwrap_or("").trim().is_empty()
        || dto.thumbnail_url.as_deref().unwrap_or("").trim().is_empty()
    {
        if let Some(oembed) = fetch_youtube_oembed(&state.http_client, &clean_url).await {
            if dto.title.as_deref().unwrap_or("").trim().is_empty() {
                dto.title = oembed.title;
            }
            if dto.thumbnail_url.as_deref().unwrap_or("").trim().is_empty() {
                dto.thumbnail_url = oembed.thumbnail_url;
            }
            if dto.platform.is_none() {
                dto.platform = Some("youtube".into());
            }
        }
    }

    // Fallback title if still empty
    if dto.title.as_deref().unwrap_or("").trim().is_empty() {
        dto.title = Some(clean_url.clone());
    }

    let mut conn = state.pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    let tx = conn.transaction().map_err(|e| AppError::Database(e.to_string()))?;

    tx.execute(
        "INSERT INTO links (url, platform, title, description, thumbnail_url)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            clean_url,
            dto.platform,
            dto.title,
            dto.description,
            dto.thumbnail_url,
        ],
    ).map_err(|e| AppError::Database(e.to_string()))?;

    let link_id = tx.last_insert_rowid();

    if let Some(tags) = dto.tags {
        set_entity_tags(&tx, "link", link_id, &tags)
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    tx.commit().map_err(|e| AppError::Database(e.to_string()))?;

    let link = get_link_by_id(&conn, link_id)?;
    Ok((StatusCode::CREATED, Json(link)))
}

// GET /api/links/:id
pub async fn get_link(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    let link = get_link_by_id(&conn, id)?;
    Ok(Json(link))
}

// PUT /api/links/:id
pub async fn update_link(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(dto): Json<UpdateLinkDto>,
) -> Result<impl IntoResponse, AppError> {
    let mut conn = state.pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    let _existing = get_link_by_id(&conn, id)?;

    let tx = conn.transaction().map_err(|e| AppError::Database(e.to_string()))?;

    if let Some(url) = dto.url {
        if url.trim().is_empty() {
            return Err(AppError::BadRequest("Link URL cannot be empty".into()));
        }
        tx.execute("UPDATE links SET url = ?1 WHERE id = ?2", params![url.trim(), id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    if dto.platform.is_some() {
        tx.execute("UPDATE links SET platform = ?1 WHERE id = ?2", params![dto.platform, id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    if dto.title.is_some() {
        tx.execute("UPDATE links SET title = ?1 WHERE id = ?2", params![dto.title, id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    if dto.description.is_some() {
        tx.execute("UPDATE links SET description = ?1 WHERE id = ?2", params![dto.description, id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    if dto.thumbnail_url.is_some() {
        tx.execute("UPDATE links SET thumbnail_url = ?1 WHERE id = ?2", params![dto.thumbnail_url, id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    if let Some(tags) = dto.tags {
        set_entity_tags(&tx, "link", id, &tags)
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    tx.commit().map_err(|e| AppError::Database(e.to_string()))?;

    let link = get_link_by_id(&conn, id)?;
    Ok(Json(link))
}

// DELETE /api/links/:id
pub async fn delete_link(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    let _link = get_link_by_id(&conn, id)?;

    conn.execute("DELETE FROM links WHERE id = ?1", params![id])
        .map_err(|e| AppError::Database(e.to_string()))?;

    conn.execute(
        "DELETE FROM taggables WHERE entity_type = 'link' AND entity_id = ?1",
        params![id],
    )
    .ok();

    conn.execute(
        "DELETE FROM board_items WHERE entity_type = 'link' AND entity_id = ?1",
        params![id],
    )
    .ok();

    Ok(Json(json!({
        "status": "success",
        "id": id
    })))
}

pub fn get_link_by_id(conn: &Connection, id: i64) -> Result<Link, AppError> {
    let mut stmt = conn
        .prepare(
            "SELECT id, url, platform, title, description, thumbnail_url, created_at
             FROM links
             WHERE id = ?1",
        )
        .map_err(|e| AppError::Database(e.to_string()))?;

    let link = stmt
        .query_row(params![id], |row| {
            let id: i64 = row.get(0)?;
            let url: String = row.get(1)?;
            let platform: Option<String> = row.get(2)?;
            let title: Option<String> = row.get(3)?;
            let description: Option<String> = row.get(4)?;
            let thumbnail_url: Option<String> = row.get(5)?;
            let created_at: String = row.get(6)?;

            let tags = get_tags_for_entity(conn, "link", id).unwrap_or_default();

            Ok(Link {
                id,
                url,
                platform,
                title,
                description,
                thumbnail_url,
                created_at,
                tags,
            })
        })
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("Link {} not found", id)),
            other => AppError::Database(other.to_string()),
        })?;

    Ok(link)
}
