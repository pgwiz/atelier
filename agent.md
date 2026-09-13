# agent.md — Atelier

## What this is
Atelier is a local-only, single-user content sketchbook and visual planning canvas: a place to save **prompts**, **characters**, and **reference links** (YouTube etc.), tag them, search across all three, and organize ideas visually on freeform **planning boards** with a hybrid corkboard and full vector diagramming toolkit.

It runs as one self-contained Rust binary that serves both the REST API and the static frontend on `http://localhost:8080`.

Optimize every decision for: low idle memory, fast local startup, zero external services, zero frontend build tools, and a clean, maintainable architecture that a solo developer can understand and extend six months later.

---

## Stack (do not deviate without asking)
- **Language & Toolchain**: Rust (stable)
- **HTTP Framework**: `axum` (0.7+)
- **Async Runtime**: `tokio` (multi-thread flavor)
- **Database Driver**: `rusqlite` with `bundled` feature (no external SQLite install required)
- **Connection Pool**: `r2d2` + `r2d2_sqlite` (enables thread-safe, pool-based SQLite access across Axum handlers)
- **Serialization**: `serde`, `serde_json`
- **Compression & Archiving**: `zip` (with `deflate` feature for creating and extracting full `.zip` project archives)
- **Static & File Serving**: `tower-http` (`ServeDir`, `trace`, `cors`)
- **HTTP Client**: `reqwest` (with `json` and `rustls-tls` for YouTube oEmbed fetching and metadata lookups)
- **Frontend**: Zero build step (no npm/vite/webpack). Handcrafted HTML5, modern CSS3 (custom properties for theming), and vanilla JavaScript (ES6+ modules) in `static/`, interacting with the backend via `fetch()`.

---

## Project Structure
```
atelier/
  Cargo.toml
  build.rs             # Windows resource compiler (embeds icon and exe metadata)
  build-windows-installer.ps1 # release build, Inno Setup compiler & portable packager
  installer/           # Inno Setup .iss, icon generator, .ico, and portable .bat launcher
  src/
    main.rs              # server setup, routing, shared AppState (db pool, paths), error handling
    launcher.cs          # native Windows Forms Mini UI control panel & supervisor
    db.rs                # connection pool initialization & idempotent schema migrations
    models.rs            # structs for Prompt, Character, Link, Tag, Board, BoardItem, SearchResult
    handlers/
      projects.rs        # CRUD for /api/projects, activity feed, copy, merge, transfer, reload-json
      parts.rs           # CRUD for /api/projects/:id/parts, status toggles, linked entity associations
      attachments.rs     # CRUD for project/part media attachments (audio, scripts, video) and file streaming
      filesystem.rs      # path-traversal safe native OS File Explorer reveal (/api/fs/reveal)
      prompts.rs         # CRUD handlers for /api/prompts (scoped by project_id)
      characters.rs      # CRUD handlers for /api/characters (scoped by project_id)
      links.rs           # CRUD handlers for /api/links (scoped by project_id)
      tags.rs            # tag management, autocomplete, polymorphic tagging
      search.rs          # unified multi-entity search: GET /api/search?q=&tag=&favorite=&project_id=
      boards.rs          # CRUD handlers for boards, board items, camera, drawing, and metadata enrichment
      settings.rs        # key-value settings store for layout, themes, ambient animation, and AI config
      ai.rs              # AI chat completions proxy (OpenRouter, OpenAI, Anthropic, Gemini, Groq, Ollama)
      backup.rs          # /api/export and /api/import full database backup & restore
      upload.rs          # /api/upload for local image uploads (saved to data/uploads/)
  static/
    index.html           # main SPA entrypoint (collapsible sidebar + compound modals)
    fontawesome.css      # 100% self-contained offline SVG vector mask icon system
    app.js               # application router, project hub, AI drawer, state management
    canvas.js            # hybrid corkboard + SVG diagramming engine (pan/zoom, tools, connectors)
    style.css            # styling & design tokens for global themes, compound panels, and ambient fade
  dist/                # generated Windows installer & portable zip (gitignored)
  data/
    atelier.db          # created on first run (gitignored)
    uploads/            # uploaded character avatars and board images (gitignored)
  .gitignore
  README.md
  changelog.md
  memory.md
  agent.md
```

---

## Data Model (SQLite)
Run this as an idempotent startup migration in `src/db.rs`:

