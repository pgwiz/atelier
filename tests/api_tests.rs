use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use serde_json::json;
use tempfile::tempdir;
use tower::ServiceExt;

use atelier::{
    create_app,
    db::init_pool,
    main_types::AppState,
    models::{Board, BoardItem, Character, FullBackupData, Link, Prompt, SearchResult},
};

async fn setup_test_app() -> (axum::Router, AppState, tempfile::TempDir) {
    let temp_dir = tempdir().unwrap();
    let db_path = temp_dir.path().join("test_atelier.db");
    let uploads_dir = temp_dir.path().join("uploads");
    let static_dir = temp_dir.path().join("static");

    std::fs::create_dir_all(&uploads_dir).unwrap();
    std::fs::create_dir_all(&static_dir).unwrap();

    let pool = init_pool(&db_path).unwrap();
    let http_client = reqwest::Client::new();

    let state = AppState {
        pool,
        db_path,
        data_dir: temp_dir.path().to_path_buf(),
        uploads_dir,
        static_dir,
        http_client,
    };

    let app = create_app(state.clone());
    (app, state, temp_dir)
}

#[tokio::test]
async fn test_prompts_crud_and_tags() {
    let (app, _state, _dir) = setup_test_app().await;

    // 1. Create a prompt
    let create_body = json!({
        "title": "Cyberpunk Neon Cityscape",
        "body": "A sprawling dystopian city with towering holograms and neon reflection in the rain",
        "category": "Concept Art",
        "model_used": "Midjourney v6",
        "parameters": { "ar": "16:9", "v": 6 },
        "tags": ["cyberpunk", "neon", "rain"],
        "is_favorite": false
    });

    let req = Request::builder()
        .method("POST")
        .uri("/api/prompts")
        .header("content-type", "application/json")
        .body(Body::from(create_body.to_string()))
        .unwrap();

    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);

    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let created_prompt: Prompt = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(created_prompt.title, "Cyberpunk Neon Cityscape");
    assert_eq!(created_prompt.tags.len(), 3);
    assert!(!created_prompt.is_favorite);

    let prompt_id = created_prompt.id;

    // 2. Get prompt by ID
    let req = Request::builder()
        .method("GET")
        .uri(format!("/api/prompts/{}", prompt_id))
        .body(Body::empty())
        .unwrap();

    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // 3. Toggle favorite
    let req = Request::builder()
        .method("POST")
        .uri(format!("/api/prompts/{}/favorite", prompt_id))
        .body(Body::empty())
        .unwrap();

    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let fav_prompt: Prompt = serde_json::from_slice(&bytes).unwrap();
    assert!(fav_prompt.is_favorite);

    // 4. Filter prompts by favorite
    let req = Request::builder()
        .method("GET")
        .uri("/api/prompts?favorite=true")
        .body(Body::empty())
        .unwrap();

    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let list: Vec<Prompt> = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(list.len(), 1);

    // 5. Update prompt
    let update_body = json!({
        "title": "Cyberpunk Neon Cityscape Enhanced",
        "category": "Sci-Fi"
    });

    let req = Request::builder()
        .method("PUT")
        .uri(format!("/api/prompts/{}", prompt_id))
        .header("content-type", "application/json")
        .body(Body::from(update_body.to_string()))
        .unwrap();

    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let updated: Prompt = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(updated.title, "Cyberpunk Neon Cityscape Enhanced");
    assert_eq!(updated.category, Some("Sci-Fi".into()));

    // 6. Delete prompt
    let req = Request::builder()
        .method("DELETE")
        .uri(format!("/api/prompts/{}", prompt_id))
        .body(Body::empty())
        .unwrap();

    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // Verify deletion
    let req = Request::builder()
        .method("GET")
        .uri(format!("/api/prompts/{}", prompt_id))
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn test_characters_crud_and_linkage() {
    let (app, _state, _dir) = setup_test_app().await;

    // 1. Create character
    let create_body = json!({
        "name": "Commander Aria Vance",
        "description": "Ace pilot turned resistance operative",
        "traits": "Silver undercut, scar across left brow, flight jacket",
        "tags": ["sci-fi", "protagonist"]
    });

    let req = Request::builder()
        .method("POST")
        .uri("/api/characters")
        .header("content-type", "application/json")
        .body(Body::from(create_body.to_string()))
        .unwrap();

    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let character: Character = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(character.name, "Commander Aria Vance");
    assert_eq!(character.tags.len(), 2);

    let char_id = character.id;

    // 2. Create a prompt linked to this character
    let prompt_body = json!({
        "title": "Aria in Cockpit",
        "body": "Commander Aria adjusting HUD dials in an interceptor cockpit",
        "character_id": char_id
    });

    let req = Request::builder()
        .method("POST")
        .uri("/api/prompts")
        .header("content-type", "application/json")
        .body(Body::from(prompt_body.to_string()))
        .unwrap();

    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);

    // 3. Get character and verify linked prompts
    let req = Request::builder()
        .method("GET")
        .uri(format!("/api/characters/{}", char_id))
        .body(Body::empty())
        .unwrap();

    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let loaded: Character = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(loaded.prompts.unwrap().len(), 1);
}

