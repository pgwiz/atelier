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
  src/
    main.rs              # server setup, routing, shared AppState (db pool, paths), error handling
    db.rs                # connection pool initialization & idempotent schema migrations
    models.rs            # structs for Prompt, Character, Link, Tag, Board, BoardItem, SearchResult
    handlers/
      prompts.rs         # CRUD handlers for /api/prompts
      characters.rs      # CRUD handlers for /api/characters
      links.rs           # CRUD handlers for /api/links (+ YouTube oEmbed metadata fetch)
      tags.rs            # tag management, autocomplete, polymorphic tagging
      search.rs          # unified multi-entity search: GET /api/search?q=&tag=&favorite=
      boards.rs          # CRUD handlers for boards, board items, camera, and drawing data
      backup.rs          # /api/export and /api/import full database backup & restore
      upload.rs          # /api/upload for local image uploads (saved to data/uploads/)
  static/
    index.html           # main SPA entrypoint (collapsible sidebar + views)
    app.js               # application router, navigation, state management
    canvas.js            # hybrid corkboard + SVG diagramming engine (pan/zoom, tools, connectors)
    style.css            # styling & design tokens for global themes and board canvas styles
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
  parameters TEXT,              -- JSON string for model parameters (temperature, aspect ratio, CFG, etc.)
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