```sql
PRAGMA foreign_keys = ON;

-- Projects: top-level workspace container with status and timestamps
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'Planning', -- 'Idea' | 'Planning' | 'In Progress' | 'Review' | 'Completed' | 'Archived'
  color TEXT NOT NULL DEFAULT '#38bdf8',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed default studio project if table is empty
INSERT OR IGNORE INTO projects (id, name, description, status) 
VALUES (1, 'Default Studio', 'Default workspace project', 'In Progress');

-- Project Parts: ordered scenes / chapters / segments for video/content production
CREATE TABLE IF NOT EXISTS project_parts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  part_type TEXT NOT NULL DEFAULT 'scene', -- 'scene' | 'chapter' | 'segment' | 'stage'
  status TEXT NOT NULL DEFAULT 'Draft',    -- 'Draft' | 'In Progress' | 'Ready' | 'Done'
  order_index INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  notes TEXT,
  board_id INTEGER REFERENCES boards(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_parts_project ON project_parts(project_id);

-- Part Entities: Many-to-many associations linking parts to characters, prompts, and links
CREATE TABLE IF NOT EXISTS part_entities (
  part_id INTEGER NOT NULL REFERENCES project_parts(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL, -- 'character' | 'prompt' | 'link'
  entity_id INTEGER NOT NULL,
  PRIMARY KEY (part_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_part_entities ON part_entities(part_id, entity_type);

-- Project & Part Attachments (Custom Addons: Audio, Documents, Scripts, Media)
CREATE TABLE IF NOT EXISTS project_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  part_id INTEGER REFERENCES project_parts(id) ON DELETE CASCADE, -- null if project-level
  name TEXT NOT NULL,
  addon_type TEXT NOT NULL, -- 'audio' | 'document' | 'image' | 'video' | 'custom'
  file_path TEXT NOT NULL,  -- relative path inside project folder: e.g. "audio/scene1_vo.mp3"
  file_size INTEGER,
  mime_type TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_attachments_project ON project_attachments(project_id);
CREATE INDEX IF NOT EXISTS idx_attachments_part ON project_attachments(part_id);

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

CREATE INDEX IF NOT EXISTS idx_characters_project ON characters(project_id);

CREATE TABLE IF NOT EXISTS prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL DEFAULT 1 REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  system_prompt TEXT,
  parameters TEXT,              -- JSON string for model parameters (temperature, aspect ratio, CFG, etc.)
  model_used TEXT,
  category TEXT,
  notes TEXT,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prompts_project ON prompts(project_id);

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

CREATE INDEX IF NOT EXISTS idx_links_project ON links(project_id);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

-- Polymorphic tag associations: entity_type is 'prompt' | 'character' | 'link' | 'part'
CREATE TABLE IF NOT EXISTS taggables (
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  PRIMARY KEY (tag_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_taggables_entity ON taggables(entity_type, entity_id);

-- Visual planning boards
CREATE TABLE IF NOT EXISTS boards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL DEFAULT 1 REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  theme TEXT NOT NULL DEFAULT 'default',
  canvas_style TEXT NOT NULL DEFAULT 'dot-grid', -- 'dot-grid' | 'corkboard' | 'graph' | 'blank'
  pan_x REAL NOT NULL DEFAULT 0,
  pan_y REAL NOT NULL DEFAULT 0,
  zoom REAL NOT NULL DEFAULT 1.0,
  drawing_data TEXT NOT NULL DEFAULT '[]',       -- JSON vector blob: strokes, shapes, connectors, text
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_boards_project ON boards(project_id);

-- Draggable cards on a board (including interactive mini parts)
CREATE TABLE IF NOT EXISTS board_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,                    -- 'prompt' | 'character' | 'link' | 'note' | 'part'
  entity_id INTEGER,                             -- null when entity_type = 'note'
  note_text TEXT,                                 -- content for freeform sticky notes
  pos_x REAL NOT NULL DEFAULT 0,
  pos_y REAL NOT NULL DEFAULT 0,
  width REAL NOT NULL DEFAULT 240,
  height REAL NOT NULL DEFAULT 160,
  z_index INTEGER NOT NULL DEFAULT 0,
  color TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_board_items_board ON board_items(board_id);

-- App Settings: Key-Value store for layout mode, chamfered edges, ambient animation, and AI configuration
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## API Surface

### Projects & Dual Storage Architecture
- **Central Relational DB**: `data/atelier.db` manages unified connection pooling, indexing, and cross-project operations.
- **Dedicated Project Folders**: `data/projects/<id>/` contains auto-synced `project.json` manifest plus media subdirectories (`audio/`, `documents/`, `images/`, `videos/`, `exports/`).
- `GET /api/projects` — list all projects with counts (`prompts_count`, `characters_count`, `links_count`, `boards_count`, `parts_count`, `progress_percent`) and timestamps
- `POST /api/projects` — create project `{name, description?, status?, color?}` (creates folder & initial `project.json`)
- `GET /api/projects/:id` — get single project with full statistics, progress calculation, and timestamps
- `PUT /api/projects/:id` — update project `{name?, description?, status?, color?}` (updates `updated_at` & syncs `project.json`)
- `DELETE /api/projects/:id` — delete project, its cascaded contents, and project directory
- `POST /api/projects/:id/copy` — deep copy project `{new_name?}` with duplicate entity records, new folder, and fresh timestamps
- `POST /api/projects/:id/merge` — merge another project into this one `{source_project_id, keep_source?: bool}` (non-destructive name suffixing)
- `POST /api/projects/transfer` — visual transfer items `{source_project_id, target_project_id, items: [{entity_type, entity_id}], action: "move" | "copy"}`
- `POST /api/projects/:id/reload-json` — reconcile `data/projects/<id>/project.json` edits or restored files from disk back into database
- `GET /api/projects/:id/export` — export single project package as portable JSON or `.zip` (with associated uploaded media)
- `POST /api/projects/import` — import standalone project package into Atelier
- `GET /api/projects/:id/activity` — get chronological activity audit trail ("What Changed") across all child entities with sorting options

### Project Parts (Production Scenes & Stages)
- `GET /api/projects/:id/parts` — list all ordered parts for a project with linked characters, prompts, and references
- `POST /api/projects/:id/parts` — create part `{title, part_type?, status?, description?, notes?, board_id?, linked_character_ids?, linked_prompt_ids?, linked_link_ids?}`
- `GET /api/parts/:id` — get single part with full linked entity payloads and timestamps
- `PUT /api/parts/:id` — update part fields (sets `completed_at` when status transitions to 'Done')
- `PATCH /api/parts/:id/status` — quick update status `{status: "Draft" | "In Progress" | "Ready" | "Done"}`
- `POST /api/projects/:id/parts/reorder` — reorder parts `{part_ids: [1, 3, 2]}`
- `DELETE /api/parts/:id` — delete part
- `POST /api/parts/:id/entities` — attach linked entity `{entity_type, entity_id}`
- `DELETE /api/parts/:id/entities/:entity_type/:entity_id` — detach linked entity

### Custom Addons & Attachments (Audio, Documents, Scripts, Media)
- `GET /api/projects/:id/attachments` — list project-level and part-level attachments
- `POST /api/projects/:id/attachments` — upload/create attachment multipart `{file, name, addon_type, part_id?, notes?}`
- `GET /api/attachments/:id` — get attachment details, permalink, and metadata
- `DELETE /api/attachments/:id` — delete attachment record and remove local file
- `GET /files/projects/:id/*` — stream raw attachment file (audio, PDF, markdown script, video) for in-app player/viewer

### Filesystem Explorer Integration & Permalinks
- `POST /api/fs/reveal` — reveal file/folder in native OS File Explorer `{path: string}` (Windows Explorer /select, macOS open -R)
- `POST /api/projects/:id/open-folder` — open project's root folder in native OS File Explorer

### Prompts (Scoped to Project)
- `GET /api/prompts` — list prompts (filter by `project_id`, `character_id`, `category`, `favorite`)
- `POST /api/prompts` — create prompt `{project_id?, title, body, system_prompt?, parameters?, model_used?, category?, notes?, character_id?, tags?}`
- `GET /api/prompts/:id` — get single prompt with associated character details and tags
- `PUT /api/prompts/:id` — update prompt fields
- `DELETE /api/prompts/:id` — delete prompt

### Characters
- `GET /api/characters` — list characters
- `POST /api/characters` — create character `{name, description?, traits?, image_path?, notes?, tags?}`
- `GET /api/characters/:id` — get character with linked prompts and tags
- `PUT /api/characters/:id` — update character
- `DELETE /api/characters/:id` — delete character

### Links & Reference
- `GET /api/links` — list reference links
- `POST /api/links` — create link `{url, platform?, title?, description?, thumbnail_url?, tags?}`. If URL is YouTube and title/thumbnail are missing, fetch from `https://www.youtube.com/oembed?url=...&format=json` (fail gracefully if unavailable).
- `GET /api/links/:id` — get single link with tags
- `PUT /api/links/:id` — update link
- `DELETE /api/links/:id` — delete link

### Tags & Search
- `GET /api/tags` — list all tags with counts
- `POST /api/:entity_type/:id/tags` — attach tag by name (auto-created if new)
- `DELETE /api/:entity_type/:id/tags/:tag_name` — detach tag
- `GET /api/search?q=&tag=&type=&favorite=` — multi-entity search across prompts, characters, and links, returning unified typed results

### Planning Boards & Items
- `GET /api/boards` — list all boards
- `POST /api/boards` — create board `{name, theme?, canvas_style?}`
- `GET /api/boards/:id` — get board metadata, camera position (`pan_x`, `pan_y`, `zoom`), and `drawing_data`
- `PUT /api/boards/:id` — update board metadata, camera, or theme/canvas_style
- `PATCH /api/boards/:id/drawing` — update `drawing_data` vector JSON (debounced from client)
- `DELETE /api/boards/:id` — delete board and its items
- `GET /api/boards/:id/items` — get all cards/stickies for the board (with joined entity details)
- `POST /api/boards/:id/items` — add card (`{entity_type, entity_id}` or `{entity_type: "note", note_text}`)
- `PATCH /api/boards/:id/items/:item_id` — update position/dimensions (`pos_x`, `pos_y`, `width`, `height`, `z_index`, `color`)
- `DELETE /api/boards/:id/items/:item_id` — remove item from board

### Image Uploads & File Serving
- `POST /api/upload` — multipart image upload (saved with UUID to `data/uploads/`, returns relative URL `/uploads/<filename>`)
- Static route `/uploads/*` serves uploaded media.
- Static route `/*` serves `static/` directory.

### Backup, Export & Restore (Dual Mode)
- **Lightweight Text Mode (Data Only)**:
  - `GET /api/export` (or `GET /api/backup/export?format=json`) — export entire database as a single portable JSON file
  - `POST /api/import` (or `POST /api/backup/import?format=json`) — restore/import database tables from JSON backup file in a transaction
- **Full Project Compressed Archive Mode (Database + Media Assets)**:
  - `GET /api/backup/archive` — stream a compressed `.zip` bundle (`atelier-backup-YYYYMMDD-HHMMSS.zip`) containing:
    - `atelier.db` (clean SQLite database snapshot)
    - `database.json` (human-readable JSON data dump)
    - `manifest.json` (archive metadata, timestamp, schema version, entity and media counts)
    - `uploads/` (all uploaded character avatars, reference images, and board attachments)
  - `POST /api/backup/restore` — multipart upload of a `.zip` archive:
    - Extracts into an isolated temporary workspace and validates manifest/checksums.
    - Atomically replaces the SQLite database (with automatic rollback if validation fails).
    - Unpacks media assets into `data/uploads/`.
    - Returns a JSON response with restored counts and verification status.
- **Board-Specific Export**:
  - `GET /api/boards/:id/export` — export individual board state (metadata, items, drawing vector data) as JSON

### Settings & AI Assistant
- `GET /api/settings` — retrieve all key-value settings as JSON object
- `PUT /api/settings/:key` — update individual setting key-value pair `{value: string}`
- `POST /api/settings/bulk` — bulk update settings `{settings: {key: value, ...}}`
- `POST /api/ai/chat` — AI completions proxy endpoint `{provider, api_key?, model?, prompt, system_prompt?, base_url?}` supporting OpenRouter, OpenAI, Anthropic, Gemini, Groq, and Ollama with mock connection test mode

---

## Canvas & Board Interaction Architecture

### Unified Pan & Zoom Coordinate Space
The board uses an SVG container and an HTML cards container stacked inside a master viewport.
- Both layers share a synchronized coordinate transform: `translate(${panX}px, ${panY}px) scale(${zoom})`.
- Mouse/pointer client coordinates are converted to world canvas coordinates:
  $$worldX = \frac{clientX - panX}{zoom}$$
  $$worldY = \frac{clientY - panY}{zoom}$$

### Tooling & Gestures
1. **Select Tool (`V`)**:
   - Drag cards and sticky notes around the canvas.
   - Resize cards via bottom-right drag handles.
   - Click to select strokes/shapes; `Delete` / `Backspace` to remove.
2. **Freehand Pen (`P`)**:
   - Draw freeform lines and sketches into an SVG `<path>`.
   - Palette picker for stroke color and stroke width.
3. **Shapes Tool (`R` / `O`)**:
   - Create rectangles and ellipses/circles.
4. **Smart Snapping Connectors (`C` / Arrow)**:
   - Click-drag from an anchor point on one card to another.
   - SVG connector arrow stays dynamically linked: moving either card recalculates the connector path in real time.
5. **Text Tool (`T`)**:
   - Click anywhere to place a floating vector text label.
6. **Sticky Note (`N`)**:
   - Quick double-click or drag from toolbar to create a sticky note.

### Navigation & Shortcuts
- **Pan**: Hold `Space` + Drag, or `Middle Mouse Button` drag.
- **Zoom**: `Ctrl + Mouse Wheel` or pinch on trackpad. On-screen controls (`+`, `-`, `Reset 100%`, `Fit All`).
- **Undo / Redo**: `Ctrl+Z` / `Ctrl+Y` (or `Ctrl+Shift+Z`) with visible UI toolbar buttons.
- **Delete**: `Delete` or `Backspace` deletes selected card or drawing element.
- **Escape**: Return to `Select` tool or cancel current action.

---

## Theming System
1. **Global UI Themes**: Swapped via `<html data-theme="...">` with CSS custom properties:
   - `dark` (default sleek slate/charcoal)
   - `light` (crisp modern minimal)
   - `sepia` (warm parchment / vintage notebook)
   - `pastel` (soft creative aesthetic)
   - `cyberpunk` (high-contrast neon dark)
2. **Board Canvas Styles**: Applied per board via CSS class/data attribute on the board container:
   - `dot-grid` (subtle dotted blueprint)
   - `corkboard` (textured cork / pinboard)
   - `graph` (engineering grid)
   - `blank` (clean solid backdrop)

---

## Engineering Conventions & Guidelines
1. **Thin Handlers**: Request extraction -> small SQL query function in the same module -> JSON response. No business logic in `main.rs`.
2. **Strict SQL Safety**: Every database write or query uses parameterized prepared statements. Never format or concatenate raw SQL strings.
3. **Structured Errors**: Axum `IntoResponse` implementation for `AppError` mapping to HTTP status codes (`400`, `404`, `500`). Handlers return `Result<Json<T>, AppError>` without unhandled `unwrap()` calls.
4. **Normalized Tags**: Tags are always trimmed and converted to lowercase before insert or lookup.
5. **Debounced Writes**: During board dragging, item positions and drawings are rendered at 60fps locally, but API updates are debounced or dispatched on `pointerup` to keep SQLite writes minimal and fast.
6. **Self-Contained Simplicity**: Zero npm packages, zero external CDNs, zero cloud dependencies. Works completely offline.

---

---

## Projects, Production Parts & Visual Transfer Architecture

### 1. Projects-First Workspace Hierarchy
- **Projects Dashboard**: The root landing view is the **Projects Dashboard**, displaying visual cards for each project with its status badge, progress percentage bar (calculated automatically from completed parts), item counts (`prompts`, `characters`, `links`, `boards`, `parts`), and timestamps (`created_at`, `updated_at`).
- **Sidebar Project Switcher**:
  - **Expanded Mode**: Located directly below the brand header. Displays active project icon, project name, color dot, status badge (`Idea`, `Planning`, `In Progress`, `Review`, `Completed`, `Archived`), and a dropdown caret. Clicking opens a dropdown with:
    - Current project stat chips: `Prompts (X) • Characters (Y) • References (Z) • Boards (W) • Parts (V)`
    - Fast project switcher list
    - Action buttons: `+ New Project`, `Duplicate Project`, `Merge Projects`, `Visual Transfer`, `Projects Dashboard`
  - **Compressed Mode**: Collapses into a centered 36x36px project icon button with a colored status dot indicator. Clicking opens the quick-switch popup menu.

### 2. Flexible Production Parts (Scenes / Chapters / Segments)
- **Concept**: A project is broken down into an ordered sequence of production parts (e.g., *Intro*, *Scene 1: Chase*, *Scene 2: Alley*, *Voiceover*).
- **Statuses**: `Draft`, `In Progress`, `Ready`, `Done`. When marked `Done`, `completed_at` timestamp is set automatically.
- **Many-to-Many Linking**: Each Part links to:
  - Cast (`characters` appearing in the scene)
  - Generation Prompts (`prompts` used for script/video/image cues)
  - Moodboard References (`links` for audio/visual inspiration)
  - Planning Board (`boards` associated with the part)
- **Board Mini Parts**:
  - Parts can be dragged onto any planning board as interactive `board_items` with `entity_type: 'part'`.
  - Shows part title, clickable status badge to update progress directly, linked character mini avatars, and connection anchors to draw sequence arrows between scenes or characters.

### 3. Project Operations & Visual Transfer
- **Duplicate / Copy Project**: Deep-clones the project, parts, prompts, characters, links, boards, board items, and vector drawings into a new project with fresh timestamps while preserving internal linkages.
- **Merge Projects**: Merges Project A into Project B non-destructively. If character or board names collide, automatically appends suffix (e.g., `Neo (Project A)`), updates target project's `updated_at`, with option to keep or archive the source project.
- **Visual Transfer Workbench**: A visual dual-pane transfer modal (Source project on left, Target project on right) allowing selective moving or copying of prompts, characters, links, boards, and parts, with live timestamp updates and individual entity card transfer buttons.
### 4. Custom Addons, File Attachments & Media Viewers
- **Concept**: Beyond standard prompts and characters, projects and individual parts can have custom addons/attachments (voiceovers, audio cues, screenplays, PDF bibles, video animatics).
- **Supported Formats & In-App Players**:
  - **Audio** (`.mp3`, `.wav`, `.ogg`, `.m4a`): Built-in audio player with waveform/timeline seek, volume, and playback speed toggles (0.75x, 1.0x, 1.25x, 1.5x, 2.0x).
  - **Scripts & Documents** (`.txt`, `.md`, `.fountain`, `.pdf`): In-app document viewer with formatted text preview, script reader, and PDF iframe embed.
  - **Video & Motion** (`.mp4`, `.webm`): In-app video preview player.
- **Attachment Cards**: Rendered with file metadata (size, format icon, timestamp), inline preview, quick delete, and "Open File Location" button.

### 5. Dedicated Filesystem Organization & Native Explorer Reveal
- **Project Directory Structure**: Each project gets a clean folder under `data/projects/<project_id>/` with subfolders:
  - `audio/` (voiceover recordings, audio cues, sound effects)
  - `documents/` (scripts, screenplays, PDF notes, fountain docs)
  - `images/` (character portraits, reference images, moodboards)
  - `videos/` (video clips, animatics, scene renders)
  - `exports/` (board exports, single project archives)
- **Native OS 'Open File Location' / 'Reveal in Explorer'**:
  - When clicking "Open Project Folder" or "Open File Location" on any attached file:
  - Backend executes path-traversal validated command:
    - **Windows**: `explorer.exe /select,"<canonical_file_path>"` (highlights file) or `explorer.exe "<canonical_dir_path>"`
    - **macOS**: `open -R "<path>"`
    - **Linux**: `xdg-open "<dir>"`
  - Immediately reveals the folder or file in the user's desktop file manager.

### 6. Deep-Linking Permalinks
- **SPA Entity Routing**: Direct permalinks support jumping straight to items:
  - Project Dashboard: `http://localhost:8080/#/projects/:id`
  - Part Detail / Timeline: `http://localhost:8080/#/projects/:id/parts/:part_id`
  - Board Focus: `http://localhost:8080/#/projects/:id/boards/:board_id`
  - Prompts & Characters: `http://localhost:8080/#/projects/:id/prompts/:prompt_id`
- **Raw File Permalinks**: Streaming endpoints (`/files/projects/:id/*`) for browser tabs and media players.
- **Copy Permalink**: 1-click clipboard copy button on entity cards and modals with toast confirmation.

---

## Comprehensive Implementation Task List

### Phase 1: Project Setup & Core Infrastructure
- [x] **1.1** Initialize Cargo project structure with `Cargo.toml` and `.gitignore`
- [x] **1.2** Configure Rust dependencies (`axum`, `tokio`, `rusqlite`, `r2d2`, `r2d2_sqlite`, `serde`, `serde_json`, `zip`, `tower-http`, `reqwest`, `uuid`, `tracing`)
- [x] **1.3** Establish directory skeleton (`src/handlers/`, `static/`, `data/uploads/`)
- [x] **1.4** Implement `src/main.rs`: `AppState` (db pool + paths), centralized `AppError` enum with HTTP status mapping, graceful shutdown, and static routes (`/`, `/uploads`)

### Phase 2: Database Architecture & Migrations
- [x] **2.1** Implement `src/db.rs` with `r2d2` pool creation, WAL journal mode, and foreign keys pragma
- [x] **2.2** Implement idempotent schema migration function on startup creating:
  - `characters`
  - `prompts` (with `system_prompt` and `parameters` JSON)
  - `links`
  - `tags`
  - `taggables` (polymorphic association with index)
  - `boards` (with theme, `canvas_style`, camera `pan_x`, `pan_y`, `zoom`, and `drawing_data`)
  - `board_items` (cards and sticky notes)

### Phase 3: Domain Models & Data Transfer Objects
- [x] **3.1** Implement `src/models.rs` with Serde-serializable structs:
  - `Prompt`, `CreatePromptDto`, `UpdatePromptDto`
  - `Character`, `CreateCharacterDto`, `UpdateCharacterDto`
  - `Link`, `CreateLinkDto`, `UpdateLinkDto`
  - `Tag`, `AttachTagDto`, `TagWithCount`
  - `Board`, `CreateBoardDto`, `UpdateBoardDto`, `UpdateDrawingDto`
  - `BoardItem`, `CreateBoardItemDto`, `PatchBoardItemDto`
  - `SearchResult` (unified polymorphic result type)
  - `BackupManifest`

### Phase 4: API Handlers
- [x] **4.1** `src/handlers/prompts.rs`: List (with character/category/tag filters), Create, Get, Update, Delete, Favorite toggle
- [x] **4.2** `src/handlers/characters.rs`: List, Create, Get (with linked prompts), Update, Delete
- [x] **4.3** `src/handlers/links.rs`: List, Create with async YouTube oEmbed metadata lookup, Get, Update, Delete
- [x] **4.4** `src/handlers/tags.rs`: List with counts, attach to entity, detach from entity
- [x] **4.5** `src/handlers/search.rs`: Multi-entity parameterized SQL search across prompts, characters, and links
- [x] **4.6** `src/handlers/boards.rs`:
  - Board CRUD & camera state updates (`pan_x`, `pan_y`, `zoom`)
  - Debounced drawing vector data updates (`PATCH /api/boards/:id/drawing`)
  - Board items CRUD (add card/note, patch position/dimensions, delete item)
- [x] **4.7** `src/handlers/upload.rs`: Multipart image upload saving to `data/uploads/` with UUID and returning relative URL
- [x] **4.8** `src/handlers/backup.rs`:
  - JSON text export & transactional import (`/api/export`, `/api/import`)
  - Full `.zip` archive export streaming (`atelier.db`, `database.json`, `manifest.json`, `data/uploads/`)
  - Full `.zip` archive upload and atomic restore with validation and rollback
  - Single board JSON export (`/api/boards/:id/export`)

### Phase 5: Frontend Design System & Shell
- [x] **5.1** `static/index.html`: Responsive single-page structure with collapsible left sidebar, view containers, and modal popups
- [x] **5.2** `static/style.css`: Design token definitions for 5 global themes (`dark`, `light`, `sepia`, `pastel`, `cyberpunk`) and 4 canvas styles (`dot-grid`, `corkboard`, `graph`, `blank`)
- [x] **5.3** `static/app.js`: Core client architecture: SPA view switcher, active state management, theme switcher, notifications/toasts, and API fetch wrappers

### Phase 6: Core Content Views (Prompts, Characters, Links, Search)
- [x] **6.1** Prompts view: Grid of prompt cards, quick copy-to-clipboard, filter by favorite/character, prompt modal (with system prompt and parameters fields)
- [x] **6.2** Characters view: Character roster gallery, avatar display, trait badges, image upload/drag-drop, linked prompt list
- [x] **6.3** Links view: Reference bookmark cards with YouTube oEmbed title/thumbnail previews, platform tags, external link launcher
- [x] **6.4** Search & Tag Cloud: Instant search bar, tag filtering chips, multi-entity result list with type indicators

### Phase 7: Hybrid Corkboard & Vector Diagramming Canvas
- [x] **7.1** `static/canvas.js`: Unified SVG vector container and HTML cards container sharing `translate(pan_x, pan_y) scale(zoom)`
- [x] **7.2** Camera navigation: Space+Drag / Middle-click pan, Ctrl+Wheel zoom, on-screen zoom toolbar (+, -, 100%, Fit All)
- [x] **7.3** Card interactions: Absolute world coordinates, pointer events for smooth dragging, resize handle, card delete
- [x] **7.4** Sticky notes: Color picker, inline text editing, resize handling
- [x] **7.5** Vector drawing tools:
  - Freehand Pen (`P`) with SVG path generation, stroke width, and color palette
  - Geometric shapes: Rectangles (`R`) and Ellipses (`O`)
  - Smart Snapping Connectors (`C`): Dynamic SVG arrow paths linking cards that update live on card movement
  - Floating Text labels (`T`)
- [x] **7.6** Canvas controls & history: Multi-level Undo / Redo (`Ctrl+Z`, `Ctrl+Y`), Delete key support, tool hotkeys
- [x] **7.7** In-canvas resource drawer: Slide-out drawer to search and drag prompts, characters, and links onto the board
- [x] **7.8** Debounced synchronization: Autosave camera, item coordinates, and vector drawings to SQLite

### Phase 8: Backup, Portability & Verification
- [x] **8.1** Connect UI controls for JSON Export/Import and Full `.zip` Archive Export/Restore
- [x] **8.2** Build test suite in `tests/api_tests.rs` verifying prompt CRUD, tagging, board items, and backup round-trip
- [x] **8.3** Comprehensive end-to-end verification of all user workflows in browser

### Phase 9: Projects, Production Parts & Multi-Workspace Operations
- [x] **9.1 Database Schema Migration & Storage Architecture**:
  - Add `projects` table (seeded with 'Default Studio'), `project_parts` table, `part_entities` junction table, and `project_attachments` table.
  - Add `project_id` and `updated_at` to `prompts`, `characters`, `links`, `boards`.
  - Add `completed_at` to `project_parts` and support `entity_type: 'part'` in `board_items`.
  - Implement dual storage generator: auto-create `data/projects/<id>/{audio,documents,images,videos,exports}` and maintain auto-synced `project.json` manifest.
- [x] **9.2 Backend Models & Handlers**:
  - Implement `src/handlers/projects.rs`: CRUD, statistics aggregation (`GET /api/projects`), duplicate/copy (`POST /api/projects/:id/copy`), non-destructive merge (`POST /api/projects/:id/merge`), visual transfer (`POST /api/projects/transfer`), reload from disk (`POST /api/projects/:id/reload-json`), single-project export (`GET /api/projects/:id/export`), and project import (`POST /api/projects/import`).
  - Implement `src/handlers/parts.rs`: CRUD for parts (`GET/POST /api/projects/:id/parts`, `PUT/DELETE /api/parts/:id`), quick status toggle (`PATCH /api/parts/:id/status`), reordering (`POST /api/projects/:id/parts/reorder`), and linked entity attachment (`POST/DELETE /api/parts/:id/entities`).
  - Implement `src/handlers/attachments.rs`: Upload and management for custom addons (audio, documents, scripts, media), with raw file streaming at `/files/projects/:id/*`.
  - Implement `src/handlers/filesystem.rs`: Path-traversal safe native OS File Explorer invocation (`POST /api/fs/reveal` and `POST /api/projects/:id/open-folder`).
  - Update `prompts.rs`, `characters.rs`, `links.rs`, `boards.rs`, `search.rs` to filter by `project_id`.
- [x] **9.3 Frontend Projects Dashboard & Sidebar Switcher**:
  - Dedicated Project Switcher in sidebar directly below header: active project pill with name, status badge, dropdown with stat chips and action buttons; shrinks to 36x36px icon with colored status dot in compressed navbar.
  - Central Projects Dashboard view with project cards, progress bars, entity counts, timestamps, "Open Project Folder", and quick action buttons.
- [x] **9.4 Production Parts View & Custom Addon Viewers**:
  - Dedicated Parts / Scene timeline view with status badges, linked characters/prompts/references chips, drag-and-drop reordering, and create/edit modal.
  - Custom Addon panel: Audio player with playback speed controls (`.mp3`, `.wav`), Document/script viewer (`.txt`, `.md`, `.fountain`, `.pdf` iframe), and Video player (`.mp4`, `.webm`).
  - "Open File Location" button on each attachment card.
- [x] **9.5 Canvas Mini Parts Integration**:
  - Render interactive 'part' cards on the planning canvas showing part title, clickable status badge, linked character avatars, and connection anchors for sequence arrows.
  - Include Parts in canvas resource drawer.
- [x] **9.6 Visual Transfer Workbench & Merge Dialog**:
  - Dual-pane transfer modal (Source vs Target) with item checkboxes to Move or Copy across projects.
  - Merge project dialog with conflict handling (suffixing duplicate names) and source project retention toggle.
- [x] **9.7 Deep-Linking Permalinks & Navigation**:
  - Hash-based deep link router (`/#/projects/:id`, `/#/projects/:id/parts/:part_id`, `/#/projects/:id/boards/:board_id`).
  - "Copy Permalink" action button with clipboard confirmation.
- [x] **9.8 Test Suite & Verification**:
  - Integration tests covering project creation, copy, merge, visual transfer, parts management, custom addon uploads, and single-project export/import.

### Phase 10: Project Card Redesign, Project Hub, AI Assistant & Canvas Overhaul
- [x] **10.1 Backend Settings API & Project Activity Feed**:
  - Add `settings` key-value table to SQLite in `src/db.rs`.
  - Implement `src/handlers/settings.rs` (`GET /api/settings`, `PUT /api/settings/:key`, `POST /api/settings/bulk`).
  - Implement `GET /api/projects/:id/activity` in `src/handlers/projects.rs` returning aggregated chronological activity ("What Changed").
  - Implement AI chat proxy endpoint `POST /api/ai/chat` in `src/handlers/ai.rs`.
  - Register new routes in `src/lib.rs`.
- [x] **10.2 Redesigned Project Card Display**:
  - Eliminate cluttered button grid and fix missing/square icons with verified Font Awesome 6 icons.
  - Prominent primary **"Open Project"** button navigating directly to Project Hub.
  - Sleek 3-dots actions dropdown menu (`fa-solid fa-ellipsis-vertical`) housing Open Folder, Reload JSON, Copy, Merge, Transfer, Export ZIP, Edit, and Delete.
  - Interactive category stat chips navigating directly to that entity view.
- [x] **10.3 Aesthetic Compound Popup & Modal Overhaul (All 12 Modals)**:
  - Rework all modals with segmented `.compound-panel` containers, dense 2-column input grids, integrated labels, and space-efficient footers.
  - Add collapsible "Advanced Options / Parameters" toggle to Prompt and Character modals to eliminate unnecessary vertical scrolling.
  - Max 8px border-radius and zero gradients strictly enforced across all popup containers, inputs, and buttons.
- [x] **10.4 Dedicated Project Hub Page (`#view-project-hub`)**:
  - Top management banner with active project details, status pill, folder path, and quick action buttons.
  - Category Directives Hub: 5 large interactive cards (Parts, Prompts, Characters, Media, Boards) with counts and one-click navigation.
  - Sortable "What Changed" recent activity feed: timeline with sorting by Most Recent, Type, and Title.
- [x] **10.5 Advanced Settings Tab (`#view-settings`)**:
  - Layout Card: Left Sidebar vs. Futuristic Bottom Floating Dock, Futuristic Chamfered Edges toggle.
  - Ambient Background Animation Card: ON/OFF toggle, Crimson Red `#dc2626` preset (and Amber, Cyan, Purple, custom hex), speed slider, intensity wash.
  - Global Themes Card: 5 themes (`dark`, `light`, `sepia`, `pastel`, `cyberpunk`).
  - Advanced AI & API Keys Card: Provider selector (OpenRouter, OpenAI, Anthropic, Gemini, Groq, Ollama), masked API key input with eye toggle, model selector, test connection.
  - Studio Data & Backup overview.
- [x] **10.6 Slide-Out AI Assistant Drawer (`#ai-chat-drawer`)**:
  - Accessible via magic wand icon button in header and bottom dock.
  - Context-aware brainstorming for prompts, characters, and scene parts.
  - One-click "Add to Project" buttons on AI responses (Save as Prompt, Save as Character, Add Scene Part).
- [x] **10.7 Futuristic Bottom Floating Dock with Arrow-Up Drawer**:
  - Centered floating bottom dock (`#bottom-dock`) with navigation icons and tooltips.
  - Arrow-up expand button (`fa-chevron-up`) sliding up drawer (`#dock-expand-drawer`) showing active project, stat chips, and quick actions.
  - Cyberpunk Futuristic Chamfered Edges (`clip-path: polygon(...)`, max 8px bounds, zero gradients).
- [x] **10.8 Ambient Background Fade Color Animation**:
  - Fullscreen `#ambient-fade-overlay` element with solid color keyframe breathing fade.
  - Zero gradients, real-time live preview in Settings.
- [x] **10.9 Planning Board & Floating Text Overhaul**:
  - Contextual dynamic mouse cursors: crosshair for pen/shapes/connector, text for text tool, cell for sticky notes, move on selected items, se-resize on resize handles.
  - Seamless inline canvas text editor (no browser `prompt()`), with auto-focus, Enter to commit, and double-click to edit existing text.
  - Enable dragging and moving for selected SVG elements (shapes, floating text, freehand strokes) with arrow keys nudging (10px / 1px).
  - Comprehensive audit and stabilization of all board operations.
- [x] **10.10 Automated Testing & Verification**:
  - Integration tests in `tests/api_tests.rs` for settings CRUD, activity feed, and AI proxy validation.
  - Verification of Compound Modals, Project Card actions, Project Hub navigation, AI Assistant drawer, canvas text/cursors, and zero-gradient compliance.

### Phase 11: Extended Vector Suite, Canvas Affordances, Context Menu & Clipboard (v0.4.3)
- [x] **11.1 Modular Shapes Flyout Popover**:
  - Expandable shapes popover (`#shapes-flyout`) supporting Rectangle, Circle, Triangle, Diamond, Star, Line, and Arrow.
  - Keyboard shortcuts `R`, `O`, `L`, `A` for direct tool selection.
- [x] **11.2 Text Inside Geometric Shapes**:
  - Center-anchored SVG `<text>` with multi-line word wrap and contrast fill computation inside shapes.
  - Double-clicking opens inline textarea editor anchored to shape bounds.
- [x] **11.3 Hover Selectable Affordances**:
  - Crisp dashed borders and subtle glow on hovering cards and SVG elements (`.board-card:hover`, `.canvas-svg-item:hover`).
- [x] **11.4 Stationary Right-Click Context Menu**:
  - Custom contextual action menu on stationary right-click (< 4px movement) for cards, vector shapes, lines, text, and canvas background, while preserving right-click drag pan.
- [x] **11.5 Element Properties Inspector Drawer**:
  - Live two-way property editor in `#canvas-properties-panel` and `#canvas-drawer` (Properties tab) for coordinates, dimensions, strokes, fills, dash style, text labels, and z-index.
- [x] **11.6 High-Resolution PNG & Vector SVG Export**:
  - 2x retina offscreen HTML5 canvas PNG export and valid standalone `.svg` vector export alongside JSON export.
- [x] **11.7 Clipboard Copy/Paste & Image Pasting**:
  - In-app `Ctrl+C`, `Ctrl+V`, `Ctrl+D` shortcuts with cursor offset.
  - System clipboard paste listener (`window.addEventListener('paste')`) and drag-and-drop: uploads image files to `/api/upload` and pins cards. Plain text pastes as sticky notes.

### Phase 12: Filter Bars Space Efficiency & AI UI Design System Compliance (v0.4.4)
- [x] **12.1 Single-Line Unified Filter Control Bars**:
  - Compact 38px unified control bars across Projects, Parts, Prompts, Characters, Links, and Boards with horizontal overflow protection.
  - Full sort suite across all 6 views with integrated vector search inputs and dense pills.
- [x] **12.2 AI UI Design System Compliance**:
  - Purged hardcoded accent colors (`#ec4899`), standardizing on theme tokens `var(--primary)`, `var(--success)`, `var(--danger)`.
  - Max 8px border-radius and strictly zero gradients verified across all AI panels, chat bubbles, inputs, and buttons.
  - Zero emojis verified across all AI tools and messages.
- [x] **12.3 Contextual AI Path & Scene Actions**:
  - Dedicated `#btn-hub-ai-path` inside project folder path row with project analysis prompts.
  - Added `#btn-parts-ai-scene` action button to Production Parts header.
  - Configurable Temperature, Max Tokens, and Custom Studio Directives in Settings.

### Phase 13: Installable Windows Release & Desktop Packaging (v0.5.0)
- [x] **13.1 Inno Setup Windows Installer**:
  - Configured `installer/atelier.iss` compiling `dist/Atelier-Setup-v0.1.0-x64.exe` (5.12 MB, LZMA2/max).
  - Installs to `%LOCALAPPDATA%\Programs\Atelier` without administrator privileges, generating Start Menu group, desktop shortcut, and registered uninstaller.
- [x] **13.2 Zero-Install Portable Windows Package**:
  - Packaged `dist/Atelier-v0.1.0-windows-x64-portable.zip` (4.50 MB) with `atelier.exe`, `static/`, `atelier.ico`, `README.md`, and one-click `run-atelier.bat`.
- [x] **13.3 Native Windows Resources & Metadata**:
  - Multi-resolution icon `installer/atelier.ico` embedded via `winres` and `build.rs` into `atelier.exe`.
  - Windows file version, description, and legal copyright properties embedded.
- [x] **13.4 Smart Storage Resolution & Auto-Browser Launch**:
  - `src/main.rs` resolves `static/` relative to `current_exe()`. User data isolated to `%LOCALAPPDATA%\Atelier\data` in installed mode, preserving databases across upgrades; portable `./data` mode preserved.
  - Auto-launches default browser to `http://localhost:8080` on launch with `--no-browser` and `--headless` flags.
- [x] **13.5 Build Automation**:
  - `build-windows-installer.ps1` automates release build, Inno Setup compilation, portable archive packaging, and SHA256 checksums.

### Phase 14: Windows Mini UI Control Panel Launcher & Port Configuration (v0.6.0)
- [x] **14.1 Native Windows Forms Mini UI Launcher (`src/launcher.cs`)**:
  - Compact, modern desktop control panel matching Atelier Studio dark theme (solid surface `#181b24`, 1px borders `#2a2e3d`, max 8px border radius, zero gradients).
  - Server status indicator (Running / Stopped) with real-time health checks and studio URL link (`http://localhost:8080`).
  - Interactive port changer: numeric spinner (`numPort`), Enter key submission, visual change indicator, and pre-flight socket probe (`ProbePort`) to prevent binding conflicts.
  - One-click action buttons: "Open in Browser", "Start / Stop Server" supervisor toggle, "Open Data Folder", and "Open Project Directory".
  - System tray minimization (`MinimizeToTray`) with single-click restore, dynamic tray menu, and single-instance named mutex (`Atelier_Studio_Launcher_SingleInstance_Mutex`).
  - High-DPI scaling support (`SetProcessDPIAware`) and native application icon extraction.
- [x] **14.2 Console Detachment & Auto-Delegation**:
  - `src/main.rs` checks for `--server` mode. When launched without `--server`, immediately detaches the console window via `FreeConsole()`, resolves `atelier-launcher.exe`, and delegates execution seamlessly.
  - Backend server runs with `CreateNoWindow = true` under the launcher supervisor, completely eliminating black CLI/terminal popups for desktop users.
- [x] **14.3 Installer & Portable Package Integration**:
  - Updated `installer/atelier.iss`, `build-windows-installer.ps1`, and `run-atelier.bat` to bundle and launch `atelier-launcher.exe`.
  - Recompiled installer (`dist/Atelier-Setup-v0.1.0-x64.exe`) and portable zip (`dist/Atelier-v0.1.0-windows-x64-portable.zip`).
