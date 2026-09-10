use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::Connection;
use std::path::{Path, PathBuf};

pub type DbPool = Pool<SqliteConnectionManager>;
pub type DbConn = r2d2::PooledConnection<SqliteConnectionManager>;

pub fn project_folder(data_dir: &Path, project_id: i64) -> PathBuf {
    data_dir.join("projects").join(project_id.to_string())
}

pub fn ensure_project_storage(data_dir: &Path, project_id: i64) -> Result<PathBuf, std::io::Error> {
    let base = project_folder(data_dir, project_id);
    std::fs::create_dir_all(base.join("audio"))?;
    std::fs::create_dir_all(base.join("documents"))?;
    std::fs::create_dir_all(base.join("images"))?;
    std::fs::create_dir_all(base.join("videos"))?;
    std::fs::create_dir_all(base.join("exports"))?;
    Ok(base)
}

pub fn init_pool(db_path: &Path) -> Result<DbPool, Box<dyn std::error::Error + Send + Sync>> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)?;
        let _ = ensure_project_storage(parent, 1);
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

fn add_column_if_missing(conn: &Connection, table: &str, column: &str, col_def: &str) -> Result<(), rusqlite::Error> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({})", table))?;
    let mut rows = stmt.query([])?;
    let mut exists = false;
    while let Some(row) = rows.next()? {
        let name: String = row.get(1)?;
        if name.eq_ignore_ascii_case(column) {
            exists = true;
            break;
        }
    }
    if !exists {
        conn.execute(&format!("ALTER TABLE {} ADD COLUMN {} {}", table, column, col_def), [])?;
    }
    Ok(())
}

pub fn migrate(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;

        -- Projects: top-level workspace container
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL DEFAULT 'In Progress',
            color TEXT NOT NULL DEFAULT '#38bdf8',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Seed default project if not present
        INSERT OR IGNORE INTO projects (id, name, description, status)
        VALUES (1, 'Default Studio', 'Default workspace project', 'In Progress');

        CREATE TABLE IF NOT EXISTS characters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL DEFAULT 1 REFERENCES projects(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            description TEXT,
            traits TEXT,
            image_path TEXT,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS prompts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL DEFAULT 1 REFERENCES projects(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            system_prompt TEXT,
            parameters TEXT,
            model_used TEXT,
            category TEXT,
            notes TEXT,
            is_favorite INTEGER NOT NULL DEFAULT 0,
            character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL DEFAULT 1 REFERENCES projects(id) ON DELETE CASCADE,
            url TEXT NOT NULL,
            platform TEXT,
            title TEXT,
            description TEXT,
            thumbnail_url TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
            project_id INTEGER NOT NULL DEFAULT 1 REFERENCES projects(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            theme TEXT NOT NULL DEFAULT 'default',
            canvas_style TEXT NOT NULL DEFAULT 'dot-grid',
            pan_x REAL NOT NULL DEFAULT 0,
            pan_y REAL NOT NULL DEFAULT 0,
            zoom REAL NOT NULL DEFAULT 1.0,
            drawing_data TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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

        -- Project Parts: production scenes/chapters/segments/voiceover
        CREATE TABLE IF NOT EXISTS project_parts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            part_type TEXT NOT NULL DEFAULT 'Scene',
            status TEXT NOT NULL DEFAULT 'Draft',
            order_index INTEGER NOT NULL DEFAULT 0,
            description TEXT,
            notes TEXT,
            board_id INTEGER REFERENCES boards(id) ON DELETE SET NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            completed_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_parts_project ON project_parts(project_id);

        -- Part Entities: many-to-many associations linking parts to characters, prompts, and links
        CREATE TABLE IF NOT EXISTS part_entities (
            part_id INTEGER NOT NULL REFERENCES project_parts(id) ON DELETE CASCADE,
            entity_type TEXT NOT NULL,
            entity_id INTEGER NOT NULL,
            PRIMARY KEY (part_id, entity_type, entity_id)
        );

        CREATE INDEX IF NOT EXISTS idx_part_entities ON part_entities(part_id, entity_type);

        -- Project & Part Attachments (Custom Addons: Audio, Documents, Scripts, Media)
        CREATE TABLE IF NOT EXISTS project_attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            part_id INTEGER REFERENCES project_parts(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            addon_type TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_size INTEGER,
            mime_type TEXT,
            notes TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_attachments_project ON project_attachments(project_id);
        CREATE INDEX IF NOT EXISTS idx_attachments_part ON project_attachments(part_id);

        -- Settings: key-value configuration store
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        "
    )?;

    // Add missing columns to pre-existing tables if needed
    add_column_if_missing(conn, "characters", "project_id", "INTEGER NOT NULL DEFAULT 1")?;
    add_column_if_missing(conn, "characters", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))")?;

    add_column_if_missing(conn, "prompts", "project_id", "INTEGER NOT NULL DEFAULT 1")?;
    add_column_if_missing(conn, "prompts", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))")?;

    add_column_if_missing(conn, "links", "project_id", "INTEGER NOT NULL DEFAULT 1")?;
    add_column_if_missing(conn, "links", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))")?;

    add_column_if_missing(conn, "boards", "project_id", "INTEGER NOT NULL DEFAULT 1")?;
    add_column_if_missing(conn, "boards", "updated_at", "TEXT NOT NULL DEFAULT (datetime('now'))")?;

    // Create indexes for scoped project lookups
    conn.execute_batch(
        "CREATE INDEX IF NOT EXISTS idx_characters_project ON characters(project_id);
         CREATE INDEX IF NOT EXISTS idx_prompts_project ON prompts(project_id);
         CREATE INDEX IF NOT EXISTS idx_links_project ON links(project_id);
         CREATE INDEX IF NOT EXISTS idx_boards_project ON boards(project_id);"
    )?;

    // Triggers
    conn.execute_batch(
        "CREATE TRIGGER IF NOT EXISTS trg_delete_prompt_cleanup AFTER DELETE ON prompts
        BEGIN
            DELETE FROM taggables WHERE entity_type = 'prompt' AND entity_id = OLD.id;
            DELETE FROM board_items WHERE entity_type = 'prompt' AND entity_id = OLD.id;
            DELETE FROM part_entities WHERE entity_type = 'prompt' AND entity_id = OLD.id;
        END;

        CREATE TRIGGER IF NOT EXISTS trg_delete_character_cleanup AFTER DELETE ON characters
        BEGIN
            DELETE FROM taggables WHERE entity_type = 'character' AND entity_id = OLD.id;
            DELETE FROM board_items WHERE entity_type = 'character' AND entity_id = OLD.id;
            DELETE FROM part_entities WHERE entity_type = 'character' AND entity_id = OLD.id;
        END;

        CREATE TRIGGER IF NOT EXISTS trg_delete_link_cleanup AFTER DELETE ON links
        BEGIN
            DELETE FROM taggables WHERE entity_type = 'link' AND entity_id = OLD.id;
            DELETE FROM board_items WHERE entity_type = 'link' AND entity_id = OLD.id;
            DELETE FROM part_entities WHERE entity_type = 'link' AND entity_id = OLD.id;
        END;

        CREATE TRIGGER IF NOT EXISTS trg_delete_part_cleanup AFTER DELETE ON project_parts
        BEGIN
            DELETE FROM board_items WHERE entity_type = 'part' AND entity_id = OLD.id;
            DELETE FROM part_entities WHERE part_id = OLD.id;
        END;"
    )?;

    Ok(())
}
