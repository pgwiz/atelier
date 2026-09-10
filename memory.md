# Project Memory — Atelier

## System Overview
Atelier is a local-only, single-user content sketchbook and visual planning canvas built with Rust and vanilla frontend technologies. It serves both the REST API and the static frontend on `http://localhost:8080`.

## Architecture & Decisions
- **Backend**:
  - Rust 2021 edition.
  - `axum` 0.7 for HTTP routing and static file serving via `tower-http`.
  - `tokio` multi-threaded async runtime.
  - `rusqlite` bundled with `backup` feature to eliminate external SQLite C-library dependencies.
  - `r2d2` connection pooling with WAL journal mode, 5000ms busy timeout, and foreign key enforcement.
  - YouTube oEmbed async fetching via `reqwest` (with graceful fallback on failure or offline).
  - Dual-mode backup system:
    - Lightweight JSON mode (`/api/export`, `/api/import`) for fast data versioning.
    - Compressed `.zip` archive mode (`/api/backup/archive`, `/api/backup/restore`) containing clean SQLite checkpoint, JSON dump, manifest with entity counts and checksums, and `data/uploads/`.
- **Frontend & UI System (v0.2.0 Redesign)**:
  - Professional, enterprise-grade design inspired by Linear, Raycast, and GitHub.
  - Zero emojis across the entire project codebase, templates, scripts, and documentation.
  - Font Awesome 6 Free vector icon system with dual CDN and self-contained offline SVG mask stylesheet (`static/fontawesome.css`).
  - Max `border-radius: 8px` enforced across all CSS rules, eliminating pills and circular cards.
  - Strictly zero gradients (`linear-gradient` / `radial-gradient` completely absent); clean solid surfaces with crisp 1px borders.
  - 5 High-contrast themes (`dark`, `light`, `sepia`, `pastel`, `cyberpunk`) saved to `localStorage`.
  - Canvas engine (`static/canvas.js`):
    - Unified coordinate space: `translate(${panX}px, ${panY}px) scale(${zoom})`.
    - World <-> Screen coordinate transformations.
    - SVG layer for drawings, shapes, floating text, and dynamic connectors.
    - HTML layer for draggable/resizable cards (Prompts, Characters, Links, Sticky Notes).
    - Smart snapping connectors dynamically track card anchors and recalculate paths on card movement.
- **Phase 9: Projects-First Creative OS & Dual Storage**:
  - Central relational DB (`data/atelier.db`) handles indexing, pooling, and cross-project operations.
  - Dedicated project directories (`data/projects/<id>/`) contain an auto-synced, human-readable `project.json` snapshot plus media directories (`audio/`, `documents/`, `images/`, `videos/`, `exports/`).
  - Reload from disk endpoint (`POST /api/projects/:id/reload-json`) reconciles external edits or restored folders into SQLite.
  - Ordered Production Parts (`Scene`, `Chapter`, `Segment`, `Voiceover`) with lifecycle statuses (`Draft`, `In Progress`, `Ready`, `Done`), `completed_at` timestamps, and many-to-many entity links.
  - Canvas mini-parts: interactive cards on the planning canvas with clickable status badges and arrow connection anchors.
  - Custom Addons: in-app audio player with speed controls (0.75x to 2x), monospace document/script reader, PDF embed, and path-traversal-safe native OS File Explorer reveal (`explorer.exe /select,"<path>"`).
  - Multi-workspace operations: Deep Copy, Non-destructive Merge (with duplicate name suffixing), and Visual Transfer Workbench.
