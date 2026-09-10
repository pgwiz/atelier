# Atelier

> **Content Sketchbook & Visual Planning Canvas**  
> A fast, local-only, single-user creative operating system to collect **prompts**, **characters**, and **reference links**, structure production with **ordered parts (scenes/chapters)**, plan visually on freeform **canvas boards** with a hybrid corkboard and SVG vector diagramming toolkit, collaborate with an **AI assistant**, and organize workspaces with a **dual-storage architecture**.

---

## Key Features

### 1. Projects-First Creative OS & Dual Storage
- **Workspace Isolation**: Organize work into distinct creative projects with custom colors, descriptions, and lifecycle states (`Draft`, `In Progress`, `Review`, `Completed`, `Archived`).
- **Dual-Storage Architecture**:
  - Central relational SQLite database (`data/atelier.db`) for indexed querying, connection pooling, and cross-project operations.
  - Dedicated on-disk project directories (`data/projects/<id>/`) containing an auto-synced, human-readable `project.json` snapshot and organized media subdirectories (`audio/`, `documents/`, `images/`, `videos/`, `exports/`).
- **Disk Synchronization**: Reconcile external file modifications or restored project folders back into SQLite with 1-click reload (`POST /api/projects/:id/reload-json`).
- **Multi-Workspace Operations**: Deep Copy, Non-destructive Merge with duplicate name conflict resolution, and Visual Transfer Workbench to move or copy items between workspaces.

### 2. Dedicated Project Hub & "What Changed" Timeline
- **Project Hub (`#view-project-hub`)**: Central command page for the active project featuring title, clickable status pill, project path display, and fast action shortcuts.
- **Category Directives**: 5 interactive overview cards (**Parts**, **Prompts**, **Characters**, **Media**, **Boards**) displaying live entity counts with direct 1-click filtered navigation.
- **"What Changed" Activity Feed**: Chronological audit trail (`/api/projects/:id/activity`) tracking modifications across all child entities with sorting by Most Recent, Entity Type, or Title.

### 3. Production Parts (Scenes, Chapters, Segments)
- **Ordered Sequence Workflow**: Break projects into ordered production units with customizable types (`Scene`, `Chapter`, `Segment`, `Voiceover`).
- **Lifecycle Progression**: Track stage states (`Draft` -> `In Progress` -> `Ready` -> `Done`) with automatic `completed_at` timestamps that feed real-time project progress bars.
- **Many-to-Many Asset Linkage**: Link scenes directly to character cast members, prompts, and reference links.
- **Interactive Canvas Mini-Parts**: Pin parts directly onto visual planning boards with clickable status toggles and arrow connector ports.

### 4. Advanced AI Assistant & Multi-Provider Settings
- **Multi-Provider Support**: Seamlessly connect to OpenRouter, OpenAI, Anthropic Claude, Google Gemini, Groq, or local Ollama instances.
- **Slide-Out Brainstorming Drawer**: Context-aware AI assistant drawer (`#ai-chat-drawer`) with 1-click **"Add to Project"** actions (Save as Prompt, Save as Character, Add Scene Part).
- **Security & Privacy**: Masked API key storage in SQLite and `localStorage`, client-side eye toggle, custom base URL overrides, and live connection test diagnostics.

### 5. Aesthetic Compound Modals & Design System
- **Compound Panels**: All 12 dialogs engineered with cohesive `.compound-panel` containers, high-density 2-column input grids (6px-8px padding, 0.85rem font), and clear action footers.
- **Collapsible Parameters**: Advanced options in Prompt and Character modals collapse out of sight to eliminate vertical scrolling until needed.
- **In-App Confirmations**: Native browser `confirm()` and `prompt()` completely replaced with unified in-app dialogs.
- **Design Invariants**: Max 8px border-radius everywhere, strictly zero gradients, zero emojis, and crisp 1px borders.

