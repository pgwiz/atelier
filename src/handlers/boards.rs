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
        safe_truncate,
        tags::get_tags_for_entity,
    },
    main_types::{AppError, AppState},
    models::{
        Board, BoardItem, CreateBoardDto, CreateBoardItemDto, PatchBoardItemDto,
        SingleBoardExport, UpdateBoardDto, UpdateDrawingDto,
    },
};

#[derive(Debug, Deserialize)]
pub struct BoardFilterParams {
    pub project_id: Option<i64>,
}

fn row_to_board(row: &rusqlite::Row) -> Result<Board, rusqlite::Error> {
    let id: i64 = row.get(0)?;
    let name: String = row.get(1)?;
    let theme: String = row.get(2)?;
    let canvas_style: String = row.get(3)?;
    let pan_x: f64 = row.get(4)?;
    let pan_y: f64 = row.get(5)?;
    let zoom: f64 = row.get(6)?;
    let drawing_data_str: String = row.get(7)?;
    let project_id: Option<i64> = row.get(8)?;
    let created_at: String = row.get(9)?;
    let updated_at: Option<String> = row.get(10)?;
    let items_count: Option<i64> = row.get(11).ok();

    let drawing_data: serde_json::Value = serde_json::from_str(&drawing_data_str)
        .unwrap_or_else(|_| serde_json::json!([]));

    Ok(Board {
        id,
        name,
        theme,
        canvas_style,
        pan_x,
        pan_y,
        zoom,
        drawing_data,
        project_id,
        created_at,
        updated_at,
        items_count,
    })
}

// GET /api/boards
pub async fn list_boards(
    State(state): State<AppState>,
    Query(params): Query<BoardFilterParams>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get().map_err(|e| AppError::Database(e.to_string()))?;

    let mut sql = String::from(
        "SELECT b.id, b.name, b.theme, b.canvas_style, b.pan_x, b.pan_y, b.zoom,
                b.drawing_data, b.project_id, b.created_at, b.updated_at, COUNT(bi.id) as items_count
         FROM boards b
         LEFT JOIN board_items bi ON b.id = bi.board_id
         WHERE 1=1",
    );

    let mut bind_params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(pid) = params.project_id {
        sql.push_str(" AND b.project_id = ?");
        bind_params.push(Box::new(pid));
    }

    sql.push_str(" GROUP BY b.id ORDER BY b.id DESC");

    let mut stmt = conn.prepare(&sql).map_err(|e| AppError::Database(e.to_string()))?;

    let rusqlite_params: Vec<&dyn rusqlite::ToSql> = bind_params.iter().map(|p| p.as_ref()).collect();

    let rows = stmt
        .query_map(rusqlite_params.as_slice(), |row| row_to_board(row))
        .map_err(|e| AppError::Database(e.to_string()))?;

    let mut boards = Vec::new();
    for b in rows {
        boards.push(b.map_err(|e| AppError::Database(e.to_string()))?);
    }

    Ok(Json(boards))
}

// POST /api/boards
pub async fn create_board(
    State(state): State<AppState>,
    Json(dto): Json<CreateBoardDto>,
) -> Result<impl IntoResponse, AppError> {
    if dto.name.trim().is_empty() {
        return Err(AppError::BadRequest("Board name cannot be empty".into()));
    }

    let theme = dto.theme.unwrap_or_else(|| "default".into());
    let canvas_style = dto.canvas_style.unwrap_or_else(|| "dot-grid".into());
    let project_id = dto.project_id.unwrap_or(1);

    let conn = state.pool.get().map_err(|e| AppError::Database(e.to_string()))?;

    conn.execute(
        "INSERT INTO boards (project_id, name, theme, canvas_style, pan_x, pan_y, zoom, drawing_data, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 0.0, 0.0, 1.0, '[]', datetime('now'), datetime('now'))",
        params![project_id, dto.name.trim(), theme, canvas_style],
    )
    .map_err(|e| AppError::Database(e.to_string()))?;

    let board_id = conn.last_insert_rowid();

    let _ = sync_project_json(&conn, project_id, &state.data_dir);
    let board = get_board_by_id(&conn, board_id)?;

    Ok((StatusCode::CREATED, Json(board)))
}

// GET /api/boards/:id
pub async fn get_board(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    let board = get_board_by_id(&conn, id)?;
    Ok(Json(board))
}

