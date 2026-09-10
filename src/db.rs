use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::Connection;
use std::path::Path;

pub type DbPool = Pool<SqliteConnectionManager>;
pub type DbConn = r2d2::PooledConnection<SqliteConnectionManager>;

pub fn init_pool(db_path: &Path) -> Result<DbPool, Box<dyn std::error::Error + Send + Sync>> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let manager = SqliteConnectionManager::file(db_path)
        .with_init(|conn: &mut Connection| {
            conn.execute_batch(
                "PRAGMA journal_mode = WAL;
                 PRAGMA synchronous = NORMAL;
                 PRAGMA foreign_keys = ON;
                 PRAGMA busy_timeout = 5000;",
            )?;
            Ok(())
        });

    let pool = Pool::builder()
        .max_size(16)
        .build(manager)?;

    // Run migrations on first connection
    let conn = pool.get()?;
    migrate(&conn)?;

    Ok(pool)
}

pub fn migrate(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS characters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            traits TEXT,
            image_path TEXT,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS prompts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            system_prompt TEXT,
            parameters TEXT,
            model_used TEXT,
            category TEXT,
            notes TEXT,
            is_favorite INTEGER NOT NULL DEFAULT 0,
            character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT NOT NULL,
            platform TEXT,
            title TEXT,
            description TEXT,
            thumbnail_url TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS taggables (
            tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            entity_type TEXT NOT NULL,
            entity_id INTEGER NOT NULL,
            PRIMARY KEY (tag_id, entity_type, entity_id)
        );

        CREATE INDEX IF NOT EXISTS idx_taggables_entity ON taggables(entity_type, entity_id);

        CREATE TABLE IF NOT EXISTS boards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            theme TEXT NOT NULL DEFAULT 'default',
            canvas_style TEXT NOT NULL DEFAULT 'dot-grid',
            pan_x REAL NOT NULL DEFAULT 0,
            pan_y REAL NOT NULL DEFAULT 0,
            zoom REAL NOT NULL DEFAULT 1.0,
            drawing_data TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS board_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
            entity_type TEXT NOT NULL,
            entity_id INTEGER,
            note_text TEXT,
            pos_x REAL NOT NULL DEFAULT 0,
            pos_y REAL NOT NULL DEFAULT 0,
            width REAL NOT NULL DEFAULT 240,
            height REAL NOT NULL DEFAULT 160,
            z_index INTEGER NOT NULL DEFAULT 0,
            color TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_board_items_board ON board_items(board_id);

        CREATE TRIGGER IF NOT EXISTS trg_delete_prompt_cleanup AFTER DELETE ON prompts
        BEGIN
            DELETE FROM taggables WHERE entity_type = 'prompt' AND entity_id = OLD.id;
            DELETE FROM board_items WHERE entity_type = 'prompt' AND entity_id = OLD.id;
        END;

        CREATE TRIGGER IF NOT EXISTS trg_delete_character_cleanup AFTER DELETE ON characters
        BEGIN
            DELETE FROM taggables WHERE entity_type = 'character' AND entity_id = OLD.id;
            DELETE FROM board_items WHERE entity_type = 'character' AND entity_id = OLD.id;
        END;

        CREATE TRIGGER IF NOT EXISTS trg_delete_link_cleanup AFTER DELETE ON links
        BEGIN
            DELETE FROM taggables WHERE entity_type = 'link' AND entity_id = OLD.id;
            DELETE FROM board_items WHERE entity_type = 'link' AND entity_id = OLD.id;
        END;"
    )?;

    Ok(())
}