### 6. Hybrid Corkboard & Vector Diagramming Canvas
- **Unified Infinite Viewport**: Synchronized SVG vector graphics layer and HTML cards layer sharing `translate(${panX}px, ${panY}px) scale(${zoom})`.
- **Dynamic Contextual Cursors**: Contextual cursors (`crosshair` for drawing/shapes/connectors, `text` for text, `cell` for sticky notes, `move` for selected elements, `se-resize` on card handles, `grab`/`grabbing` for pan).
- **Hover Selectable Affordances**: Visual hover affordances (`.board-card:hover`, `.canvas-svg-item:hover`) with crisp dashed borders and subtle glow showing interactive affordance.
- **Stationary Right-Click Context Menu**: Stationary right-click (< 4px movement) triggers a custom contextual menu for cards (Copy, Duplicate, Layer Stacking, Color Swatches, Delete), vector elements (Edit Label, Copy, Duplicate, Layer Stacking, Color Swatches, Delete), and canvas (Paste, New Sticky, Add Text, Fit to View, Reset Zoom), while right-click drag pans the canvas seamlessly.
- **Modular Shapes Flyout & Extended Palette**: Popover menu supporting Rectangle, Circle, Triangle, Diamond, Star, Line, and Arrow without toolbar clutter. Includes shortcuts `R` (Rect), `O` (Ellipse), `L` (Line), `A` (Arrow).
- **Text Inside Geometric Shapes**: Center-anchored SVG text with multi-line word wrapping and contrast calculation. Double-click opens inline textarea editor.
- **Element Properties Tab & Floating Inspector**: Live two-way property editor in `#canvas-properties-panel` and `#canvas-drawer` (Properties tab) for X, Y, W, H, stroke/fill colors, stroke width, dashed style, text content, font size, and layer order.
- **Board Image Export (Retina 2x PNG & Vector SVG)**: High-resolution 2x retina HTML5 canvas PNG export and standalone vector SVG export alongside JSON archive export.
- **Clipboard Copy/Paste & Image Pasting**: `Ctrl+C`, `Ctrl+V`, `Ctrl+D` shortcuts; intercepts OS clipboard paste and drag-and-drop to upload image files to `/api/upload` and pin them directly as cards. Plain text pastes as sticky notes.
- **Tools**:
  - `Select (V)`: Multi-element selection, bounding box highlighting, SVG element dragging/moving, card resizing, and arrow key nudging (10px standard, 20px Shift, 1px Alt).
  - `Sticky Notes (N)`: Drop colored sticky notes anywhere with auto-focus inline text editing.
  - `Freehand Pen (P)`: Smooth SVG paths with configurable stroke widths and color palette.
  - `Smart Snapping Connectors (C)`: Connect cards via 4 anchor ports (top/bottom/left/right); curved SVG arrows dynamically track cards as they move.
  - `Floating Text (T)`: Double-clickable vector typography labels with multi-line `<tspan>` formatting and click event isolation.
  - `Undo / Redo`: `Ctrl+Z` / `Ctrl+Y` multi-level command history.
- **Resource Drawer**: Slide-out library to search and drag/click prompts, characters, links, parts, and properties directly onto boards.
- **Metadata Enrichment**: Backend joins and caches title, subtitle, thumbnail, and tags across all board items with reliable fallback generation.
- **4 Backdrops**: Dot-grid blueprint, textured corkboard, graph paper, or solid blank.

### 7. Futuristic Bottom Floating Dock & Ambient Background
- **Bottom Dock (`#bottom-dock`)**: Centered floating navigation bar with cybernetic tooltips, view shortcuts, and quick AI trigger.
- **Slide-Up Project Drawer (`#dock-expand-drawer`)**: Up-arrow expansion showing active project details, category chips, and rapid actions.
- **Cyberpunk Chamfered Edges**: Optional futuristic corner cuts (`clip-path: polygon(...)`) bounded within 8px.
- **Ambient Solid Color Fade**: Fullscreen breathing color overlay (`#ambient-fade-overlay`) with presets (Crimson Red `#dc2626`, Amber, Cyan, Purple, Emerald, or custom hex), adjustable cycle speeds, and intensity slider (100% zero gradients).

