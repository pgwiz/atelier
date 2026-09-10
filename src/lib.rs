pub mod db;
pub mod handlers;
pub mod main_types;
pub mod models;

pub use main_types::{AppError, AppState};

use axum::{
    routing::{delete, get, patch, post},
    Router,
};
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;

use handlers::{
    backup::{export_archive, export_json, import_json, restore_archive},
    boards::{
        create_board, create_board_item, delete_board, delete_board_item, export_single_board,
        get_board, list_board_items, list_boards, patch_board_item, update_board,
        update_board_drawing,
    },
    characters::{
        create_character, delete_character, get_character, list_characters, update_character,
    },
    links::{create_link, delete_link, get_link, list_links, update_link},
    prompts::{
        create_prompt, delete_prompt, get_prompt, list_prompts, toggle_favorite, update_prompt,
    },
    search::search_handler,
    tags::{attach_tag, detach_tag, list_tags},
    upload::upload_file,
};

pub fn create_app(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let api_router = Router::new()
        // Prompts
        .route("/prompts", get(list_prompts).post(create_prompt))
        .route(
            "/prompts/:id",
            get(get_prompt).put(update_prompt).delete(delete_prompt),
        )
        .route("/prompts/:id/favorite", post(toggle_favorite))
        // Characters
        .route("/characters", get(list_characters).post(create_character))
        .route(
            "/characters/:id",
            get(get_character).put(update_character).delete(delete_character),
        )
        // Links
        .route("/links", get(list_links).post(create_link))
        .route(
            "/links/:id",
            get(get_link).put(update_link).delete(delete_link),
        )
        // Tags
        .route("/tags", get(list_tags))
        .route("/:entity_type/:id/tags", post(attach_tag))
        .route("/:entity_type/:id/tags/:tag_name", delete(detach_tag))
        // Unified Search
        .route("/search", get(search_handler))
        // Boards
        .route("/boards", get(list_boards).post(create_board))
        .route(
            "/boards/:id",
            get(get_board).put(update_board).delete(delete_board),
        )
        .route("/boards/:id/drawing", patch(update_board_drawing))
        .route(
            "/boards/:id/items",
            get(list_board_items).post(create_board_item),
        )
        .route(
            "/boards/:id/items/:item_id",
            patch(patch_board_item).delete(delete_board_item),
        )
        .route("/boards/:id/export", get(export_single_board))
        // Image Upload
        .route("/upload", post(upload_file))
        // Backup & Restore
        .route("/export", get(export_json))
        .route("/import", post(import_json))
        .route("/backup/export", get(export_json))
        .route("/backup/import", post(import_json))
        .route("/backup/archive", get(export_archive))
        .route("/backup/restore", post(restore_archive));

    let index_file = state.static_dir.join("index.html");
    let static_service = ServeDir::new(&state.static_dir)
        .fallback(ServeFile::new(index_file));

    let uploads_service = ServeDir::new(&state.uploads_dir);

    Router::new()
        .nest("/api", api_router)
        .nest_service("/uploads", uploads_service)
        .fallback_service(static_service)
        .layer(cors)
        .layer(axum::extract::DefaultBodyLimit::max(50 * 1024 * 1024))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}
