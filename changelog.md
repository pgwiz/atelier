# Changelog

All notable changes to Atelier will be documented in this file.

## [0.4.1] - 2026-09-10

### Fixed & Hardened
- **Planning Board Non-Sticky Cards Visibility & Metadata Enrichment**:
  - Fixed issue where only sticky notes were visible on the planning canvas while prompt, character, link, and part cards remained invisible or unstyled.
  - Implemented `enrich_board_item_metadata` in `src/handlers/boards.rs` to reliably join and serve `entity_title`, `entity_subtitle`, `entity_image`, and `entity_tags` across both `get_items_for_board` and `get_board_item_by_id`, with automatic fallback titles and subtitles if an entity reference is missing.
  - Added robust property fallback chains in `static/canvas.js` (`createCardElement`) resolving `entity_title || title`, `entity_subtitle || snippet || body || description`, `entity_image || image || thumbnail_url`, and safe array handling for tags.
  - Added type-specific CSS classes (`.card-prompt`, `.card-character`, `.card-link`, `.card-part`, `.card-note`) with distinct 3px solid top accents, themed badges, line-clamped snippets, and enforced `min-width: 200px; min-height: 120px;` so cards are prominently visible on any backdrop.
  - Unified library drawer and drag-and-drop pinning via `atelierCanvas.pinEntityAt(type, id)`.
- **Canvas Floating Text Selection & Disappearance Fix**:
  - Eliminated browser GPU tile clipping / rasterizer failure where clicking text caused it to completely disappear. Root cause: CSS `filter: drop-shadow(...)` applied on child elements inside a 100,000px SVG layer caused Chromium/Edge Skia rasterization to fail.
  - Removed `filter: drop-shadow(...)` entirely from SVG selection. Introduced `<g id="svg-selection-group">` with crisp dashed pink outline (`.svg-selection-outline`) for vector shapes and text.
  - Resolved secondary root cause of disappearing text: clicking inside the inline textarea triggered un-stopped `pointerdown` events bubbling to `#canvas-stage-wrapper`, causing `handlePointerDown` to either re-invoke `promptForText` (which removed the editor) or deselect. Added full event bubbling isolation (`stopPropagation` on `pointerdown`, `pointerup`, `mousedown`, `click`, `dblclick`) to the inline editor.
  - Added pending text commit protection: when an inline editor is already active, any subsequent canvas click or tool switch commits the pending text instead of discarding it.
  - Added camera tracking for active inline text editing: `applyTransform` keeps the active inline editor anchored and scaled during camera zoom and pan.
  - Added multi-line text support in SVG using `<tspan>` with line-height relative positioning (`dy="1.3em"`), expanded text hit-testing via invisible 10px stroke (`paint-order: stroke fill; stroke: transparent;`), and multi-line selection bounding box fallback.
  - Set `dominant-baseline="hanging"` on `<text>` elements and aligned inline text editor coordinates directly to world-to-screen hanging baseline.
  - Added single-click selection, double-click in-place editing with pre-filled selection, auto-resizing inline editor, and clean deletion on empty commit.
  - Enabled active color dot updates for selected SVG elements and cards.
  - Added integration test `test_board_items_metadata_enrichment_and_fallbacks` covering multi-entity pinning, tag joining, and fallback metadata (28 passing tests in total).
- **View Header Actions Arrangement**:
  - Styled `.header-actions` across all views with `display: flex; flex-direction: row; align-items: center; gap: 0.65rem; white-space: nowrap;` and vertically centered items in `.view-header`.
  - Arranged "New Project" and "Import Package" neatly side-by-side on a single row with balanced button proportions and proper vertical centering.
- **Documentation & Repository Memory Compaction**:
  - Consolidated and updated repository truth across `README.md`, `agent.md`, `memory.md`, and `changelog.md`.
  - Re-aligned Project Structure tree, SQLite schema migrations (`settings`), and API specifications (`GET /api/projects/:id/activity`, `GET/PUT/POST /api/settings`, `POST /api/ai/chat`).
  - Confirmed 100% compliance with repository rules: zero emojis, max 8px border-radius, zero CSS gradients, and strictly 4 markdown files in workspace.