-- Polymorphic tag associations: entity_type is 'prompt' | 'character' | 'link'
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
  name TEXT NOT NULL,
  theme TEXT NOT NULL DEFAULT 'default',
  canvas_style TEXT NOT NULL DEFAULT 'dot-grid', -- 'dot-grid' | 'corkboard' | 'graph' | 'blank'
  pan_x REAL NOT NULL DEFAULT 0,
  pan_y REAL NOT NULL DEFAULT 0,
  zoom REAL NOT NULL DEFAULT 1.0,
  drawing_data TEXT NOT NULL DEFAULT '[]',       -- JSON vector blob: strokes, shapes, connectors, text
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Draggable cards on a board
CREATE TABLE IF NOT EXISTS board_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,                    -- 'prompt' | 'character' | 'link' | 'note'
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
```

---

## API Surface

### Prompts
- `GET /api/prompts` — list prompts (optional filter by `character_id`, `category`, `favorite`)
- `POST /api/prompts` — create prompt `{title, body, system_prompt?, parameters?, model_used?, category?, notes?, character_id?, tags?}`
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

## Comprehensive Implementation Task List

### Phase 1: Project Setup & Core Infrastructure
- [ ] **1.1** Initialize Cargo project structure with `Cargo.toml` and `.gitignore`
- [ ] **1.2** Configure Rust dependencies (`axum`, `tokio`, `rusqlite`, `r2d2`, `r2d2_sqlite`, `serde`, `serde_json`, `zip`, `tower-http`, `reqwest`, `uuid`, `tracing`)
- [ ] **1.3** Establish directory skeleton (`src/handlers/`, `static/`, `data/uploads/`)
- [ ] **1.4** Implement `src/main.rs`: `AppState` (db pool + paths), centralized `AppError` enum with HTTP status mapping, graceful shutdown, and static routes (`/`, `/uploads`)

### Phase 2: Database Architecture & Migrations
- [ ] **2.1** Implement `src/db.rs` with `r2d2` pool creation, WAL journal mode, and foreign keys pragma
- [ ] **2.2** Implement idempotent schema migration function on startup creating:
  - `characters`
  - `prompts` (with `system_prompt` and `parameters` JSON)
  - `links`
  - `tags`
  - `taggables` (polymorphic association with index)
  - `boards` (with theme, `canvas_style`, camera `pan_x`, `pan_y`, `zoom`, and `drawing_data`)
  - `board_items` (cards and sticky notes)

### Phase 3: Domain Models & Data Transfer Objects
- [ ] **3.1** Implement `src/models.rs` with Serde-serializable structs:
  - `Prompt`, `CreatePromptDto`, `UpdatePromptDto`
  - `Character`, `CreateCharacterDto`, `UpdateCharacterDto`
  - `Link`, `CreateLinkDto`, `UpdateLinkDto`
  - `Tag`, `AttachTagDto`, `TagWithCount`
  - `Board`, `CreateBoardDto`, `UpdateBoardDto`, `UpdateDrawingDto`
  - `BoardItem`, `CreateBoardItemDto`, `PatchBoardItemDto`
  - `SearchResult` (unified polymorphic result type)
  - `BackupManifest`

### Phase 4: API Handlers
- [ ] **4.1** `src/handlers/prompts.rs`: List (with character/category/tag filters), Create, Get, Update, Delete, Favorite toggle
- [ ] **4.2** `src/handlers/characters.rs`: List, Create, Get (with linked prompts), Update, Delete
- [ ] **4.3** `src/handlers/links.rs`: List, Create with async YouTube oEmbed metadata lookup, Get, Update, Delete
- [ ] **4.4** `src/handlers/tags.rs`: List with counts, attach to entity, detach from entity
- [ ] **4.5** `src/handlers/search.rs`: Multi-entity parameterized SQL search across prompts, characters, and links
- [ ] **4.6** `src/handlers/boards.rs`:
  - Board CRUD & camera state updates (`pan_x`, `pan_y`, `zoom`)
  - Debounced drawing vector data updates (`PATCH /api/boards/:id/drawing`)
  - Board items CRUD (add card/note, patch position/dimensions, delete item)
- [ ] **4.7** `src/handlers/upload.rs`: Multipart image upload saving to `data/uploads/` with UUID and returning relative URL
- [ ] **4.8** `src/handlers/backup.rs`:
  - JSON text export & transactional import (`/api/export`, `/api/import`)
  - Full `.zip` archive export streaming (`atelier.db`, `database.json`, `manifest.json`, `data/uploads/`)
  - Full `.zip` archive upload and atomic restore with validation and rollback
  - Single board JSON export (`/api/boards/:id/export`)

### Phase 5: Frontend Design System & Shell
- [ ] **5.1** `static/index.html`: Responsive single-page structure with collapsible left sidebar, view containers, and modal popups
- [ ] **5.2** `static/style.css`: Design token definitions for 5 global themes (`dark`, `light`, `sepia`, `pastel`, `cyberpunk`) and 4 canvas styles (`dot-grid`, `corkboard`, `graph`, `blank`)
- [ ] **5.3** `static/app.js`: Core client architecture: SPA view switcher, active state management, theme switcher, notifications/toasts, and API fetch wrappers

### Phase 6: Core Content Views (Prompts, Characters, Links, Search)
- [ ] **6.1** Prompts view: Grid of prompt cards, quick copy-to-clipboard, filter by favorite/character, prompt modal (with system prompt and parameters fields)
- [ ] **6.2** Characters view: Character roster gallery, avatar display, trait badges, image upload/drag-drop, linked prompt list
- [ ] **6.3** Links view: Reference bookmark cards with YouTube oEmbed title/thumbnail previews, platform tags, external link launcher
- [ ] **6.4** Search & Tag Cloud: Instant search bar, tag filtering chips, multi-entity result list with type indicators

### Phase 7: Hybrid Corkboard & Vector Diagramming Canvas
- [ ] **7.1** `static/canvas.js`: Unified SVG vector container and HTML cards container sharing `translate(pan_x, pan_y) scale(zoom)`
- [ ] **7.2** Camera navigation: Space+Drag / Middle-click pan, Ctrl+Wheel zoom, on-screen zoom toolbar (+, -, 100%, Fit All)
- [ ] **7.3** Card interactions: Absolute world coordinates, pointer events for smooth dragging, resize handle, card delete
- [ ] **7.4** Sticky notes: Color picker, inline text editing, resize handling
- [ ] **7.5** Vector drawing tools:
  - Freehand Pen (`P`) with SVG path generation, stroke width, and color palette
  - Geometric shapes: Rectangles (`R`) and Ellipses (`O`)
  - Smart Snapping Connectors (`C`): Dynamic SVG arrow paths linking cards that update live on card movement
  - Floating Text labels (`T`)
- [ ] **7.6** Canvas controls & history: Multi-level Undo / Redo (`Ctrl+Z`, `Ctrl+Y`), Delete key support, tool hotkeys
- [ ] **7.7** In-canvas resource drawer: Slide-out drawer to search and drag prompts, characters, and links onto the board
- [ ] **7.8** Debounced synchronization: Autosave camera, item coordinates, and vector drawings to SQLite

### Phase 8: Backup, Portability & Verification
- [ ] **8.1** Connect UI controls for JSON Export/Import and Full `.zip` Archive Export/Restore
- [ ] **8.2** Build test suite in `tests/api_tests.rs` verifying prompt CRUD, tagging, board items, and backup round-trip
- [ ] **8.3** Comprehensive end-to-end verification of all user workflows in browser

