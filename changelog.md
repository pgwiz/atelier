# Changelog

All notable changes to Atelier will be documented in this file.

## [0.5.2] - 2026-09-13

### Added & Redesigned
- **Dynamic Board Creation Modal & Unified Modal Design System Overhaul**:
  - Redesigned `#modal-board` matching the user's compact layout template: icon badge (`.modal-icon-badge`), category tracking section headers (`.modal-section-header`) with required badges, board name input with inline Randomize button and live `0/50` character counter.
  - Dense two-column selection grid for canvas grid style (Blank Canvas, Dot Grid, Blueprint Grid, Isometric Grid) and studio theme (Dark Room, Clean Light, Sepia Archive, Pastel Studio, Cyberpunk Neon).
  - Quick-start board presets (General Creative, Storyboarding, Asset Map, Moodboard) that instantly configure name, backdrop pattern, and theme.
  - Live SVG mini-canvas preview box (`#board-preview-canvas`) reflecting selected background pattern and theme accent swatches in real time without gradients.
  - Keyboard shortcut footer (`Ctrl + Enter` to create/submit).
  - Extended the unified modal design system across all application dialogs (Prompts, Characters, Links, Projects, Parts, Addons/Attachments, Merge, Transfer, Confirm) with consistent badge headers, clean section dividers, dense grids, and theme variable inheritance across all studio themes.
  - Global `Ctrl+Enter` shortcut support across all modal dialogs.
- **Vertical Canvas Zoom Controls**:
  - Re-oriented canvas zoom controls (`#canvas-zoom-controls`) in `static/index.html` and `static/style.css` vertically (`flex-direction: column`, stacked: `+`, zoom percentage display, `-`, subtle horizontal divider, `1:1` reset, `Fit` all content).
- **Interactive Vector Shape Resizing & Enlargement**:
  - Implemented 8 interactive resize handles (`nw`, `n`, `ne`, `e`, `se`, `s`, `sw`, `w`) on selection of any geometric vector shape (`rect`, `ellipse`, `triangle`, `diamond`, `star`) and 2 endpoint handles (`p1`, `p2`) for lines and arrows in `static/canvas.js`.
  - Real-time click-and-drag scaling with zoom-independent handle sizing, cursor tracking (`nwse-resize`, `nesw-resize`, `ns-resize`, `ew-resize`, `crosshair`), and pointer capture for smooth gestures.
  - Auto-centering attached text during shape resize.
  - Real-time synchronization with the canvas properties panel (bidirectional live sync via `input` and `change` events on geometry fields).
  - Changes automatically persist to `drawingData` and backend storage on release via debounced `saveDrawing()`.

### Fixed
- **Duplicate Board Submission**: Removed redundant inline `onsubmit` handler from `#form-board` in `static/index.html` that previously caused duplicate board creations when combined with `addEventListener` in `static/app.js`.
- **Board Submission Validation**: Added client-side name validation guard in `handleBoardSubmit` to prevent creating untitled boards.
- **Resize Gesture Performance**: Optimized canvas resize and drag movements to synchronize properties inputs in-place (`syncGeometryInputs`) without destroying and reconstructing panel DOM elements on every mousemove.
- **Resize Handle Double-Click Isolation**: Suppressed `dblclick` propagation on SVG resize handles, preventing unintentional activation of underlying shape text editing.

## [0.5.1] - 2026-09-13

### Added
- **Atelier Mini UI Launcher & Control Panel (`atelier-launcher.exe`)**:
  - Replaced post-install and desktop console terminal launch with a native Windows Control Panel GUI application compiled with Windows GUI subsystem (strictly no black CLI console window).
  - **Live Server Status**: Real-time status indicator badge displaying `[ RUNNING ]` (emerald green) or `[ STOPPED ]` (slate gray) with active background polling.
  - **Dynamic Port Configuration**: Numeric port input (1024 to 65535) with "Apply Port" button enabling instant port switching (e.g. 8080, 8081, 8082, 3000) with automatic zero-downtime server restart.
  - **Studio URL & Direct Browser Launch**: Prominent clickable URL link (`http://localhost:<PORT>`) and primary "Open Studio in Browser" button that launches the active URL in the default browser.
  - **Server Process Supervisor**: Clean "Start Server" / "Stop Server" toggle button managing `atelier.exe` in background without console window popup (`CreateNoWindow = true`, `UseShellExecute = false`).
  - **Quick Directory Navigation**: Dedicated "Open Data Folder" (opens `%LOCALAPPDATA%\Atelier\data` or `./data`) and "Open Project Directory" buttons opening Windows File Explorer.
  - **Preferences & System Tray**: Auto-open browser toggle, minimize-to-tray on close, and NotifyIcon integration with embedded application icon, status tooltip, and right-click menu (Open Browser, Show Control Panel, Toggle Server, Open Data Folder, Exit Atelier).
  - **Design System Compliance**: Cohesive dark theme (`#0f1117` background, `#181b24` surface cards, `#2a2e3d` borders, `#2563eb` primary blue), strictly zero gradients, max 8px border-radius, and strictly zero emojis across all code and labels.
