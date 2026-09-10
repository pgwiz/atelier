# Changelog

All notable changes to Atelier will be documented in this file.

## [0.2.0] - 2026-09-10

### Changed
- **Complete Professional UI Redesign**:
  - Reworked UI into a modern, crisp, enterprise/pro-grade interface inspired by Linear, Raycast, and GitHub.
  - Implemented high-contrast readability, a clean typographic scale, and well-proportioned padding and margins.
  - Cohesive solid color palettes across all 5 themes (`dark`, `light`, `sepia`, `pastel`, `cyberpunk`).
- **Complete Emoji Removal**:
  - Removed all emojis across the entire project (HTML templates, JavaScript templates, toasts, badges, empty states, CSS, Rust tracing logs, and documentation).
- **Font Awesome 6 Icon System**:
  - Included Font Awesome 6 Free via clean CDN link in `static/index.html` paired with self-contained vector SVG stylesheet `static/fontawesome.css` for 100% offline compatibility.
  - Replaced all emojis and Unicode button indicators with crisp Font Awesome vector icons (`<i class="fa-solid fa-..."></i>`).
  - Added full icon coverage for backup actions (`fa-download`, `fa-upload`), search toggles (`fa-star`), search result types (`fa-feather-pointed`, `fa-user`, `fa-link`), prompt categories (`fa-tag`), board cards (`fa-shapes`, `fa-palette`, `fa-note-sticky`), and library drawer items.
  - Added interactive search card navigation allowing direct 1-click jumps from search results to prompt/character/link detail modals.
- **Max Border-Radius Constraint (8px)**:
  - Capped all `border-radius` CSS rules to a maximum of 8px across cards, inputs, modals, toolbars, buttons, tags, chips, and swatches.
  - Replaced all pill designs (`border-radius: 9999px` or >8px) with clean, professional 4px/6px/8px radii.
- **Strict Zero-Gradients Enforcement**:
  - Completely eliminated all `linear-gradient` and `radial-gradient` rules from all CSS stylesheets, themes, canvas backdrops, buttons, headers, and card resize handles.
  - Replaced backdrops with crisp solid backgrounds and vector grid patterns.
- **Compressed Navbar & Theme Control Enhancements**:
  - Replaced theme select dropdown with a sleek theme icon button (`#theme-toggle-btn`) in the sidebar footer that seamlessly cycles through the 5 themes on click.
  - In compressed navbar mode, the theme control shrinks into a centered 36x36px icon button.
  - In compressed navbar mode, the top project brand icon flips to a hamburger icon (`fa-bars`) on hover, and clicking it expands the navbar back to full width.
  - Added persistence for sidebar collapsed/expanded state in `localStorage`.
- **UI State & Polish**:
  - Enhanced active/checked favorite star icons with gold accent styling (`var(--warning)`).

## [0.1.0] - 2026-09-10

### Added
- **Core Rust Infrastructure**:
  - Initialized Cargo package with Axum 0.7, Tokio async runtime, bundled Rusqlite, and R2D2 connection pooling.
  - Implemented WAL mode SQLite connection manager and idempotent schema migrations in `src/db.rs`.
  - Added centralized error handling with HTTP status code mapping in `src/main_types.rs`.
  - Added library export in `src/lib.rs` and executable entrypoint with graceful shutdown in `src/main.rs`.
- **Domain Models & DTOs**:
  - Defined serializable data structures for `Prompt`, `Character`, `Link`, `Tag`, `Board`, `BoardItem`, `SearchResult`, and `BackupManifest` in `src/models.rs`.
- **API Handlers**:
  - `src/handlers/prompts.rs`: Full CRUD, favorite toggling, category/character/tag filtering, and model parameters JSON support.
  - `src/handlers/characters.rs`: Full CRUD, visual traits, image avatar paths, and linked prompt aggregation.
  - `src/handlers/links.rs`: Full CRUD, automatic platform detection, and async YouTube oEmbed title/thumbnail metadata retrieval.
  - `src/handlers/tags.rs`: Polymorphic tagging for prompts, characters, and links with tag frequency counting.
  - `src/handlers/search.rs`: Parameterized multi-entity full text and tag search.
  - `src/handlers/boards.rs`: Visual planning board management, camera state sync (`pan_x`, `pan_y`, `zoom`), debounced vector drawing updates, and board item positioning/dimensions.
  - `src/handlers/upload.rs`: Local image uploads saved to `data/uploads/` with UUID-v4 naming and static serving at `/uploads/*`.
  - `src/handlers/backup.rs`: Dual-mode backup offering lightweight single-transaction JSON export/import and full compressed `.zip` project archive export/restore (clean SQLite database snapshot, JSON dump, manifest with checksums, and media uploads).
- **Frontend Single-Page Application**:
  - `static/index.html`: Responsive SPA layout with collapsible sidebar, view sections, modal dialogs, and slide-out resource drawer.
  - `static/style.css`: Design tokens for 5 global themes (`dark`, `light`, `sepia`, `pastel`, `cyberpunk`) and 4 canvas backdrops (`dot-grid`, `corkboard`, `graph`, `blank`).
  - `static/app.js`: Client router, active state manager, quick copy-to-clipboard, image drag-and-drop upload, and instant tag cloud filtering.
  - `static/canvas.js`: Hybrid corkboard and SVG vector diagramming engine featuring world-to-screen coordinate transformation, Space+drag/wheel pan and zoom, card dragging/resizing, sticky notes, freehand pen, vector shapes, smart dynamic snapping connectors with live recalculation, floating text labels, and multi-level undo/redo.
- **Testing & Verification**:
  - Built comprehensive integration test suite in `tests/api_tests.rs` covering prompts CRUD, character linkage, reference links, unified search, board items with vector drawings, and dual-mode backup/restore round-trip.

### Fixed & Hardened
- **Multi-byte UTF-8 Truncation**: Replaced raw byte slicing in `src/handlers/search.rs` and `src/handlers/boards.rs` with `safe_truncate` Unicode character scalar logic to prevent panics and HTTP 500 crashes on multibyte characters.
- **Orphaned Polymorphic Tagging**: Added database triggers `trg_delete_prompt_cleanup`, `trg_delete_character_cleanup`, and `trg_delete_link_cleanup` in `src/db.rs` and explicit handler deletions to eliminate orphaned `taggables` rows.
- **Entity Validation & Ownership**: Enforced entity existence verification for tag attachments and board item creation; validated board ownership on board item updates and deletions.
- **Input Validation**: Added blank/whitespace validation on prompt, character, and link updates to prevent empty record creation.
- **Large Payload Support**: Increased Axum request body limit to 50MB in `src/lib.rs` to allow full project archive restoration and high-resolution image uploads.
- **Archive Restore Integrity**: Enhanced `POST /api/backup/restore` with strict `manifest.json` parsing, count verification against archive contents, and `verification_status: verified` response.
- **Canvas Undo/Redo & Connectors**: Added `delete_draw` handling to canvas undo/redo; fixed interactive connector drag-and-drop targeting; implemented anchor-aware curved connector Bézier paths and viewport drag-and-drop pinning.
