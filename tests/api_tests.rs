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
    models::{
        Board, BoardItem, Character, FullBackupData, Link, Project, ProjectAttachment, ProjectPart,
        Prompt, SearchResult,
    },
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

    let strange_input = "Robert'); DROP TABLE prompts;-- \u{1F916} '\"<>&";

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

    // Body with 136 'A's + 4-byte sequence + trailing text.
    // Length in bytes = 136 + 4 + 9 = 149 > 140.
    // If sliced with raw [..137], index 137 is inside the 4-byte sequence and panics!
    let dangerous_utf8_body = format!("{}\u{1F680}MoreText", "A".repeat(136));

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

#[tokio::test]
async fn test_phase9_projects_crud_and_json_sync() {
    let (app, state, _dir) = setup_test_app().await;

    // 1. Create a project
    let create_body = json!({
        "name": "Neon Syndicate",
        "description": "Cyberpunk narrative universe",
        "status": "In Progress",
        "color": "#38bdf8"
    });

    let req = Request::builder()
        .method("POST")
        .uri("/api/projects")
        .header("content-type", "application/json")
        .body(Body::from(create_body.to_string()))
        .unwrap();

    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);
    let created: Project = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(created.name, "Neon Syndicate");
    assert_eq!(created.status, "In Progress");

    let pid = created.id;

    // 2. Verify project folder and project.json created on disk
    let project_json_path = state.data_dir.join("projects").join(pid.to_string()).join("project.json");
    assert!(project_json_path.exists());
    let json_text = std::fs::read_to_string(&project_json_path).unwrap();
    assert!(json_text.contains("Neon Syndicate"));

    // 3. Update project
    let update_body = json!({
        "name": "Neon Syndicate V2",
        "status": "Review"
    });
    let req = Request::builder()
        .method("PUT")
        .uri(format!("/api/projects/{}", pid))
        .header("content-type", "application/json")
        .body(Body::from(update_body.to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let updated: Project = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(updated.name, "Neon Syndicate V2");
    assert_eq!(updated.status, "Review");

    // 4. Test reload-json endpoint
    let req = Request::builder()
        .method("POST")
        .uri(format!("/api/projects/{}/reload-json", pid))
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_phase9_parts_crud_status_cycling_and_entities() {
    let (app, _state, _dir) = setup_test_app().await;

    // 1. Create a project
    let req = Request::builder()
        .method("POST")
        .uri("/api/projects")
        .header("content-type", "application/json")
        .body(Body::from(json!({ "name": "Episode One" }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let proj: Project = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let pid = proj.id;

    // 2. Create a character and a prompt in this project
    let req = Request::builder()
        .method("POST")
        .uri("/api/characters")
        .header("content-type", "application/json")
        .body(Body::from(json!({ "name": "Vance", "project_id": pid }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let character: Character = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();

    let req = Request::builder()
        .method("POST")
        .uri("/api/prompts")
        .header("content-type", "application/json")
        .body(Body::from(json!({ "title": "Opening Shot", "body": "Wide shot in neon rain", "project_id": pid }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let prompt: Prompt = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();

    // 3. Create part
    let req = Request::builder()
        .method("POST")
        .uri(format!("/api/projects/{}/parts", pid))
        .header("content-type", "application/json")
        .body(Body::from(json!({
            "title": "Scene 1 - Rooftop Infiltration",
            "part_type": "scene",
            "status": "Draft",
            "order_index": 1
        }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);
    let part: ProjectPart = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(part.title, "Scene 1 - Rooftop Infiltration");
    assert_eq!(part.status, "Draft");
    assert!(part.completed_at.is_none());

    let part_id = part.id;

    // 4. Attach entities
    let req = Request::builder()
        .method("POST")
        .uri(format!("/api/parts/{}/entities", part_id))
        .header("content-type", "application/json")
        .body(Body::from(json!({ "entity_type": "character", "entity_id": character.id, "notes": "Hero on rooftop" }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let req = Request::builder()
        .method("POST")
        .uri(format!("/api/parts/{}/entities", part_id))
        .header("content-type", "application/json")
        .body(Body::from(json!({ "entity_type": "prompt", "entity_id": prompt.id }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // Verify entities in part
    let req = Request::builder()
        .method("GET")
        .uri(format!("/api/projects/{}/parts", pid))
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let parts: Vec<ProjectPart> = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(parts[0].linked_characters.len(), 1);
    assert_eq!(parts[0].linked_prompts.len(), 1);

    // 5. Cycle status to Done
    let req = Request::builder()
        .method("PATCH")
        .uri(format!("/api/parts/{}/status", part_id))
        .header("content-type", "application/json")
        .body(Body::from(json!({ "status": "Done" }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let updated_part: ProjectPart = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(updated_part.status, "Done");
    assert!(updated_part.completed_at.is_some());

    // Check project completion progress
    let req = Request::builder()
        .method("GET")
        .uri(format!("/api/projects/{}", pid))
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let updated_proj: Project = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(updated_proj.completed_parts_count.unwrap_or(0), 1);
    assert_eq!(updated_proj.progress_percent.unwrap_or(0), 100);

    // 6. Detach entity
    let req = Request::builder()
        .method("DELETE")
        .uri(format!("/api/parts/{}/entities/character/{}", part_id, character.id))
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_phase9_attachments_and_file_streaming() {
    let (app, _state, _dir) = setup_test_app().await;

    // 1. Create project
    let req = Request::builder()
        .method("POST")
        .uri("/api/projects")
        .header("content-type", "application/json")
        .body(Body::from(json!({ "name": "Media Project" }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let proj: Project = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let pid = proj.id;

    // 2. Upload file attachment via multipart
    let boundary = "---------------------------boundary123";
    let file_content = b"Scene 1: Interior. Neon Cafe - Night. Rain taps against the glass.";
    let mut body = Vec::new();
    body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    body.extend_from_slice(b"Content-Disposition: form-data; name=\"file\"; filename=\"script_take1.txt\"\r\n");
    body.extend_from_slice(b"Content-Type: text/plain\r\n\r\n");
    body.extend_from_slice(file_content);
    body.extend_from_slice(format!("\r\n--{}--\r\n", boundary).as_bytes());

    let req = Request::builder()
        .method("POST")
        .uri(format!("/api/projects/{}/attachments", pid))
        .header("content-type", format!("multipart/form-data; boundary={}", boundary))
        .body(Body::from(body))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);
    let att: ProjectAttachment = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(att.name, "script_take1.txt");

    // 3. List attachments
    let req = Request::builder()
        .method("GET")
        .uri(format!("/api/projects/{}/attachments", pid))
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let list: Vec<ProjectAttachment> = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(list.len(), 1);

    // 4. Stream file via /files/projects/:id/*path
    let req = Request::builder()
        .method("GET")
        .uri(format!("/files/projects/{}/{}", pid, att.file_path))
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let streamed = resp.into_body().collect().await.unwrap().to_bytes();
    assert_eq!(streamed.as_ref(), file_content);

    // 5. Path traversal protection on streaming
    let req = Request::builder()
        .method("GET")
        .uri(format!("/files/projects/{}/../../sensitive.txt", pid))
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert!(resp.status() == StatusCode::BAD_REQUEST || resp.status() == StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn test_phase9_filesystem_reveal_security() {
    let (app, state, _dir) = setup_test_app().await;

    // 1. Create a valid file inside data_dir
    let safe_file = state.data_dir.join("safe.txt");
    std::fs::write(&safe_file, "safe content").unwrap();

    let req = Request::builder()
        .method("POST")
        .uri("/api/fs/reveal")
        .header("content-type", "application/json")
        .body(Body::from(json!({ "path": "safe.txt" }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // 2. Path traversal outside data_dir should be rejected with 400 Bad Request or 404
    let req = Request::builder()
        .method("POST")
        .uri("/api/fs/reveal")
        .header("content-type", "application/json")
        .body(Body::from(json!({ "path": "../../windows/system32" }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert!(resp.status() == StatusCode::BAD_REQUEST || resp.status() == StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn test_phase9_deep_copy_and_merge_and_transfer() {
    let (app, _state, _dir) = setup_test_app().await;

    // 1. Create source project A
    let req = Request::builder()
        .method("POST")
        .uri("/api/projects")
        .header("content-type", "application/json")
        .body(Body::from(json!({ "name": "Alpha Project" }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let proj_a: Project = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();

    // Add prompt and part to project A
    let req = Request::builder()
        .method("POST")
        .uri("/api/prompts")
        .header("content-type", "application/json")
        .body(Body::from(json!({ "title": "Hero Pose", "body": "Standing proudly", "project_id": proj_a.id }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let prompt_a: Prompt = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();

    let req = Request::builder()
        .method("POST")
        .uri(format!("/api/projects/{}/parts", proj_a.id))
        .header("content-type", "application/json")
        .body(Body::from(json!({ "title": "Intro Scene", "part_type": "scene" }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);

    // 2. Deep copy Project A -> Project B
    let req = Request::builder()
        .method("POST")
        .uri(format!("/api/projects/{}/copy", proj_a.id))
        .header("content-type", "application/json")
        .body(Body::from(json!({ "name": "Alpha Clone" }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);
    let proj_b: Project = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(proj_b.name, "Alpha Clone");
    assert_eq!(proj_b.prompts_count.unwrap_or(0), 1);
    assert_eq!(proj_b.parts_count.unwrap_or(0), 1);

    // 3. Create target Project C
    let req = Request::builder()
        .method("POST")
        .uri("/api/projects")
        .header("content-type", "application/json")
        .body(Body::from(json!({ "name": "Target Omega" }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let proj_c: Project = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();

    // 4. Merge Project A into Project C with rename conflicts
    let req = Request::builder()
        .method("POST")
        .uri(format!("/api/projects/{}/merge", proj_a.id))
        .header("content-type", "application/json")
        .body(Body::from(json!({
            "target_project_id": proj_c.id,
            "rename_conflicts": true,
            "copy_media": true
        }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // 5. Transfer items from Project A to Project C (mode: copy)
    let req = Request::builder()
        .method("POST")
        .uri("/api/projects/transfer")
        .header("content-type", "application/json")
        .body(Body::from(json!({
            "source_project_id": proj_a.id,
            "target_project_id": proj_c.id,
            "items": [{ "entity_type": "prompt", "entity_id": prompt_a.id }],
            "mode": "copy"
        }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_phase9_export_and_import_project_package() {
    let (app, _state, _dir) = setup_test_app().await;

    // 1. Create project
    let req = Request::builder()
        .method("POST")
        .uri("/api/projects")
        .header("content-type", "application/json")
        .body(Body::from(json!({ "name": "Standalone Show" }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let proj: Project = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();

    // 2. Export package (.zip)
    let req = Request::builder()
        .method("GET")
        .uri(format!("/api/projects/{}/export", proj.id))
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let zip_bytes = resp.into_body().collect().await.unwrap().to_bytes();
    assert!(!zip_bytes.is_empty());

    // 3. Import package back
    let boundary = "---------------------------boundary999";
    let mut body = Vec::new();
    body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    body.extend_from_slice(b"Content-Disposition: form-data; name=\"file\"; filename=\"export.zip\"\r\n");
    body.extend_from_slice(b"Content-Type: application/zip\r\n\r\n");
    body.extend_from_slice(&zip_bytes);
    body.extend_from_slice(format!("\r\n--{}--\r\n", boundary).as_bytes());

    let req = Request::builder()
        .method("POST")
        .uri("/api/projects/import")
        .header("content-type", format!("multipart/form-data; boundary={}", boundary))
        .body(Body::from(body))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);
    let imported: Project = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert!(imported.name.contains("Standalone Show"));
}

#[tokio::test]
async fn test_phase9_zip_slip_rejection() {
    let (app, _state, _dir) = setup_test_app().await;

    // Create a malicious zip containing ../../evil.txt
    let mut zip_buffer = std::io::Cursor::new(Vec::new());
    {
        let mut zip = zip::ZipWriter::new(&mut zip_buffer);
        let options = zip::write::SimpleFileOptions::default();
        zip.start_file("project.json", options).unwrap();
        use std::io::Write;
        let manifest_json = json!({
            "project": {
                "id": 99,
                "name": "Malicious Test",
                "description": null,
                "status": "Draft",
                "color": "#38bdf8",
                "created_at": "2026-01-01 00:00:00",
                "updated_at": "2026-01-01 00:00:00"
            },
            "parts": [],
            "prompts": [],
            "characters": [],
            "links": [],
            "boards": [],
            "board_items": [],
            "attachments": []
        });
        zip.write_all(manifest_json.to_string().as_bytes()).unwrap();

        // Add malicious Zip Slip path
        zip.start_file("../../evil.txt", options).unwrap();
        zip.write_all(b"malicious content").unwrap();
        zip.finish().unwrap();
    }

    let malicious_zip = zip_buffer.into_inner();

    let boundary = "---------------------------boundary_zipslip";
    let mut body = Vec::new();
    body.extend_from_slice(format!("--{}\r\n", boundary).as_bytes());
    body.extend_from_slice(b"Content-Disposition: form-data; name=\"file\"; filename=\"malicious.zip\"\r\n");
    body.extend_from_slice(b"Content-Type: application/zip\r\n\r\n");
    body.extend_from_slice(&malicious_zip);
    body.extend_from_slice(format!("\r\n--{}--\r\n", boundary).as_bytes());

    let req = Request::builder()
        .method("POST")
        .uri("/api/projects/import")
        .header("content-type", format!("multipart/form-data; boundary={}", boundary))
        .body(Body::from(body))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn test_phase9_cannot_delete_only_project() {
    let (app, _state, _dir) = setup_test_app().await;

    // Only default project (id = 1) exists initially
    let req = Request::builder()
        .method("DELETE")
        .uri("/api/projects/1")
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn test_phase9_deep_copy_and_merge_remap_board_part_items() {
    let (app, _state, _dir) = setup_test_app().await;

    // 1. Create project Alpha
    let req = Request::builder()
        .method("POST")
        .uri("/api/projects")
        .header("content-type", "application/json")
        .body(Body::from(json!({ "name": "Alpha Studio" }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let proj_a: Project = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();

    // 2. Add part to project Alpha
    let req = Request::builder()
        .method("POST")
        .uri(format!("/api/projects/{}/parts", proj_a.id))
        .header("content-type", "application/json")
        .body(Body::from(json!({ "title": "Opening Sequence", "part_type": "Scene" }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let part_a: ProjectPart = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();

    // 3. Create board in project Alpha
    let req = Request::builder()
        .method("POST")
        .uri("/api/boards")
        .header("content-type", "application/json")
        .body(Body::from(json!({ "name": "Story Pipeline", "project_id": proj_a.id }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let board_a: Board = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();

    // 4. Add part card to board Alpha
    let req = Request::builder()
        .method("POST")
        .uri(format!("/api/boards/{}/items", board_a.id))
        .header("content-type", "application/json")
        .body(Body::from(json!({
            "entity_type": "part",
            "entity_id": part_a.id,
            "pos_x": 100.0,
            "pos_y": 100.0
        }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);

    // 5. Deep Copy Alpha -> Beta
    let req = Request::builder()
        .method("POST")
        .uri(format!("/api/projects/{}/copy", proj_a.id))
        .header("content-type", "application/json")
        .body(Body::from(json!({ "name": "Beta Studio" }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);
    let proj_b: Project = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();

    // Check that Beta's board item references Beta's cloned part, NOT Alpha's part_a.id!
    let req = Request::builder()
        .method("GET")
        .uri(format!("/api/boards?project_id={}", proj_b.id))
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let boards_b: Vec<Board> = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(boards_b.len(), 1);

    let req = Request::builder()
        .method("GET")
        .uri(format!("/api/boards/{}/items", boards_b[0].id))
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let items_b: Vec<BoardItem> = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(items_b.len(), 1);
    let part_item = &items_b[0];
    assert_eq!(part_item.entity_type, "part");
    assert_ne!(part_item.entity_id, Some(part_a.id)); // Must NOT be old part ID!
    assert!(part_item.entity_id.is_some());
}

#[tokio::test]
async fn test_phase9_reload_json_with_new_unassigned_entities() {
    let (app, state, _dir) = setup_test_app().await;

    // Create project
    let req = Request::builder()
        .method("POST")
        .uri("/api/projects")
        .header("content-type", "application/json")
        .body(Body::from(json!({ "name": "Manual Edit Test" }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let proj: Project = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();

    // Write a project.json directly to disk with a new character and part with id: 0
    let folder = state.data_dir.join("projects").join(proj.id.to_string());
    let manifest_path = folder.join("project.json");
    let manual_manifest = json!({
        "project": {
            "id": proj.id,
            "name": "Manual Edit Test Modified",
            "description": "Edited externally",
            "status": "In Progress",
            "color": "#38bdf8",
            "created_at": "2026-01-01 00:00:00",
            "updated_at": "2026-01-01 00:00:00"
        },
        "parts": [
            {
                "id": 0,
                "project_id": proj.id,
                "title": "Externally Added Scene",
                "part_type": "Scene",
                "status": "Ready",
                "order_index": 1,
                "description": "Added by script",
                "notes": null,
                "board_id": null,
                "created_at": "2026-01-01 00:00:00",
                "updated_at": "2026-01-01 00:00:00",
                "completed_at": null,
                "linked_character_ids": [],
                "linked_prompt_ids": [],
                "linked_link_ids": [],
                "linked_characters": [],
                "linked_prompts": [],
                "linked_links": []
            }
        ],
        "prompts": [],
        "characters": [
            {
                "id": 0,
                "project_id": proj.id,
                "name": "External Hero",
                "description": "Brave explorer",
                "traits": "Adventurous",
                "image_path": null,
                "notes": null,
                "created_at": "2026-01-01 00:00:00",
                "updated_at": "2026-01-01 00:00:00",
                "tags": ["hero"]
            }
        ],
        "links": [],
        "boards": [],
        "board_items": [],
        "attachments": []
    });
    std::fs::write(&manifest_path, manual_manifest.to_string()).unwrap();

    // Call reload-json
    let req = Request::builder()
        .method("POST")
        .uri(format!("/api/projects/{}/reload-json", proj.id))
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // Verify reconciled data
    let req = Request::builder()
        .method("GET")
        .uri(format!("/api/characters?project_id={}", proj.id))
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let chars: Vec<Character> = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(chars.len(), 1);
    assert_eq!(chars[0].name, "External Hero");
    assert!(chars[0].id > 0);
}

#[tokio::test]
async fn test_phase10_settings_crud_and_bulk() {
    let (app, _state, _dir) = setup_test_app().await;

    // 1. Initial settings should be accessible
    let req = Request::builder()
        .method("GET")
        .uri("/api/settings")
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    // 2. Set a setting
    let req = Request::builder()
        .method("PUT")
        .uri("/api/settings/ai_provider")
        .header("Content-Type", "application/json")
        .body(Body::from(json!({ "value": "openrouter" }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let item: serde_json::Value = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(item["key"], "ai_provider");
    assert_eq!(item["value"], "openrouter");

    // 3. Get single setting
    let req = Request::builder()
        .method("GET")
        .uri("/api/settings/ai_provider")
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let item: serde_json::Value = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(item["value"], "openrouter");

    // 4. Bulk update
    let req = Request::builder()
        .method("POST")
        .uri("/api/settings/bulk")
        .header("Content-Type", "application/json")
        .body(Body::from(json!({
            "settings": {
                "ai_model": "anthropic/claude-3.5-sonnet",
                "ambient_color": "#dc2626",
                "ambient_speed": "8s"
            }
        }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let all: std::collections::HashMap<String, String> = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(all.get("ai_provider").unwrap(), "openrouter");
    // 5. POST /api/settings with single {key, value}
    let req = Request::builder()
        .method("POST")
        .uri("/api/settings")
        .header("Content-Type", "application/json")
        .body(Body::from(json!({
            "key": "layout_mode",
            "value": "dock"
        }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);

    let req = Request::builder()
        .method("GET")
        .uri("/api/settings/layout_mode")
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let item: serde_json::Value = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(item["value"], "dock");
}

#[tokio::test]
async fn test_phase10_project_activity_feed() {
    let (app, _state, _dir) = setup_test_app().await;

    // 1. Non-existent project returns 404
    let req = Request::builder()
        .method("GET")
        .uri("/api/projects/99999/activity")
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::NOT_FOUND);

    // 2. Create a project
    let req = Request::builder()
        .method("POST")
        .uri("/api/projects")
        .header("Content-Type", "application/json")
        .body(Body::from(json!({ "name": "Activity Test Studio" }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    let proj: Project = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();

    // 3. Add a part
    let req = Request::builder()
        .method("POST")
        .uri(format!("/api/projects/{}/parts", proj.id))
        .header("Content-Type", "application/json")
        .body(Body::from(json!({ "title": "Scene 1: Opening Shot", "part_type": "scene" }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);

    // 4. Add a prompt
    let req = Request::builder()
        .method("POST")
        .uri("/api/prompts")
        .header("Content-Type", "application/json")
        .body(Body::from(json!({ "project_id": proj.id, "title": "Cyberpunk Sunset", "body": "Neon streets..." }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);

    // 5. Fetch activity feed
    let req = Request::builder()
        .method("GET")
        .uri(format!("/api/projects/{}/activity", proj.id))
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let activities: Vec<serde_json::Value> = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();

    // Should have activities for project creation, part creation, prompt creation
    assert!(activities.len() >= 3);
    let titles: Vec<&str> = activities.iter().map(|a| a["title"].as_str().unwrap()).collect();
    assert!(titles.contains(&"Activity Test Studio"));
    assert!(titles.contains(&"Scene 1: Opening Shot"));
    assert!(titles.contains(&"Cyberpunk Sunset"));
}

#[tokio::test]
async fn test_phase10_ai_proxy_validation() {
    let (app, _state, _dir) = setup_test_app().await;

    // 1. Missing API key should return 400 Bad Request
    let req = Request::builder()
        .method("POST")
        .uri("/api/ai/chat")
        .header("Content-Type", "application/json")
        .body(Body::from(json!({
            "provider": "openrouter",
            "api_key": "",
            "messages": [{ "role": "user", "content": "Hello" }]
        }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

    // 2. Unsupported provider should return 400 Bad Request
    let req = Request::builder()
        .method("POST")
        .uri("/api/ai/chat")
        .header("Content-Type", "application/json")
        .body(Body::from(json!({
            "provider": "nonexistent_provider",
            "api_key": "some-key",
            "messages": [{ "role": "user", "content": "Hello" }]
        }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::BAD_REQUEST);

    // 3. Mock mode should return a valid response without external network
    let req = Request::builder()
        .method("POST")
        .uri("/api/ai/chat")
        .header("Content-Type", "application/json")
        .body(Body::from(json!({
            "provider": "mock",
            "api_key": "test-key",
            "model": "mock-claude",
            "messages": [{ "role": "user", "content": "Brainstorm scene ideas" }]
        }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body: serde_json::Value = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(body["provider"], "mock");
    assert!(body["content"].as_str().unwrap().contains("Brainstorm scene ideas"));

    // 4. Test connection flag in mock mode
    let req = Request::builder()
        .method("POST")
        .uri("/api/ai/chat")
        .header("Content-Type", "application/json")
        .body(Body::from(json!({
            "provider": "mock",
            "api_key": "test-key",
            "test_connection": true,
            "messages": []
        }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body: serde_json::Value = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert!(body["content"].as_str().unwrap().contains("Connection test successful"));
}

#[tokio::test]
async fn test_board_items_metadata_enrichment_and_fallbacks() {
    let (app, _state, _dir) = setup_test_app().await;

    // 1. Create a prompt with tags
    let req = Request::builder()
        .method("POST")
        .uri("/api/prompts")
        .header("content-type", "application/json")
        .body(Body::from(json!({
            "title": "Master Prompt",
            "body": "Photorealistic character design rendered in 8k octane",
            "tags": ["hero", "concept"]
        }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);
    let prompt: Prompt = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();

    // 2. Create a character with tags
    let req = Request::builder()
        .method("POST")
        .uri("/api/characters")
        .header("content-type", "application/json")
        .body(Body::from(json!({
            "name": "Kaelen Voss",
            "traits": "Cybernetic arm, trenchcoat, scarred jaw",
            "tags": ["protagonist"]
        }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);
    let character: Character = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();

    // 3. Create a link
    let req = Request::builder()
        .method("POST")
        .uri("/api/links")
        .header("content-type", "application/json")
        .body(Body::from(json!({
            "url": "https://example.com/moodboard",
            "title": "Visual Moodboard Reference",
            "tags": ["reference"]
        }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);
    let link: Link = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();

    // 4. Create a production part
    let req = Request::builder()
        .method("POST")
        .uri("/api/projects/1/parts")
        .header("content-type", "application/json")
        .body(Body::from(json!({
            "title": "Scene 1: Introduction",
            "part_type": "scene",
            "status": "Draft",
            "order_index": 1
        }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);
    let part: ProjectPart = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();

    // 5. Create a board
    let req = Request::builder()
        .method("POST")
        .uri("/api/boards")
        .header("content-type", "application/json")
        .body(Body::from(json!({
            "name": "Planning Board"
        }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);
    let board: Board = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();

    // 6. Pin each item to the board
    // 6a. Pin prompt (test case-insensitivity: "PROMPT")
    let req = Request::builder()
        .method("POST")
        .uri(format!("/api/boards/{}/items", board.id))
        .header("content-type", "application/json")
        .body(Body::from(json!({
            "entity_type": "PROMPT",
            "entity_id": prompt.id
        }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);
    let prompt_item: BoardItem = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(prompt_item.entity_title.as_deref(), Some("Master Prompt"));
    assert!(prompt_item.entity_subtitle.unwrap().contains("Photorealistic"));
    assert!(prompt_item.entity_tags.contains(&"hero".to_string()));

    // 6b. Pin character
    let req = Request::builder()
        .method("POST")
        .uri(format!("/api/boards/{}/items", board.id))
        .header("content-type", "application/json")
        .body(Body::from(json!({
            "entity_type": "character",
            "entity_id": character.id
        }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);
    let char_item: BoardItem = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(char_item.entity_title.as_deref(), Some("Kaelen Voss"));
    assert!(char_item.entity_subtitle.unwrap().contains("Cybernetic arm"));
    assert!(char_item.entity_tags.contains(&"protagonist".to_string()));

    // 6c. Pin link
    let req = Request::builder()
        .method("POST")
        .uri(format!("/api/boards/{}/items", board.id))
        .header("content-type", "application/json")
        .body(Body::from(json!({
            "entity_type": "link",
            "entity_id": link.id
        }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);
    let link_item: BoardItem = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(link_item.entity_title.as_deref(), Some("Visual Moodboard Reference"));
    assert_eq!(link_item.entity_subtitle.as_deref(), Some("https://example.com/moodboard"));

    // 6d. Pin part
    let req = Request::builder()
        .method("POST")
        .uri(format!("/api/boards/{}/items", board.id))
        .header("content-type", "application/json")
        .body(Body::from(json!({
            "entity_type": "part",
            "entity_id": part.id
        }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);
    let part_item: BoardItem = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(part_item.entity_title.as_deref(), Some("Scene 1: Introduction"));
    assert_eq!(part_item.entity_subtitle.as_deref(), Some("scene • Draft"));

    // 6e. Pin sticky note
    let req = Request::builder()
        .method("POST")
        .uri(format!("/api/boards/{}/items", board.id))
        .header("content-type", "application/json")
        .body(Body::from(json!({
            "entity_type": "note",
            "note_text": "Remember camera pan timing"
        }).to_string()))
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::CREATED);
    let note_item: BoardItem = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(note_item.entity_title.as_deref(), Some("Sticky Note"));
    assert_eq!(note_item.note_text.as_deref(), Some("Remember camera pan timing"));

    // 7. Verify GET /api/boards/:id/items returns all 5 items with full metadata
    let req = Request::builder()
        .method("GET")
        .uri(format!("/api/boards/{}/items", board.id))
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let items: Vec<BoardItem> = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(items.len(), 5);

    // 8. Test fallback metadata when a board item references a missing entity
    {
        let conn = _state.pool.get().unwrap();
        conn.execute(
            "INSERT INTO board_items (board_id, entity_type, entity_id, note_text, pos_x, pos_y, width, height, z_index, color, created_at)
             VALUES (?1, 'prompt', 999999, NULL, 0, 0, 240, 160, 0, NULL, datetime('now'))",
            rusqlite::params![board.id],
        ).unwrap();
    }

    // Re-fetch board items: orphan item should have fallback title/subtitle
    let req = Request::builder()
        .method("GET")
        .uri(format!("/api/boards/{}/items", board.id))
        .body(Body::empty())
        .unwrap();
    let resp = app.clone().oneshot(req).await.unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let items_after: Vec<BoardItem> = serde_json::from_slice(&resp.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let orphan_item = items_after.iter().find(|i| i.entity_id == Some(999999)).unwrap();
    assert_eq!(orphan_item.entity_title.as_deref(), Some("Prompt #999999"));
    assert_eq!(orphan_item.entity_subtitle.as_deref(), Some("(Referenced prompt not found)"));
}