### 8. Custom Addons & Media Attachments
- **In-App Media Viewers**: Audio player with 0.75x–2.0x variable speed controls, monospace document/script reader (`.txt`, `.md`, `.fountain`), embedded PDF viewer, and video player modal.
- **Native OS Reveal**: Path-traversal safe native OS File Explorer reveal (`POST /api/fs/reveal` and `POST /api/projects/:id/open-folder`) opening `explorer.exe /select,"<path>"`.
- **Direct File Streaming**: Raw binary streaming at `/files/projects/:id/*path` with 1-click permalink copying.

### 9. Prompts, Characters & Reference Links
- **Prompts Repository**: Structured prompt management with system prompts, model parameters JSON (temperature, CFG, aspect ratio), categories, favorite stars, and character linkage.
- **Character Roster**: Personas with visual avatars, lore traits, visual consistency keywords, and linked prompt history.
- **Reference Links**: Web bookmarks with automatic YouTube oEmbed video title and high-resolution thumbnail extraction.
- **Unified Search & Tag Cloud**: Polymorphic multi-entity search across all prompts, characters, and links with tag frequency filtering.

### 10. 100% Self-Contained Offline Vector Icon System
- Eliminates external Font Awesome CDN dependencies entirely.
- 93 unique icon masks defined via inline SVG data URIs in `static/fontawesome.css` with `.fas/.far/.fab` aliases and hollow-circle fallback, ensuring zero solid box/square glyphs.

### 11. Dual-Mode Backup & Portability
- **Lightweight JSON**: Export and import complete database tables in a single transaction.
- **Full Project Compressed Archive (`.zip`)**: Streams complete `.zip` containing clean SQLite snapshot, JSON dump, metadata manifest with checksums, and media uploads with Zip-Slip path sanitization.

---

## Quick Start

### Prerequisites
- [Rust](https://rustup.rs/) (stable toolchain 1.75+)

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

Atelier runs as a single, highly-optimized self-contained binary:
- **Language**: Rust (stable edition 2021)
- **HTTP Server**: `axum` 0.7
- **Runtime**: `tokio` multi-threaded async runtime
- **Database**: `rusqlite` bundled with `backup` feature (zero external C dependencies)
- **Connection Pool**: `r2d2` + `r2d2_sqlite` with WAL journal mode and foreign key enforcement
- **Frontend**: Zero build step (vanilla ES6+, HTML5, self-contained SVG icons, and CSS3 custom properties)

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
│       ├── projects.rs   # Project CRUD, activity feed, copy, merge, transfer, reload-json
│       ├── parts.rs      # Production parts CRUD, status cycling, entity linkage
│       ├── attachments.rs# Custom addons (audio, scripts, video) and binary streaming
│       ├── filesystem.rs # Path-safe native OS File Explorer reveal
│       ├── prompts.rs    # Prompts CRUD & favorite toggling
│       ├── characters.rs # Characters CRUD & linked prompts
│       ├── links.rs      # References CRUD & YouTube oEmbed fetching
│       ├── tags.rs       # Polymorphic tagging & count aggregation
│       ├── search.rs     # Multi-entity unified query engine
│       ├── boards.rs     # Board CRUD, camera sync, item metadata enrichment
│       ├── settings.rs   # Persistent key-value settings store
│       ├── ai.rs         # AI assistant proxy (multi-provider support)
│       ├── upload.rs     # Image multipart upload & UUID naming
│       └── backup.rs     # JSON export/import & ZIP archive backup/restore
├── static/
│   ├── index.html       # Single-page application shell with compound modals
│   ├── fontawesome.css  # 100% offline SVG vector mask icon system
│   ├── style.css        # 5 themes, 4 canvas backdrops, compound panels, ambient fade
│   ├── app.js           # SPA router, project hub, AI drawer, view controllers
│   └── canvas.js        # Hybrid corkboard + SVG vector diagramming engine
├── data/
│   ├── atelier.db       # Primary SQLite database (auto-created)
│   ├── uploads/         # User uploaded media assets
│   └── projects/        # Dedicated project directories with project.json & media
├── tests/
│   └── api_tests.rs     # Comprehensive integration test suite (28 tests)
├── README.md
├── changelog.md
├── memory.md
└── agent.md
```

---

## License
MIT