- **Installer & Portable Distribution Integration**:
  - Updated Inno Setup script (`installer/atelier.iss`) to package `atelier-launcher.exe` as the primary application target for desktop and Start Menu shortcuts, uninstall display icon, and post-installation launch.
  - Added Start Menu entry for "Atelier Server (Console)" allowing terminal users to run raw CLI backend directly if desired.
  - Updated `installer/run-atelier.bat` in portable distribution to launch `atelier-launcher.exe --portable` without lingering console windows.
  - Updated `build-windows-installer.ps1` with automated C# compilation step, pre-build process termination to prevent release binary file locks, and multi-binary packaging.
- **Backend Server & Launcher Integration**:
  - Added `--server` and `--launcher` CLI arguments in `src/main.rs`.
  - Added seamless automatic delegation to `atelier-launcher.exe` when `atelier.exe` is launched without `--server`, instantly detaching console window (`FreeConsole`) and forwarding `--portable` / `--port` arguments.
  - Implemented single-instance mutex activation with broadcast window restore (`WM_SHOW_ATELIER_LAUNCHER`).
  - Added pre-flight port collision protection preventing server crashes when selecting occupied ports.
  - Added Per-Monitor DPI awareness (`SetProcessDPIAware`) for crisp typography on high-DPI displays.
  - Added static asset directory resolution fallback for developmental target builds.

## [0.5.0] - 2026-09-12

### Added
- **Installable Windows Build (Setup Wizard .exe)**:
  - Created official Inno Setup 6 installer (`dist/Atelier-Setup-v0.1.0-x64.exe`, 5.12 MB, LZMA2/max compression).
  - Modern setup wizard with per-user installation (`%LOCALAPPDATA%\Programs\Atelier`, requiring no administrator privileges) and optional all-users mode.
  - Generates Start Menu shortcut, optional Desktop shortcut, and clean Windows uninstaller registered in `Settings > Apps > Installed apps`.
  - Post-install option to launch Atelier immediately upon setup completion.
- **Zero-Install Portable Windows Release (.zip)**:
  - Packaged standalone portable archive (`dist/Atelier-v0.1.0-windows-x64-portable.zip`, 4.50 MB) containing `atelier.exe`, `static/`, `atelier.ico`, `README.md`, and one-click `run-atelier.bat` launcher.
- **Embedded Windows Icon & Executable Metadata**:
  - Generated multi-resolution Windows icon `installer/atelier.ico` (16x16, 24x24, 32x32, 48x48, 64x64, 128x128, 256x256).
  - Configured `winres` in `Cargo.toml` and `build.rs` to embed application icon, Product Name (`Atelier`), Description (`Atelier - Creative Social Media & Content Planning Studio`), File Version (`0.1.0`), and Copyright into `atelier.exe`.
- **Smart Path & Storage Architecture**:
  - Implemented executable-relative path detection in `src/main.rs`: automatically locates `static/` bundled next to the binary or in the working directory.
  - User data separation: when installed, project databases and uploads are cleanly placed in `%LOCALAPPDATA%\Atelier\data` (or `%APPDATA%\Atelier\data`), ensuring user projects are completely safe and preserved during app updates or re-installations.
  - Portable mode: automatically uses `./data` next to the executable if `./data` exists or when `--portable` is specified.
  - Custom data directory override via `--data-dir <PATH>` or `ATELIER_DATA_DIR` environment variable.
- **Automatic Browser Launch**:
  - When launched, `atelier.exe` automatically opens the studio interface in the user's default browser (`cmd /C start http://localhost:8080`).
  - Added CLI flags: `--port <PORT>`, `--data-dir <PATH>`, `--portable`, `--no-browser`, `--headless`, `-h`/`--help`, `-v`/`--version`.
- **Automated Build Script**:
  - Added `build-windows-installer.ps1` to automate release compilation, Inno Setup installer packaging, portable ZIP compression, and SHA256 verification.

## [0.4.4] - 2026-09-10