## [0.4.0] - 2026-09-10

### Added
- **Aesthetic Compound Popup & Modal Overhaul (All 12 Modals)**:
  - Wrapped form controls in cohesive `.compound-panel` containers with subtle 1px borders and solid surface backgrounds.
  - Implemented dense 2-column input grids (`.form-grid-2col`, `.form-row-dense`, `.form-input-dense`) with 6px-8px padding and 0.85rem font size for space efficiency.
  - Added collapsible "Advanced Options / Parameters" toggle button in Prompt and Character modals with chevron indicator.
  - Streamlined action footers with crisp Font Awesome 6 icons and right-aligned buttons.
  - Introduced unified in-app confirmation modal (`#modal-confirm`) replacing all browser-native `confirm()` dialogs across project, part, prompt, character, link, and board deletions.
  - Strictly enforced max 8px border-radius and zero gradients across all modals.
- **Redesigned Project Card Display (`#view-projects`)**:
  - Replaced cluttered multi-button rows with a prominent primary "Open Project" button navigating directly to the Project Hub.
  - Added sleek 3-dots actions dropdown (`fa-ellipsis-vertical`) housing Edit Details, Open Folder, Reload JSON, Export ZIP, Duplicate Project, Merge Project, Transfer Workbench, and Delete Project.
  - Interactive category stat chips (`.stat-chip-card`) for Parts, Prompts, Cast, References, and Boards allowing 1-click workspace switching and direct view navigation.
- **Dedicated Project Hub Page (`#view-project-hub`)**:
  - Management banner displaying active project details, lifecycle progress bar, created/updated dates, and folder path with reveal action.
  - Clickable status pill cycling project status (`Draft` -> `In Progress` -> `Ready` -> `Done`) with immediate SQLite persistence.
  - 5 interactive Category Directive Cards with distinctive accent color icons and live counts jumping directly into management views.
  - "What Changed" Recent Activity Timeline powered by `/api/projects/:id/activity`, aggregating updates across all project child entities with sorting by recency, entity type, and title.
- **Advanced Settings: AI Assistant & API Keys (`#view-settings`)**:
  - Unified settings storage in SQLite `settings` table (`key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL`) with `/api/settings` and `/api/settings/bulk` endpoints.
  - AI Assistant provider selector supporting OpenRouter, OpenAI, Anthropic, Google Gemini, Groq, and local Ollama.
  - Masked API key input with show/hide eye toggle, model ID override, and custom base URL configuration.
  - Backend proxy endpoint (`POST /api/ai/chat`) with mock test mode and offline test coverage.
  - Real-time connection testing button (`#btn-test-ai-connection`) with visual status pills.
  - Interface layout mode switch between Classic Left Sidebar and Futuristic Bottom Floating Dock.
  - Cyberpunk Chamfered Edges toggle (`.chamfered-mode`) applying 6px geometric corner cuts with zero gradients and max 8px bounds.
- **Futuristic Bottom Floating Dock & Slide-Up Drawer**:
  - Centered bottom floating dock (`#bottom-dock`) with tooltips, view navigation, and quick AI Assistant trigger.
  - Slide-up expandable project drawer (`#dock-expand-drawer`) showing project status, category counts, and rapid action shortcuts.
- **Configurable Ambient Solid Background Fade Animation**:
  - Fullscreen breathing pulse overlay (`#ambient-fade-overlay`) utilizing pure solid colors (100% zero gradients).
  - Presets for Crimson Red (`#dc2626`), Amber (`#d97706`), Cyan (`#0284c7`), Purple (`#9333ea`), and Emerald (`#059669`) plus custom hex input.
  - Adjustable cycle speeds (4s, 8s, 12s) and intensity slider (5% - 30%).