// PUT /api/boards/:id
pub async fn update_board(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(dto): Json<UpdateBoardDto>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    let existing = get_board_by_id(&conn, id)?;
    let project_id = existing.project_id.unwrap_or(1);

    if let Some(name) = dto.name {
        if name.trim().is_empty() {
            return Err(AppError::BadRequest("Board name cannot be empty".into()));
        }
        conn.execute("UPDATE boards SET name = ?1, updated_at = datetime('now') WHERE id = ?2", params![name.trim(), id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    if dto.theme.is_some() {
        conn.execute("UPDATE boards SET theme = ?1, updated_at = datetime('now') WHERE id = ?2", params![dto.theme, id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    if dto.canvas_style.is_some() {
        conn.execute("UPDATE boards SET canvas_style = ?1, updated_at = datetime('now') WHERE id = ?2", params![dto.canvas_style, id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    if let Some(pan_x) = dto.pan_x {
        conn.execute("UPDATE boards SET pan_x = ?1, updated_at = datetime('now') WHERE id = ?2", params![pan_x, id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    if let Some(pan_y) = dto.pan_y {
        conn.execute("UPDATE boards SET pan_y = ?1, updated_at = datetime('now') WHERE id = ?2", params![pan_y, id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    if let Some(zoom) = dto.zoom {
        conn.execute("UPDATE boards SET zoom = ?1, updated_at = datetime('now') WHERE id = ?2", params![zoom, id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    if let Some(drawing) = dto.drawing_data {
        let drawing_str = drawing.to_string();
        conn.execute("UPDATE boards SET drawing_data = ?1, updated_at = datetime('now') WHERE id = ?2", params![drawing_str, id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    if let Some(new_pid) = dto.project_id {
        conn.execute("UPDATE boards SET project_id = ?1, updated_at = datetime('now') WHERE id = ?2", params![new_pid, id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    let _ = sync_project_json(&conn, project_id, &state.data_dir);
    let updated = get_board_by_id(&conn, id)?;
    Ok(Json(updated))
}

// PATCH /api/boards/:id/drawing
pub async fn update_board_drawing(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(dto): Json<UpdateDrawingDto>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    let existing = get_board_by_id(&conn, id)?;
    let project_id = existing.project_id.unwrap_or(1);

    let drawing_str = dto.drawing_data.to_string();
    conn.execute(
        "UPDATE boards SET drawing_data = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![drawing_str, id],
    )
    .map_err(|e| AppError::Database(e.to_string()))?;

    let _ = sync_project_json(&conn, project_id, &state.data_dir);

    Ok(Json(json!({
        "status": "success",
        "board_id": id
    })))
}

// DELETE /api/boards/:id
pub async fn delete_board(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    let existing = get_board_by_id(&conn, id)?;
    let project_id = existing.project_id.unwrap_or(1);

    conn.execute("DELETE FROM boards WHERE id = ?1", params![id])
        .map_err(|e| AppError::Database(e.to_string()))?;

    let _ = sync_project_json(&conn, project_id, &state.data_dir);

    Ok(Json(json!({
        "status": "success",
        "id": id
    })))
}

// GET /api/boards/:id/items
pub async fn list_board_items(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    let _board = get_board_by_id(&conn, id)?;

    let items = get_items_for_board(&conn, id)?;
    Ok(Json(items))
}

// POST /api/boards/:id/items
pub async fn create_board_item(
    State(state): State<AppState>,
    Path(id): Path<i64>,
    Json(dto): Json<CreateBoardItemDto>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    let board = get_board_by_id(&conn, id)?;
    let project_id = board.project_id.unwrap_or(1);

    let entity_type = dto.entity_type.trim().to_lowercase();
    let valid_types = ["prompt", "character", "link", "note", "part"];
    if !valid_types.contains(&entity_type.as_str()) {
        return Err(AppError::BadRequest(format!(
            "Invalid entity_type '{}'. Must be prompt, character, link, note, or part",
            dto.entity_type
        )));
    }

    if entity_type != "note" {
        let eid = dto.entity_id.ok_or_else(|| {
            AppError::BadRequest(format!("entity_id is required for entity_type '{}'", entity_type))
        })?;

        let exists: bool = match entity_type.as_str() {
            "prompt" => conn
                .query_row("SELECT EXISTS(SELECT 1 FROM prompts WHERE id = ?1)", params![eid], |r| r.get(0))
                .unwrap_or(false),
            "character" => conn
                .query_row("SELECT EXISTS(SELECT 1 FROM characters WHERE id = ?1)", params![eid], |r| r.get(0))
                .unwrap_or(false),
            "link" => conn
                .query_row("SELECT EXISTS(SELECT 1 FROM links WHERE id = ?1)", params![eid], |r| r.get(0))
                .unwrap_or(false),
            "part" => conn
                .query_row("SELECT EXISTS(SELECT 1 FROM project_parts WHERE id = ?1)", params![eid], |r| r.get(0))
                .unwrap_or(false),
            _ => false,
        };

        if !exists {
            return Err(AppError::NotFound(format!(
                "Referenced {} with id {} does not exist",
                entity_type, eid
            )));
        }
    }

    let pos_x = dto.pos_x.unwrap_or(0.0);
    let pos_y = dto.pos_y.unwrap_or(0.0);
    let width = dto.width.unwrap_or(240.0);
    let height = dto.height.unwrap_or(160.0);
    let z_index = dto.z_index.unwrap_or(0);

    conn.execute(
        "INSERT INTO board_items (board_id, entity_type, entity_id, note_text, pos_x, pos_y, width, height, z_index, color, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, datetime('now'))",
        params![
            id,
            entity_type,
            dto.entity_id,
            dto.note_text,
            pos_x,
            pos_y,
            width,
            height,
            z_index,
            dto.color,
        ],
    ).map_err(|e| AppError::Database(e.to_string()))?;

    let item_id = conn.last_insert_rowid();

    let _ = conn.execute("UPDATE boards SET updated_at = datetime('now') WHERE id = ?", [id]);
    let _ = sync_project_json(&conn, project_id, &state.data_dir);

    let item = get_board_item_by_id(&conn, item_id)?;
    Ok((StatusCode::CREATED, Json(item)))
}

// PATCH /api/boards/:id/items/:item_id
pub async fn patch_board_item(
    State(state): State<AppState>,
    Path((board_id, item_id)): Path<(i64, i64)>,
    Json(dto): Json<PatchBoardItemDto>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    let existing = get_board_item_by_id(&conn, item_id)?;
    if existing.board_id != board_id {
        return Err(AppError::NotFound(format!(
            "Board item {} does not belong to board {}",
            item_id, board_id
        )));
    }

    let board = get_board_by_id(&conn, board_id)?;
    let project_id = board.project_id.unwrap_or(1);

    if let Some(x) = dto.pos_x {
        conn.execute("UPDATE board_items SET pos_x = ?1 WHERE id = ?2", params![x, item_id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }
    if let Some(y) = dto.pos_y {
        conn.execute("UPDATE board_items SET pos_y = ?1 WHERE id = ?2", params![y, item_id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }
    if let Some(w) = dto.width {
        conn.execute("UPDATE board_items SET width = ?1 WHERE id = ?2", params![w, item_id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }
    if let Some(h) = dto.height {
        conn.execute("UPDATE board_items SET height = ?1 WHERE id = ?2", params![h, item_id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }
    if let Some(z) = dto.z_index {
        conn.execute("UPDATE board_items SET z_index = ?1 WHERE id = ?2", params![z, item_id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }
    if dto.color.is_some() {
        conn.execute("UPDATE board_items SET color = ?1 WHERE id = ?2", params![dto.color, item_id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }
    if dto.note_text.is_some() {
        conn.execute("UPDATE board_items SET note_text = ?1 WHERE id = ?2", params![dto.note_text, item_id])
            .map_err(|e| AppError::Database(e.to_string()))?;
    }

    let _ = conn.execute("UPDATE boards SET updated_at = datetime('now') WHERE id = ?", [board_id]);
    let _ = sync_project_json(&conn, project_id, &state.data_dir);

    let updated = get_board_item_by_id(&conn, item_id)?;
    Ok(Json(updated))
}

// DELETE /api/boards/:id/items/:item_id
pub async fn delete_board_item(
    State(state): State<AppState>,
    Path((board_id, item_id)): Path<(i64, i64)>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    let existing = get_board_item_by_id(&conn, item_id)?;
    if existing.board_id != board_id {
        return Err(AppError::NotFound(format!(
            "Board item {} does not belong to board {}",
            item_id, board_id
        )));
    }

    let board = get_board_by_id(&conn, board_id)?;
    let project_id = board.project_id.unwrap_or(1);

    conn.execute("DELETE FROM board_items WHERE id = ?1", params![item_id])
        .map_err(|e| AppError::Database(e.to_string()))?;

    let _ = conn.execute("UPDATE boards SET updated_at = datetime('now') WHERE id = ?", [board_id]);
    let _ = sync_project_json(&conn, project_id, &state.data_dir);

    Ok(Json(json!({
        "status": "success",
        "id": item_id
    })))
}

// GET /api/boards/:id/export
pub async fn export_single_board(
    State(state): State<AppState>,
    Path(id): Path<i64>,
) -> Result<impl IntoResponse, AppError> {
    let conn = state.pool.get().map_err(|e| AppError::Database(e.to_string()))?;
    let board = get_board_by_id(&conn, id)?;
    let items = get_items_for_board(&conn, id)?;

    Ok(Json(SingleBoardExport { board, items }))
}

pub fn get_board_by_id(conn: &Connection, id: i64) -> Result<Board, AppError> {
    let mut stmt = conn
        .prepare(
            "SELECT b.id, b.name, b.theme, b.canvas_style, b.pan_x, b.pan_y, b.zoom,
                    b.drawing_data, b.project_id, b.created_at, b.updated_at, COUNT(bi.id) as items_count
             FROM boards b
             LEFT JOIN board_items bi ON b.id = bi.board_id
             WHERE b.id = ?1
             GROUP BY b.id",
        )
        .map_err(|e| AppError::Database(e.to_string()))?;

    let board = stmt
        .query_row(params![id], |row| row_to_board(row))
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(format!("Board {} not found", id)),
            other => AppError::Database(other.to_string()),
        })?;

    Ok(board)
}

pub fn get_items_for_board(conn: &Connection, board_id: i64) -> Result<Vec<BoardItem>, AppError> {
    let mut stmt = conn
        .prepare(
            "SELECT id, board_id, entity_type, entity_id, note_text,
                    pos_x, pos_y, width, height, z_index, color, created_at
             FROM board_items
             WHERE board_id = ?1
             ORDER BY z_index ASC, id ASC",
        )
        .map_err(|e| AppError::Database(e.to_string()))?;

    let rows = stmt
        .query_map(params![board_id], |row| {
            let id: i64 = row.get(0)?;
            let b_id: i64 = row.get(1)?;
            let entity_type: String = row.get(2)?;
            let entity_id: Option<i64> = row.get(3)?;
            let note_text: Option<String> = row.get(4)?;
            let pos_x: f64 = row.get(5)?;
            let pos_y: f64 = row.get(6)?;
            let width: f64 = row.get(7)?;
            let height: f64 = row.get(8)?;
            let z_index: i64 = row.get(9)?;
            let color: Option<String> = row.get(10)?;
            let created_at: String = row.get(11)?;

            Ok((
                id,
                b_id,
                entity_type,
                entity_id,
                note_text,
                pos_x,
                pos_y,
                width,
                height,
                z_index,
                color,
                created_at,
            ))
        })
        .map_err(|e| AppError::Database(e.to_string()))?;

    let mut items = Vec::new();
    for r in rows {
        let (
            id,
            b_id,
            entity_type,
            entity_id,
            note_text,
            pos_x,
            pos_y,
            width,
            height,
            z_index,
            color,
            created_at,
        ) = r.map_err(|e| AppError::Database(e.to_string()))?;

        let (entity_title, entity_subtitle, entity_image, entity_tags) =
            enrich_board_item_metadata(conn, &entity_type, entity_id);

        items.push(BoardItem {
            id,
            board_id: b_id,
            entity_type,
            entity_id,
            note_text,
            pos_x,
            pos_y,
            width,
            height,
            z_index,
            color,
            created_at,
            entity_title,
            entity_subtitle,
            entity_image,
            entity_tags,
        });
    }

    Ok(items)
}

pub fn enrich_board_item_metadata(
    conn: &Connection,
    entity_type: &str,
    entity_id: Option<i64>,
) -> (Option<String>, Option<String>, Option<String>, Vec<String>) {
    let mut entity_title = None;
    let mut entity_subtitle = None;
    let mut entity_image = None;
    let mut entity_tags = Vec::new();

    let norm_type = entity_type.trim().to_lowercase();
    if let Some(eid) = entity_id {
        match norm_type.as_str() {
            "prompt" => {
                if let Ok((title, body)) = conn.query_row(
                    "SELECT title, body FROM prompts WHERE id = ?1",
                    params![eid],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
                ) {
                    entity_title = Some(title);
                    let snippet = safe_truncate(&body, 100);
                    entity_subtitle = Some(snippet);
                    entity_tags = get_tags_for_entity(conn, "prompt", eid).unwrap_or_default();
                } else {
                    entity_title = Some(format!("Prompt #{}", eid));
                    entity_subtitle = Some("(Referenced prompt not found)".into());
                }
            }
            "character" => {
                if let Ok((name, desc, traits, img)) = conn.query_row(
                    "SELECT name, description, traits, image_path FROM characters WHERE id = ?1",
                    params![eid],
                    |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, Option<String>>(1)?,
                            row.get::<_, Option<String>>(2)?,
                            row.get::<_, Option<String>>(3)?,
                        ))
                    },
                ) {
                    entity_title = Some(name);
                    let snippet = desc.or(traits).unwrap_or_default();
                    let snippet_trimmed = safe_truncate(&snippet, 100);
                    entity_subtitle = Some(snippet_trimmed);
                    entity_image = img;
                    entity_tags = get_tags_for_entity(conn, "character", eid).unwrap_or_default();
                } else {
                    entity_title = Some(format!("Character #{}", eid));
                    entity_subtitle = Some("(Referenced character not found)".into());
                }
            }
            "link" => {
                if let Ok((title, url, thumb)) = conn.query_row(
                    "SELECT title, url, thumbnail_url FROM links WHERE id = ?1",
                    params![eid],
                    |row| {
                        Ok((
                            row.get::<_, Option<String>>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, Option<String>>(2)?,
                        ))
                    },
                ) {
                    entity_title = Some(title.unwrap_or_else(|| url.clone()));
                    entity_subtitle = Some(url);
                    entity_image = thumb;
                    entity_tags = get_tags_for_entity(conn, "link", eid).unwrap_or_default();
                } else {
                    entity_title = Some(format!("Link #{}", eid));
                    entity_subtitle = Some("(Referenced link not found)".into());
                }
            }
            "part" => {
                if let Ok((title, ptype, status)) = conn.query_row(
                    "SELECT title, part_type, status FROM project_parts WHERE id = ?1",
                    params![eid],
                    |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?)),
                ) {
                    entity_title = Some(title);
                    entity_subtitle = Some(format!("{} • {}", ptype, status));
                    entity_tags = get_tags_for_entity(conn, "part", eid).unwrap_or_default();
                } else {
                    entity_title = Some(format!("Part #{}", eid));
                    entity_subtitle = Some("(Referenced part not found)".into());
                }
            }
            _ => {}
        }
    } else if norm_type == "note" {
        entity_title = Some("Sticky Note".into());
    }

    (entity_title, entity_subtitle, entity_image, entity_tags)
}

pub fn get_board_item_by_id(conn: &Connection, item_id: i64) -> Result<BoardItem, AppError> {
    let mut stmt = conn
        .prepare(
            "SELECT id, board_id, entity_type, entity_id, note_text,
                    pos_x, pos_y, width, height, z_index, color, created_at
             FROM board_items
             WHERE id = ?1",
        )
        .map_err(|e| AppError::Database(e.to_string()))?;

    let item_tuple = stmt
        .query_row(params![item_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<i64>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, f64>(5)?,
                row.get::<_, f64>(6)?,
                row.get::<_, f64>(7)?,
                row.get::<_, f64>(8)?,
                row.get::<_, i64>(9)?,
                row.get::<_, Option<String>>(10)?,
                row.get::<_, String>(11)?,
            ))
        })
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::NotFound(format!("Board item {} not found", item_id))
            }
            other => AppError::Database(other.to_string()),
        })?;

    let (
        id,
        board_id,
        entity_type,
        entity_id,
        note_text,
        pos_x,
        pos_y,
        width,
        height,
        z_index,
        color,
        created_at,
    ) = item_tuple;

    let (entity_title, entity_subtitle, entity_image, entity_tags) =
        enrich_board_item_metadata(conn, &entity_type, entity_id);

    Ok(BoardItem {
        id,
        board_id,
        entity_type,
        entity_id,
        note_text,
        pos_x,
        pos_y,
        width,
        height,
        z_index,
        color,
        created_at,
        entity_title,
        entity_subtitle,
        entity_image,
        entity_tags,
    })
}