#[tokio::test]
async fn test_links_and_tags() {
    let (app, _state, _dir) = setup_test_app().await;

    // 1. Create link
    let link_body = json!({
        "url": "https://github.com/rust-lang/rust",
        "title": "Rust Language Repository",
        "tags": ["rust", "opensource"]
    });

    let req = Request::builder()
        .method("POST")
        .uri("/api/links")
        .header("content-type", "application/json")
        .body(Body::from(link_body.to_string()))
        .unwrap();

    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let link: Link = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(link.platform, Some("github".into()));

    // 2. Attach another tag
    let tag_body = json!({ "name": "systems" });
    let req = Request::builder()
        .method("POST")
        .uri(format!("/api/links/{}/tags", link.id))
        .header("content-type", "application/json")
        .body(Body::from(tag_body.to_string()))
        .unwrap();

    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // 3. Detach a tag
    let req = Request::builder()
        .method("DELETE")
        .uri(format!("/api/links/{}/tags/opensource", link.id))
        .body(Body::empty())
        .unwrap();

    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_unified_search() {
    let (app, _state, _dir) = setup_test_app().await;

    // Add 1 prompt, 1 character, 1 link
    let req1 = Request::builder()
        .method("POST")
        .uri("/api/prompts")
        .header("content-type", "application/json")
        .body(Body::from(json!({
            "title": "Cyberpunk Neon Warrior",
            "body": "Katana glowing with violet plasma",
            "tags": ["cyberpunk", "warrior"]
        }).to_string()))
        .unwrap();
    app.clone().oneshot(req1).await.unwrap();

    let req2 = Request::builder()
        .method("POST")
        .uri("/api/characters")
        .header("content-type", "application/json")
        .body(Body::from(json!({
            "name": "Kaito Cyberpunk Ronin",
            "traits": "Cybernetic arm, neon visor",
            "tags": ["cyberpunk"]
        }).to_string()))
        .unwrap();
    app.clone().oneshot(req2).await.unwrap();

    let req3 = Request::builder()
        .method("POST")
        .uri("/api/links")
        .header("content-type", "application/json")
        .body(Body::from(json!({
            "url": "https://artstation.com/artwork/cyberpunk-concept",
            "title": "Cyberpunk 2099 Concept Art",
            "tags": ["concept", "cyberpunk"]
        }).to_string()))
        .unwrap();
    app.clone().oneshot(req3).await.unwrap();

    // Query unified search by keyword "cyberpunk"
    let req = Request::builder()
        .method("GET")
        .uri("/api/search?q=cyberpunk")
        .body(Body::empty())
        .unwrap();

    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let results: Vec<SearchResult> = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(results.len(), 3);

    // Query unified search by tag "warrior"
    let req = Request::builder()
        .method("GET")
        .uri("/api/search?tag=warrior")
        .body(Body::empty())
        .unwrap();

    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let results: Vec<SearchResult> = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].entity_type, "prompt");
}