- **Complete Planning Board Overhaul (`static/canvas.js` & `static/style.css`)**:
  - Dynamic contextual mouse cursors based on active tool (`crosshair` for drawing/shapes/connectors, `text` for text, `cell` for stickies, `move` for dragging, `se-resize` for resize, `grab`/`grabbing` for panning).
  - Seamless inline canvas text editor overlay replacing browser `prompt()` on click and supporting double-click in-place editing for existing text elements.
  - Inline board renaming directly from header title without browser `prompt()`.
  - Full mouse dragging/moving for selected SVG shapes, text, and strokes in select mode.
  - Arrow key nudging for selected SVG elements and pinned cards (10px standard, 20px Shift, 1px Alt).

### Fixed & Hardened
- **Project Hub Rendering & View Switching**:
  - Removed suppressing inline `style="display: none;"` from `#view-project-hub` and `#view-settings` in `static/index.html`.
  - Added `display: flex !important;` to `.view-section.active` in `static/style.css` and explicit `style.display` toggling in `switchView()` inside `static/app.js` to prevent inline style overrides.
  - Refactored `switchProject(projectId)` in `static/app.js` to normalize project IDs to integer, prevent stale active project states, automatically transition to Project Hub when switching from the projects grid view, and await hub rendering.
  - Enhanced `renderProjectHub()` with active ID synchronization, fresh `/api/projects/:id` fetching, null-safe directive counts (`countParts`, `countPrompts`, `countChars`, `countLinks`, `countBoards`), and a graceful empty state when no projects exist.
  - Fixed hash router (`handleHashRoute`) to recognize `#/projects/:id`, `#/projects/:id/hub`, and `#/projects/:id/project-hub` and route directly to Project Hub.
  - Hardened "What Changed" Activity Feed (`renderProjectActivityTimeline`) with cross-browser date parsing (`replace(' ', 'T')`), safe null-guarded title sorting, display of `item.details` annotations, and click-to-navigate interaction for all activity items.
  - Bound dynamic status dot color via `getStatusDotColor(p.status)` and added card-level click navigation in `renderProjectsGrid()`.
  - Added comprehensive filter resets (search, type, status, category, character, favorite, platform) when navigating via the 5 Category Directive Cards so active project entities are immediately visible.
- **Offline Vector Icon Overhaul (`static/fontawesome.css` & `static/index.html`)**:
  - Completely removed external cdnjs Font Awesome stylesheet link from `static/index.html` to eliminate external network requests, offline timeouts, and font rendering conflicts.
  - Resolved "box icons" defect where icons rendered as solid black/colored squares due to undefined CSS mask images on `currentColor` pseudo-elements.
  - Mapped all 93 unique Font Awesome icon classes used across HTML, JS, and CSS to self-contained SVG data URI masks with 0 unmapped icons.
  - Added `.fas, .far, .fab` short alias support to the primary offline mask selector and pseudo-elements.
  - Added safe hollow circle fallback mask on `.fa, .fa-solid, .fas, .far, .fab` ensuring dynamic/unknown icons never render as solid filled blocks.
  - Added `@keyframes fa-spin` for smooth rotation on `.fa-spin` loader icons.
- **Canvas Script Parsing**: Resolved fatal syntax error in `static/canvas.js` caused by an unmatched closing brace inside `handlePointerUp` that prevented the script from loading.
- **In-App Confirmation & Prompt Dialogs**: Fixed ID mismatch in `showConfirmDialog` between JS (`btn-confirm-proceed`) and HTML (`btn-confirm-ok`), and implemented in-app `showPromptDialog` to eliminate native browser `prompt()` on project duplication and `confirm()` on media attachment deletion.
- **Project Hub Banner & Actions**: Fixed folder path binding to `hub-project-path`, added status dot color binding to `hub-project-dot`, and wired event listeners for `btn-hub-copy-path` (clipboard copy) and `btn-hub-reveal-folder` (explorer reveal).
- **Sidebar AI Button Trigger**: Wired `btn-sidebar-ai` in sidebar footer to open the AI Assistant slide-out drawer.
- **Settings API & Layout Persistence**: Added POST support to `/api/settings` and enabled `PUT /api/settings/:key` calls in client layout and chamfered edge toggles, preventing 405 Method Not Allowed errors.
- **AI Proxy Base URL Override**: Enabled custom `base_url` resolution for OpenAI, OpenRouter, Groq, and Anthropic providers in `src/handlers/ai.rs`.
- **Modal Ergonomics**: Added auto-expansion of advanced parameter toggles when editing existing prompts and characters with configured advanced options.
- **Zero-Emoji Compliance**: Verified 0 emojis across all project code, templates, and documentation.
- **Zero-Gradient Enforcement**: Confirmed 0 linear or radial gradients across all stylesheets and canvases.
- **Comprehensive API Integration Suite**: Added edge case tests in `tests/api_tests.rs` for Settings CRUD, 404 Project Activity Feed, and AI Proxy validation (27/27 integration tests passing).