### Added & Redesigned
- **Filter Bars Space Efficiency & Single-Line Unified Control Bars**:
  - Overhauled filter bars across all primary views (Projects, Parts, Prompts, Characters, Links, Boards) from multi-line space-consuming forms into ultra-compact, sleek single-line unified control bars with horizontal overflow protection.
  - Reduced vertical footprint: unified surface container (`var(--bg-card)`) with 1px subtle borders, 6px radius, compact 30px inputs/selects, and tightened header/filter bar margins.
  - Implemented dense select dropdowns, inline search inputs with integrated vector magnifying glass icons, and compact toggle/filter pills.
  - Completed sort controls across all 6 views: added sorting to Parts (`Timeline Order`, `Title A-Z`, `Status`), Prompts (`Recently Added`, `Title A-Z`, `Category`), Characters (`Name A-Z`, `Recently Added`), Links (`Recently Added`, `Title A-Z`, `Platform`), Boards (`Recently Updated`, `Name A-Z`), and Projects (`Recently Updated`, `Name A-Z`, `Completion %`).
  - Streamlined Unified Search & Tag Cloud view with compact input padding and dense filter pills.
- **AI Integration UI Compliance & Feature Expansion**:
  - **Hub Banner & Path Integration**: Added dedicated inline AI Project Directives & Analysis button (`#btn-hub-ai-path`) directly inside the project folder path row with automated project analysis prompts; enhanced `#btn-hub-open-ai` with crisp `.btn-hub-ai` styling and flex container alignment.
  - **Parts AI Scene Generator**: Added quick "AI Scenes" action button (`#btn-parts-ai-scene`) to Production Parts header, completing AI quick actions across all creative repository views (Prompts, Characters, Parts, Hub).
  - **Sidebar AI Assistant Trigger**: Fully styled `#btn-sidebar-ai` with theme tokens and automatic collapsed sidebar handling (icon-only centered mode with hidden label).
  - **Strict Design System Compliance**:
    - Purged hardcoded accent colors (`#ec4899`) from `#dock-btn-ai`, `.ai-sparkle-icon`, `.connection-status-pill`, `.canvas-inline-editor`, and `.svg-selection-outline`, standardizing on theme tokens `var(--primary)`, `var(--success)`, `var(--danger)`, and `var(--border-focus)`.
    - Fixed active dock AI button text color (`.dock-btn-ai.active`) to use `var(--primary-text)` ensuring high contrast against primary background.
    - Defined default solid surface and border styling on `.connection-status-pill` for pending test states.
    - Enforced max 8px border-radius across all AI components (chat bubbles 6px, buttons 4px, inputs 4px/6px, badges 4px).
    - Guaranteed 100% zero gradients (`linear-gradient` / `radial-gradient` = 0) with solid surfaces and crisp 1px borders.
    - Verified strictly zero emojis across all code, markup, and generated messages (crisp Font Awesome 6 icons throughout).
  - **AI Model Parameters & Settings**:
    - Added configurable Temperature (`0.0` - `1.0`), Max Tokens, and Custom Studio Directives / System Prompt inputs to the AI Settings card in `#view-settings`.
    - Integrated parameters into local storage, `/api/settings/bulk` persistence, and `/api/ai/chat` request payloads.
  - **AI Actions in Chat Drawer & Modals**:
    - Expanded AI chat response actions: Copy to clipboard with secure fallback (`document.execCommand`), Save as Prompt, Save as Character, Add Scene Part, Add to Project (appends to active project with toast notification), and Regenerate.
    - Added clean markdown formatting (bold, code blocks `<pre><code>`, and inline `<code>`) within assistant chat bubbles.
    - Added quick AI generation entrypoints: "AI Generate" in Prompts, "AI Persona" in Characters, "AI Scenes" in Parts, and "AI Enhance" in Prompt modal.
- **Bug Fixes & UI Stability**:
  - Fixed prompt filter persistence bug where `loadPrompts()` bypassed active filters and rendered unfiltered items.
  - Fixed Project Hub directive card navigation resetting filters after view initialization.
  - Fixed AI drawer project context desynchronization when switching active projects via workspace dropdown.

## [0.4.3] - 2026-09-10

### Added
- **Planning Board Extended Vector Palette & Shapes Popover**:
  - Implemented modular toolbar popover (`#shapes-flyout`) expanding geometric capabilities with Rectangle, Circle, Triangle, Diamond, Star, Line, and Arrow.
  - Added mathematical 5-point star generation (`calculateStarPoints`) and polygon renderers for triangle, diamond, and star.
  - Added keyboard shortcuts for rapid shape switching: `R` (Rectangle), `O` (Circle/Ellipse), `L` (Line), `A` (Arrow).
- **Text Inside Geometric Shapes**:
  - Supported centered embedded SVG text inside Rectangle, Ellipse, Triangle, Diamond, and Star.
  - Added double-click in-place editing for shape text with real-time word wrapping and dynamic contrast calculation (`getContrastColor`).
