use axum::{
    extract::{Path, State},
    Json,
};
use std::collections::HashMap;

use crate::{
    main_types::{AppError, AppState},
    models::{BulkSettingsDto, SetSettingDto, SettingItem},
};

pub async fn get_all_settings(
    State(state): State<AppState>,
) -> Result<Json<HashMap<String, String>>, AppError> {
    let conn = state.pool.get()?;
    let mut stmt = conn.prepare("SELECT key, value FROM settings ORDER BY key ASC")?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;

    let mut map = HashMap::new();
    for row in rows {
        let (k, v) = row?;
        map.insert(k, v);
    }

    Ok(Json(map))
}

pub async fn get_setting(
    State(state): State<AppState>,
    Path(key): Path<String>,
) -> Result<Json<SettingItem>, AppError> {
    let conn = state.pool.get()?;
    let mut stmt = conn.prepare("SELECT key, value, updated_at FROM settings WHERE key = ?1")?;
    let mut rows = stmt.query([&key])?;

    if let Some(row) = rows.next()? {
        Ok(Json(SettingItem {
            key: row.get(0)?,
            value: row.get(1)?,
            updated_at: row.get(2)?,
        }))
    } else {
        Err(AppError::NotFound(format!("Setting '{}' not found", key)))
    }
}

pub async fn set_setting(
    State(state): State<AppState>,
    Path(key): Path<String>,
    Json(dto): Json<SetSettingDto>,
) -> Result<Json<SettingItem>, AppError> {
    if key.trim().is_empty() {
        return Err(AppError::BadRequest("Setting key cannot be empty".to_string()));
    }

    let conn = state.pool.get()?;
    conn.execute(
        "INSERT INTO settings (key, value, updated_at)
         VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
        rusqlite::params![key, dto.value],
    )?;

    let mut stmt = conn.prepare("SELECT key, value, updated_at FROM settings WHERE key = ?1")?;
    let item = stmt.query_row([&key], |row| {
        Ok(SettingItem {
            key: row.get(0)?,
            value: row.get(1)?,
            updated_at: row.get(2)?,
        })
    })?;

    Ok(Json(item))
}

pub async fn bulk_set_settings(
    State(state): State<AppState>,
    Json(dto): Json<BulkSettingsDto>,
) -> Result<Json<HashMap<String, String>>, AppError> {
    let mut conn = state.pool.get()?;
    let tx = conn.transaction()?;

    let mut map_to_insert = HashMap::new();
    if let Some(settings) = dto.settings {
        for (k, v) in settings {
            map_to_insert.insert(k, v);
        }
    }
    if dto.extra.contains_key("key") && dto.extra.contains_key("value") && dto.extra.len() == 2 {
        if let (Some(k), Some(v)) = (dto.extra.get("key"), dto.extra.get("value")) {
            map_to_insert.insert(k.clone(), v.clone());
        }
    } else {
        for (k, v) in dto.extra {
            map_to_insert.insert(k, v);
        }
    }

    {
        let mut stmt = tx.prepare(
            "INSERT INTO settings (key, value, updated_at)
             VALUES (?1, ?2, datetime('now'))
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
        )?;

        for (k, v) in &map_to_insert {
            if !k.trim().is_empty() {
                stmt.execute(rusqlite::params![k, v])?;
            }
        }
    }

    tx.commit()?;

    // Fetch all current settings
    let mut stmt = conn.prepare("SELECT key, value FROM settings ORDER BY key ASC")?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;

    let mut all = HashMap::new();
    for row in rows {
        let (k, v) = row?;
        all.insert(k, v);
    }

    Ok(Json(all))
}