## [0.3.0] - 2026-09-10

### Added
- **Projects-First Creative OS Architecture**:
  - Central SQLite indexing (`data/atelier.db`) coupled with dedicated folder per project (`data/projects/<id>/`).
  - Auto-synced disk manifest (`project.json`) and structured media folders (`audio/`, `documents/`, `images/`, `videos/`, `exports/`).
  - Disk reload endpoint (`POST /api/projects/:id/reload-json`) to reconcile external edits or backups.
  - Projects dashboard as root landing view (`#view-projects`) with progress calculation, status chips, and metadata cards.
  - Collapsible sidebar project switcher with stat chips (`Prompts: X`, `Cast: Y`, `Links: Z`, `Boards: W`, `Parts: V`) and compressed 36x36px icon mode.
- **Ordered Production Parts (Scenes, Chapters, Segments, Voiceovers)**:
  - Sequence-indexed production workflow with status lifecycle (`Draft` -> `In Progress` -> `Ready` -> `Done`) and `completed_at` timestamps.
  - Dedicated production parts view (`#view-parts`) with timeline, filtering, and script/notes editor.
  - Interactive canvas mini-parts on the visual planning canvas with status cycling and connector anchors.
  - Many-to-many asset linkage associating parts with characters, prompts, and reference links.
- **Custom Addons & Media Attachments**:
  - In-app audio player supporting 0.75x to 2.0x variable playback speeds and scrubbing.
  - Monospace document/script reader, PDF embedded viewer, and video player modal.
  - Native OS File Explorer reveal (`POST /api/fs/reveal` and `POST /api/projects/:id/open-folder`) with path traversal security.
  - Raw binary file streaming at `/files/projects/:id/*path`.
- **Multi-Workspace Operations**:
  - Deep copy (`POST /api/projects/:id/copy`) duplicating database entities, media folders, and auto-syncing `project.json`.
  - Non-destructive workspace merge (`POST /api/projects/:id/merge`) with duplicate title collision protection and asset preservation.
  - Visual transfer workbench (`POST /api/projects/transfer`) supporting granular selective moves and copies across projects.
  - Standalone project package export/import (`.zip`) with checksum verification and manifest reconciliation.

### Fixed & Hardened
- **Zip Slip Vulnerability in Archive Import**: Enforced `file.enclosed_name()` and canonical jail-boundary verification during `.zip` package extraction to block arbitrary filesystem traversal attacks.
- **Board Item Part Remapping in Deep Copy & Merge**: Corrected second-pass remapping for board items of type `part` to ensure `entity_id` references the cloned/merged part ID in the target workspace.
- **Workspace Boundary Integrity**: Blocked deletion of the last remaining project with an explicit 400 Bad Request guard, and added transactional cascading across all child entity tables on project deletion.
- **Windows File Explorer Path Normalization**: Stripped UNC path prefix (`\\?\`) before launching `explorer.exe` to prevent native explorer process failures on Windows.
- **Transfer Items Response Contract**: Added `transferred_count` to the `POST /api/projects/transfer` JSON response to align with frontend toast notification expectations.
- **Manual Disk Reload SQL Parameter Alignment**: Fixed parameter mismatch in `project_parts` SQL insertion during disk reload, and gracefully handled unassigned or zero project IDs.
- **Hash-Routing & Permalinks**: Implemented client-side hash routing (`/#/projects/:id/...`) supporting browser history navigation and project permalink copying.
- **Strict Design System Adherence**: Enforced max 8px border-radius, zero gradients, and zero emojis across all newly added Phase 9 UI components.

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
