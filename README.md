# Atelier

> **Content Sketchbook & Visual Planning Canvas**  
> A fast, local-only, single-user creative workspace to collect **prompts**, **characters**, and **reference links**, tag them, search across everything, and plan stories and ideas on freeform **visual boards** with a hybrid corkboard and vector diagramming toolkit.

---

## Key Features

### 1. Prompts Repository
- Structured prompt storage with **System/Meta prompt**, **Model parameters (JSON)** (e.g., temperature, CFG, aspect ratio), **Category**, and **Model used** (Midjourney, Claude, SDXL, GPT-4, etc.).
- Link prompts directly to specific characters in your roster.
- Fast 1-click copy-to-clipboard for rapid workflow iteration.
- Star favorites and filter by category, character, or tags.

### 2. Character Roster
- Visual persona and character profiles with avatars, lore notes, archetype summaries, and visual consistency keywords.
- Built-in drag-and-drop image upload saved to local storage (`data/uploads/`).
- Linked prompt aggregation: immediately see all prompts associated with a character.

### 3. Reference Links & YouTube oEmbed
- Save reference links (art inspiration, cinematography tutorials, music, color schemes).
- Automatic YouTube oEmbed metadata extraction: paste a YouTube URL to automatically fetch video title and high-resolution thumbnail preview.
- Auto-platform detection (YouTube, Twitter/X, GitHub, ArtStation, Reddit, Pinterest).

### 4. Hybrid Corkboard & Vector Diagramming Engine
- Master infinite-feel viewport with synchronized SVG vector graphics and HTML cards.
- **Tools**:
  - `Select (V)`: Move cards, resize cards via bottom-right drag handle, select elements, delete with `Del`/`Backspace`.
  - `Sticky Notes (N)`: Drop colored sticky notes anywhere with inline editing.
  - `Freehand Pen (P)`: Smooth SVG paths with configurable stroke widths and color palette.
  - `Shapes (R / O)`: Draw vector rectangles and ellipses.
  - `Smart Snapping Connectors (C)`: Connect cards via 4 anchor ports (top/bottom/left/right); SVG connector paths dynamically follow cards as they move.
  - `Floating Text (T)`: Place custom vector typography labels.
  - `Undo / Redo`: `Ctrl+Z` / `Ctrl+Y` multi-level history.
- **Camera Navigation**: Space+Drag or middle-mouse pan, Ctrl+Wheel zoom, on-screen zoom toolbar (`+`, `-`, `1:1`, `Fit`).
- **4 Backdrops**: Dot-grid blueprint, textured corkboard, graph paper, or solid blank.
- **Resource Drawer**: Slide-out library to search and drag/click prompts, characters, and links directly onto the board.

### 5. Unified Search & Tag Cloud
- Search across all prompts, characters, and reference links simultaneously.
- Interactive Tag Cloud with counts to filter items across all types.
- Instant keyboard search with type-specific result badges.

### 6. Dual-Mode Backup & Portability
- **Lightweight JSON**: Export and import complete database tables in a single transaction.
- **Full Project Compressed Archive (`.zip`)**: Streams `atelier-backup-YYYYMMDD-HHMMSS.zip` containing:
  - Clean WAL-checkpointed SQLite database (`atelier.db`)
  - Human-readable JSON dump (`database.json`)
  - Metadata manifest with entity counts and checksums (`manifest.json`)
  - All local user uploads (`uploads/`)
- Atomic archive restore with transaction rollback on error.

### 7. Theming System
- 5 Handcrafted UI Themes: `Dark Slate` (default), `Crisp Light`, `Warm Sepia`, `Pastel Dream`, and `Cyberpunk Neon`.
- Swapped instantly via CSS custom properties with persistent state in `localStorage`.
- Professional enterprise design: max 8px rounded corners, solid surfaces, Font Awesome icons, and strictly zero gradients.

---

## Quick Start

### Prerequisites
- [Rust](https://rustup.rs/) (stable toolchain)

### Running Atelier
```bash
# Clone or navigate to the directory
cd social-media-manager

# Start server
cargo run
```

Open your browser at:
```
http://localhost:8080
```

### Running Tests
```bash
cargo test
```

---

## Architecture

Atelier runs as a single self-contained binary with zero external runtime dependencies:
- **Language**: Rust (stable edition 2021)
- **HTTP Server**: `axum` 0.7
- **Runtime**: `tokio` multi-threaded async runtime
- **Database**: `rusqlite` bundled with `backup` feature (no external SQLite installation needed)
- **Connection Pool**: `r2d2` + `r2d2_sqlite`
- **Frontend**: Zero build step (vanilla ES6+, HTML5, Font Awesome 6 icons, and CSS3 custom properties)

### Directory Structure
```
atelier/
├── Cargo.toml
├── src/
│   ├── main.rs          # Server initialization and graceful shutdown
│   ├── lib.rs           # Core router and module exports
│   ├── db.rs            # Pool setup, WAL mode, schema migrations
│   ├── models.rs        # Domain structs and DTOs
│   ├── main_types.rs    # AppState and AppError
│   └── handlers/
│       ├── prompts.rs   # CRUD & favorite toggling for prompts
│       ├── characters.rs# CRUD & linked prompt retrieval
│       ├── links.rs     # CRUD & YouTube oEmbed fetching
│       ├── tags.rs      # Polymorphic tagging & count aggregation
│       ├── search.rs    # Multi-entity unified query engine
│       ├── boards.rs    # Board CRUD, camera sync, item positioning
│       ├── upload.rs    # Image multipart upload & UUID naming
│       └── backup.rs    # JSON export/import & ZIP archive backup/restore
├── static/
│   ├── index.html       # Single-page application shell
│   ├── fontawesome.css  # Self-contained offline Font Awesome icon stylesheet
│   ├── style.css        # 5 themes, 4 canvas backdrops, responsive UI
│   ├── app.js           # SPA router, state manager, view controllers
│   └── canvas.js        # Hybrid corkboard + SVG diagramming engine
├── data/
│   ├── atelier.db       # SQLite database (auto-created)
│   └── uploads/         # User uploaded media assets
├── tests/
│   └── api_tests.rs     # Complete integration test suite
├── README.md
├── changelog.md
├── memory.md
└── agent.md
```

---

## License
MIT