- **Hover Selectable Affordances**:
  - Added visual hover affordances across cards (`.board-card:hover`) and SVG vector elements (`.canvas-svg-item:hover`) featuring crisp dashed borders and subtle glow.
  - Provided clear visual indication that any canvas element can be selected, moved, or customized.
- **Stationary Right-Click Context Action Menu**:
  - Preserved right-click drag pan across background and cards while triggering a custom contextual action menu on stationary right-click (< 4px movement).
  - Contextual actions for cards: Copy (`Ctrl+C`), Duplicate (`Ctrl+D`), Layer Forward/Backward/Front/Back, Color Swatches, and Delete.
  - Contextual actions for vector elements: Edit Label (`fa-font`), Copy, Duplicate, Layer Stacking, Color Swatches, and Delete.
  - Contextual actions for empty canvas: Paste (`Ctrl+V`), New Sticky Note (`N`), Add Text (`T`), Fit to View, and Reset Zoom.
- **Element Properties Tab & Floating Inspector Panel**:
  - Added floating inspector drawer (`#canvas-properties-panel`) and synced "Properties" tab in the library drawer (`#canvas-drawer`).
  - Live two-way property editing for X, Y, Width, Height, Stroke Color, Fill Color, Stroke Width (1px, 2px, 4px, 8px), Dashed Style, Text Label, Font Size, and Layer Stacking.
- **Board Image Export (Retina 2x PNG & Vector SVG)**:
  - Added export dropdown popover (`#canvas-export-menu`) with PNG image export, SVG vector export, and JSON archive export options.
  - Offscreen 2x retina HTML5 canvas rendering for PNG export capturing backdrop, vector strokes, shapes, and cards with high-fidelity typography and drop shadows.
  - Standalone well-formed SVG export (`exportBoardAsSvg`) producing standards-compliant vector graphics files.
- **Clipboard Copy, Paste, Duplicate & Image Pasting**:
  - Implemented `Ctrl+C` (copy card or vector element), `Ctrl+V` (paste at cursor or offset), and `Ctrl+D` (duplicate in-place).
  - Intercepted OS clipboard paste (`window.addEventListener('paste')`) and drag-and-drop: uploads image blobs to `/api/upload`, creates reference links, and pins image cards onto the canvas. Text pastes as sticky notes.

## [0.4.2] - 2026-09-10

### Fixed & Hardened
- **Planning Board Drawing Engine & SVG Coordinate Alignment**:
  - Resolved root-cause issue where freehand strokes, shapes, and vector drawings were invisible on the canvas with zero console errors. Root cause: `.canvas-svg-layer` had hardcoded `top: -50000px; left: -50000px; width: 100000px; height: 100000px;` without an SVG viewBox matching this offset, which displaced the internal SVG coordinate origin `(0, 0)` 50,000 pixels off-screen away from `.canvas-world`.
  - Re-aligned `.canvas-world` and `.canvas-svg-layer` to `top: 0; left: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none;`, precisely synchronizing the vector SVG coordinate origin with HTML card coordinates and the viewport transformation matrix.
  - Added explicit SVG attributes `width="100%" height="100%" style="overflow: visible;"` on `<svg id="canvas-svg">` to ensure browser rendering engines never calculate zero dimensions (which per SVG spec disables child rendering).
  - Enhanced `renderActiveStroke()` in `static/canvas.js` to render immediate visual feedback for `activeStrokePoints.length >= 1`, drawing a crisp round endpoint dot on mouse press (`M x y L x+0.1 y+0.1`) and smoothly expanding the path as the cursor moves.
  - Hardened pointer event capture and gesture isolation: added `dragstart` listener prevention, pointer down isolation for floating toolbars, pointer capture (`setPointerCapture` / `releasePointerCapture`) so fast gestures never drop strokes, and `pointercancel` listener to cleanly reset drawing state if a gesture is interrupted.
  - Added safe fallback property chains (`this.currentColor || '#3b82f6'`, `this.currentStrokeWidth || 2`) across all stroke, shape, and connector preview renderers.
  - Added dynamic DOM element re-initialization in `loadBoard()` ensuring canvas SVG groups are always reliably resolved.
  - **Right-Click Canvas / Notebook Dragging**:
    - Enabled right mouse button (`e.button === 2`) drag for smooth panning of the notebook/canvas board across all tools.
    - Added `contextmenu` default prevention on `#canvas-stage-wrapper` to prevent the browser context menu from interrupting right-click panning.
    - Restricted card dragging, resizing, and connector anchors to primary left click (`e.button === 0`), allowing right-click drag anywhere across cards or background to seamlessly pan the canvas.
    - Debounced camera save to SQLite on right-click pan release.
  - Confirmed all 28 backend integration tests pass cleanly and zero JavaScript syntax errors exist.

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