#[tokio::test]
async fn test_boards_and_board_items() {
    let (app, _state, _dir) = setup_test_app().await;

    // 1. Create a board
    let board_body = json!({
        "name": "Episode 1 Moodboard",
        "theme": "cyberpunk",
        "canvas_style": "corkboard"
    });

    let req = Request::builder()
        .method("POST")
        .uri("/api/boards")
        .header("content-type", "application/json")
        .body(Body::from(board_body.to_string()))
        .unwrap();

    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let board: Board = serde_json::from_slice(&bytes).unwrap();
    let board_id = board.id;

    // 2. Add sticky note item
    let sticky_body = json!({
        "entity_type": "note",
        "note_text": "Remember to pace the intro reveal slowly",
        "pos_x": 100.0,
        "pos_y": 150.0,
        "color": "#fef08a"
    });

    let req = Request::builder()
        .method("POST")
        .uri(format!("/api/boards/{}/items", board_id))
        .header("content-type", "application/json")
        .body(Body::from(sticky_body.to_string()))
        .unwrap();

    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let note_item: BoardItem = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(note_item.entity_type, "note");
    assert_eq!(note_item.pos_x, 100.0);

    // 3. Patch item position
    let patch_body = json!({
        "pos_x": 250.0,
        "pos_y": 300.0
    });

    let req = Request::builder()
        .method("PATCH")
        .uri(format!("/api/boards/{}/items/{}", board_id, note_item.id))
        .header("content-type", "application/json")
        .body(Body::from(patch_body.to_string()))
        .unwrap();

    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let patched: BoardItem = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(patched.pos_x, 250.0);

    // 4. Patch drawing data
    let drawing_body = json!({
        "drawing_data": [
            { "type": "rect", "x": 50, "y": 50, "w": 200, "h": 100, "color": "#ff0077" }
        ]
    });

    let req = Request::builder()
        .method("PATCH")
        .uri(format!("/api/boards/{}/drawing", board_id))
        .header("content-type", "application/json")
        .body(Body::from(drawing_body.to_string()))
        .unwrap();

    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // 5. Export single board
    let req = Request::builder()
        .method("GET")
        .uri(format!("/api/boards/{}/export", board_id))
        .body(Body::empty())
        .unwrap();

    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_dual_mode_backup_and_restore() {
    let (app, _state, _dir) = setup_test_app().await;

    // Populate data: Prompt, Character, Link, Board
    let req1 = Request::builder()
        .method("POST")
        .uri("/api/prompts")
        .header("content-type", "application/json")
        .body(Body::from(json!({
            "title": "Master Prompt for Backup Test",
            "body": "Photorealistic volumetric lighting",
            "category": "Cinematic"
        }).to_string()))
        .unwrap();
    app.clone().oneshot(req1).await.unwrap();

    let req2 = Request::builder()
        .method("POST")
        .uri("/api/boards")
        .header("content-type", "application/json")
        .body(Body::from(json!({
            "name": "Backup Target Board",
            "canvas_style": "dot-grid"
        }).to_string()))
        .unwrap();
    app.clone().oneshot(req2).await.unwrap();

    // 1. Test JSON Export
    let req = Request::builder()
        .method("GET")
        .uri("/api/export")
        .body(Body::empty())
        .unwrap();

    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let backup_data: FullBackupData = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(backup_data.prompts.len(), 1);
    assert_eq!(backup_data.boards.len(), 1);

    // 2. Test JSON Restore into clean DB
    let req = Request::builder()
        .method("POST")
        .uri("/api/import")
        .header("content-type", "application/json")
        .body(Body::from(serde_json::to_string(&backup_data).unwrap()))
        .unwrap();

    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // 3. Test Full ZIP Archive Export
    let req = Request::builder()
        .method("GET")
        .uri("/api/backup/archive")
        .body(Body::empty())
        .unwrap();

    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let zip_bytes = resp.into_body().collect().await.unwrap().to_bytes();
    assert!(!zip_bytes.is_empty());

    // Verify ZIP contains expected files
    let cursor = std::io::Cursor::new(zip_bytes.to_vec());
    let mut archive = zip::ZipArchive::new(cursor).unwrap();
    let mut file_names = Vec::new();
    for i in 0..archive.len() {
        let f = archive.by_index(i).unwrap();
        file_names.push(f.name().to_string());
    }

    assert!(file_names.contains(&"manifest.json".to_string()));
    assert!(file_names.contains(&"database.json".to_string()));
    assert!(file_names.contains(&"atelier.db".to_string()));
}

#[tokio::test]
async fn test_validation_and_not_found_edge_cases() {
    let (app, _state, _dir) = setup_test_app().await;

    // 1. Empty title in prompt
    let req = Request::builder()
        .method("POST")
        .uri("/api/prompts")
        .header("content-type", "application/json")
        .body(Body::from(json!({ "title": "   ", "body": "some body" }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

    // 2. Empty character name
    let req = Request::builder()
        .method("POST")
        .uri("/api/characters")
        .header("content-type", "application/json")
        .body(Body::from(json!({ "name": "   " }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

    // 3. Empty link URL
    let req = Request::builder()
        .method("POST")
        .uri("/api/links")
        .header("content-type", "application/json")
        .body(Body::from(json!({ "url": "   " }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

    // 4. Non-existent IDs -> 404
    for uri in &["/api/prompts/9999", "/api/characters/9999", "/api/links/9999", "/api/boards/9999"] {
        let req = Request::builder()
            .method("GET")
            .uri(*uri)
            .body(Body::empty())
            .unwrap();
        let resp = app.clone().oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::NOT_FOUND);
    }
}

#[tokio::test]
async fn test_sql_safety_and_special_characters() {
    let (app, _state, _dir) = setup_test_app().await;

    let strange_input = "Robert'); DROP TABLE prompts;-- 🤖 '\"<>&";

    let req = Request::builder()
        .method("POST")
        .uri("/api/prompts")
        .header("content-type", "application/json")
        .body(Body::from(json!({
            "title": strange_input,
            "body": strange_input,
            "tags": ["sql-safe", "injection-test"]
        }).to_string()))
        .unwrap();

    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let p: Prompt = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(p.title, strange_input);
    assert_eq!(p.body, strange_input);

    // Search using strange characters
    let req = Request::builder()
        .method("GET")
        .uri("/api/search?q=DROP%20TABLE")
        .body(Body::empty())
        .unwrap();

    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let bytes = resp.into_body().collect().await.unwrap().to_bytes();
    let results: Vec<SearchResult> = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(results.len(), 1);
}

#[tokio::test]
async fn test_cascade_deletion_on_board_items() {
    let (app, _state, _dir) = setup_test_app().await;

    // Create a prompt
    let req = Request::builder()
        .method("POST")
        .uri("/api/prompts")
        .header("content-type", "application/json")
        .body(Body::from(json!({ "title": "Temporary Prompt", "body": "Temp" }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let prompt: Prompt = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();

    // Create a board
    let req = Request::builder()
        .method("POST")
        .uri("/api/boards")
        .header("content-type", "application/json")
        .body(Body::from(json!({ "name": "Cascade Test Board" }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let board: Board = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();

    // Pin prompt to board
    let req = Request::builder()
        .method("POST")
        .uri(format!("/api/boards/{}/items", board.id))
        .header("content-type", "application/json")
        .body(Body::from(json!({
            "entity_type": "prompt",
            "entity_id": prompt.id
        }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);

    // Verify item count is 1
    let req = Request::builder()
        .method("GET")
        .uri(format!("/api/boards/{}/items", board.id))
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let items: Vec<BoardItem> = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(items.len(), 1);

    // Delete prompt
    let req = Request::builder()
        .method("DELETE")
        .uri(format!("/api/prompts/{}", prompt.id))
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // Verify item was removed from board
    let req = Request::builder()
        .method("GET")
        .uri(format!("/api/boards/{}/items", board.id))
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let items: Vec<BoardItem> = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(items.len(), 0);
}

#[tokio::test]
async fn test_utf8_multibyte_safe_truncation() {
    let (app, _state, _dir) = setup_test_app().await;

    // Body with 136 'A's + 4-byte emoji 🚀 + trailing text.
    // Length in bytes = 136 + 4 + 9 = 149 > 140.
    // If sliced with raw [..137], index 137 is inside the 4-byte emoji and panics!
    let dangerous_utf8_body = format!("{}🚀MoreText", "A".repeat(136));

    let req = Request::builder()
        .method("POST")
        .uri("/api/prompts")
        .header("content-type", "application/json")
        .body(Body::from(json!({
            "title": "Unicode Safety Test",
            "body": dangerous_utf8_body
        }).to_string()))
        .unwrap();

    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);
    let prompt: Prompt = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();

    // Query search - must not panic!
    let req = Request::builder()
        .method("GET")
        .uri("/api/search?q=Unicode")
        .body(Body::empty())
        .unwrap();

    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let results: Vec<SearchResult> = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(results.len(), 1);
    assert!(results[0].snippet.ends_with("..."));

    // Pin to board and fetch items - must not panic!
    let req = Request::builder()
        .method("POST")
        .uri("/api/boards")
        .header("content-type", "application/json")
        .body(Body::from(json!({ "name": "Unicode Board" }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let board: Board = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();

    let req = Request::builder()
        .method("POST")
        .uri(format!("/api/boards/{}/items", board.id))
        .header("content-type", "application/json")
        .body(Body::from(json!({
            "entity_type": "prompt",
            "entity_id": prompt.id
        }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);

    let req = Request::builder()
        .method("GET")
        .uri(format!("/api/boards/{}/items", board.id))
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_tag_cleanup_on_entity_deletion() {
    let (app, _state, _dir) = setup_test_app().await;

    // Create prompt with tag "transient-tag"
    let req = Request::builder()
        .method("POST")
        .uri("/api/prompts")
        .header("content-type", "application/json")
        .body(Body::from(json!({
            "title": "Tagged Prompt",
            "body": "Some content",
            "tags": ["transient-tag"]
        }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let prompt: Prompt = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();

    // Verify tag exists with count 1
    let req = Request::builder()
        .method("GET")
        .uri("/api/tags")
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let tags: Vec<serde_json::Value> = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let tag_entry = tags.iter().find(|t| t["name"] == "transient-tag").unwrap();
    assert_eq!(tag_entry["count"], 1);

    // Delete the prompt
    let req = Request::builder()
        .method("DELETE")
        .uri(format!("/api/prompts/{}", prompt.id))
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // Verify tag count is now 0 (no orphaned taggables!)
    let req = Request::builder()
        .method("GET")
        .uri("/api/tags")
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let tags: Vec<serde_json::Value> = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let tag_entry = tags.iter().find(|t| t["name"] == "transient-tag").unwrap();
    assert_eq!(tag_entry["count"], 0);
}

#[tokio::test]
async fn test_entity_validation_and_ownership() {
    let (app, _state, _dir) = setup_test_app().await;

    // 1. Tagging non-existent prompt returns 404
    let req = Request::builder()
        .method("POST")
        .uri("/api/prompts/99999/tags")
        .header("content-type", "application/json")
        .body(Body::from(json!({ "name": "ghost" }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);

    // 2. Detaching tag from non-existent character returns 404
    let req = Request::builder()
        .method("DELETE")
        .uri("/api/characters/99999/tags/ghost")
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);

    // 3. Create board item with invalid entity_type -> 400
    let req = Request::builder()
        .method("POST")
        .uri("/api/boards")
        .header("content-type", "application/json")
        .body(Body::from(json!({ "name": "Board Alpha" }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let board1: Board = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();

    let req = Request::builder()
        .method("POST")
        .uri(format!("/api/boards/{}/items", board1.id))
        .header("content-type", "application/json")
        .body(Body::from(json!({
            "entity_type": "invalid_type",
            "pos_x": 0, "pos_y": 0
        }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

    // 4. Create board item with non-existent entity_id -> 404
    let req = Request::builder()
        .method("POST")
        .uri(format!("/api/boards/{}/items", board1.id))
        .header("content-type", "application/json")
        .body(Body::from(json!({
            "entity_type": "prompt",
            "entity_id": 999999
        }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);

    // 5. Cross-board item modification rejection
    let req = Request::builder()
        .method("POST")
        .uri(format!("/api/boards/{}/items", board1.id))
        .header("content-type", "application/json")
        .body(Body::from(json!({
            "entity_type": "note",
            "note_text": "Board 1 Note"
        }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);
    let item: BoardItem = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();

    // Create board 2
    let req = Request::builder()
        .method("POST")
        .uri("/api/boards")
        .header("content-type", "application/json")
        .body(Body::from(json!({ "name": "Board Beta" }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let board2: Board = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();

    // Attempt to patch item belonging to board1 using board2 path -> 404
    let req = Request::builder()
        .method("PATCH")
        .uri(format!("/api/boards/{}/items/{}", board2.id, item.id))
        .header("content-type", "application/json")
        .body(Body::from(json!({ "pos_x": 999 }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);

    // Attempt to delete item belonging to board1 using board2 path -> 404
    let req = Request::builder()
        .method("DELETE")
        .uri(format!("/api/boards/{}/items/{}", board2.id, item.id))
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn test_full_zip_archive_restore_and_verification() {
    let (app, _state, _dir) = setup_test_app().await;

    // 1. Create a prompt and a board
    let req = Request::builder()
        .method("POST")
        .uri("/api/prompts")
        .header("content-type", "application/json")
        .body(Body::from(json!({
            "title": "Archive Verification Prompt",
            "body": "Content to be archived and restored",
            "tags": ["archive", "full"]
        }).to_string()))
        .unwrap();
    app.clone().oneshot(req).await.unwrap();

    // 2. Export ZIP archive
    let req = Request::builder()
        .method("GET")
        .uri("/api/backup/archive")
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let zip_bytes = resp.into_body().collect().await.unwrap().to_bytes();

    // 3. Construct multipart body to restore archive
    let boundary = "------------------------atelierBoundary123";
    let mut body_bytes = Vec::new();
    body_bytes.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    body_bytes.extend_from_slice(b"Content-Disposition: form-data; name=\"archive\"; filename=\"backup.zip\"\r\n");
    body_bytes.extend_from_slice(b"Content-Type: application/zip\r\n\r\n");
    body_bytes.extend_from_slice(&zip_bytes);
    body_bytes.extend_from_slice(format!("\r\n--{}--\r\n", boundary).as_bytes());

    let req = Request::builder()
        .method("POST")
        .uri("/api/backup/restore")
        .header("content-type", format!("multipart/form-data; boundary={}", boundary))
        .body(Body::from(body_bytes))
        .unwrap();

    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let res_json: serde_json::Value = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();

    assert_eq!(res_json["status"], "success");
    assert_eq!(res_json["verification_status"], "verified");
    assert_eq!(res_json["restored"]["prompts"], 1);
}

#[tokio::test]
async fn test_update_validation_empty_fields() {
    let (app, _state, _dir) = setup_test_app().await;

    // Create prompt
    let req = Request::builder()
        .method("POST")
        .uri("/api/prompts")
        .header("content-type", "application/json")
        .body(Body::from(json!({ "title": "Valid Title", "body": "Valid Body" }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let prompt: Prompt = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();

    // Update with whitespace title -> 400 Bad Request
    let req = Request::builder()
        .method("PUT")
        .uri(format!("/api/prompts/{}", prompt.id))
        .header("content-type", "application/json")
        .body(Body::from(json!({ "title": "   " }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

    // Update with whitespace body -> 400 Bad Request
    let req = Request::builder()
        .method("PUT")
        .uri(format!("/api/prompts/{}", prompt.id))
        .header("content-type", "application/json")
        .body(Body::from(json!({ "body": "   " }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}