- **Phase 10: Project Card Redesign, Project Hub, AI Assistant & Canvas Overhaul**:
  - Redesigned Project Card: Replaces button clutter with a primary "Open Project" button + 3-dots actions dropdown menu (`fa-ellipsis-vertical`) with verified Font Awesome 6 icons.
  - Dedicated Project Hub (`#view-project-hub`): Management banner, Category Directives cards (Parts, Prompts, Characters, Media, Boards), and sortable "What Changed" recent activity timeline (`/api/projects/:id/activity`).
  - Advanced Settings & AI Assistant: Provider config (OpenRouter, OpenAI, Anthropic, Gemini, Groq, Ollama), masked API key input, and slide-out AI Assistant drawer (`#ai-chat-drawer`) with one-click Save-to-Project actions.
  - Centered Futuristic Bottom Floating Dock (`#bottom-dock`) with arrow-up expand drawer (`#dock-expand-drawer`).
  - Cyberpunk Chamfered Futuristic Edges (`clip-path: polygon(...)` bounded within 8px) with tech corner notches.
  - Configurable solid-color ambient background fade animation (Crimson Red `#dc2626` preset, speed, intensity, 100% zero gradients).
  - Canvas Overhaul: Dynamic contextual cursors (`crosshair`, `text`, `cell`, `move`, `se-resize`), seamless inline floating text editor (no browser `prompt()`), and dragging/moving for selected SVG shapes, text, and strokes.

## Key Rules & Invariants
- **Markdown file restriction**: Exactly 4 markdown files permitted in the repository: `README.md`, `changelog.md`, `memory.md`, and `agent.md`.
- **Zero Emoji Rule**: No emojis anywhere in HTML, JavaScript, CSS, Rust source, or Markdown files.
- **Max Radius Rule**: No element may exceed `border-radius: 8px`.
- **Zero Gradient Rule**: No `linear-gradient` or `radial-gradient` anywhere in CSS or backdrops.
- **SQL Safety**: All database interactions use prepared statements with parameter binding.
- **Tags**: Lowercased and trimmed automatically before insertion or querying.
- **Polymorphic Integrity**: SQLite triggers enforce cascaded deletions for `taggables` entries when parent prompts, characters, or links are deleted.
- **UTF-8 Safety**: String truncation uses `safe_truncate` Unicode scalar counts rather than raw byte slicing.
- **Payload Limits**: Axum `DefaultBodyLimit` set to 50MB to support full project `.zip` backup restores and image uploads.
- **Data directory**: SQLite database stored at `data/atelier.db`, uploaded media stored at `data/uploads/`. Both are gitignored.
- **Zip Slip Prevention**: Project package extraction sanitizes entry paths via `file.enclosed_name()` and checks against destination jail path, rejecting path traversal attacks.
- **Project Boundary Integrity**: Workspaces must retain at least one project; deleting the sole remaining project is rejected with 400 Bad Request.
- **Deep Copy & Merge Remapping**: Board items referencing parts (`entity_type == "part"`) are remapped to new part IDs during copy and merge operations.

## Verification Status
- Integration test suite in `tests/api_tests.rs` with 27 comprehensive tests (100% passing, 0 warnings, 0 failures):
  - `test_prompts_crud_and_tags`
  - `test_characters_crud_and_linkage`
  - `test_links_and_tags`
  - `test_boards_and_board_items`
  - `test_cascade_deletion_on_board_items`
  - `test_unified_search`
  - `test_dual_mode_backup_and_restore`
  - `test_validation_and_not_found_edge_cases`
  - `test_sql_safety_and_special_characters`
  - `test_utf8_multibyte_safe_truncation`
  - `test_tag_cleanup_on_entity_deletion`
  - `test_entity_validation_and_ownership`
  - `test_full_zip_archive_restore_and_verification`
  - `test_update_validation_empty_fields`
  - `test_phase9_projects_crud_and_json_sync`
  - `test_phase9_parts_crud_status_cycling_and_entities`
  - `test_phase9_attachments_and_file_streaming`
  - `test_phase9_filesystem_reveal_security`
  - `test_phase9_deep_copy_and_merge_and_transfer`
  - `test_phase9_export_and_import_project_package`
  - `test_phase9_zip_slip_rejection`
  - `test_phase9_cannot_delete_only_project`
  - `test_phase9_deep_copy_and_merge_remap_board_part_items`
  - `test_phase9_reload_json_with_new_unassigned_entities`
  - `test_phase10_settings_crud_and_bulk`
  - `test_phase10_project_activity_feed`
  - `test_phase10_ai_proxy_validation`

