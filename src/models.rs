use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ==========================================
// Prompts
// ==========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Prompt {
    pub id: i64,
    pub title: String,
    pub body: String,
    pub system_prompt: Option<String>,
    pub parameters: Option<String>,
    pub model_used: Option<String>,
    pub category: Option<String>,
    pub notes: Option<String>,
    pub is_favorite: bool,
    pub character_id: Option<i64>,
    pub created_at: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub character_name: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreatePromptDto {
    pub title: String,
    pub body: String,
    pub system_prompt: Option<String>,
    pub parameters: Option<serde_json::Value>,
    pub model_used: Option<String>,
    pub category: Option<String>,
    pub notes: Option<String>,
    pub is_favorite: Option<bool>,
    pub character_id: Option<i64>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdatePromptDto {
    pub title: Option<String>,
    pub body: Option<String>,
    pub system_prompt: Option<String>,
    pub parameters: Option<serde_json::Value>,
    pub model_used: Option<String>,
    pub category: Option<String>,
    pub notes: Option<String>,
    pub is_favorite: Option<bool>,
    pub character_id: Option<i64>,
    pub tags: Option<Vec<String>>,
}

// ==========================================
// Characters
// ==========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Character {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub traits: Option<String>,
    pub image_path: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub prompts_count: Option<i64>,
    pub prompts: Option<Vec<Prompt>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateCharacterDto {
    pub name: String,
    pub description: Option<String>,
    pub traits: Option<String>,
    pub image_path: Option<String>,
    pub notes: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateCharacterDto {
    pub name: Option<String>,
    pub description: Option<String>,
    pub traits: Option<String>,
    pub image_path: Option<String>,
    pub notes: Option<String>,
    pub tags: Option<Vec<String>>,
}

// ==========================================
// Links
// ==========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Link {
    pub id: i64,
    pub url: String,
    pub platform: Option<String>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub thumbnail_url: Option<String>,
    pub created_at: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateLinkDto {
    pub url: String,
    pub platform: Option<String>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub thumbnail_url: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateLinkDto {
    pub url: Option<String>,
    pub platform: Option<String>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub thumbnail_url: Option<String>,
    pub tags: Option<Vec<String>>,
}

// ==========================================
// Tags
// ==========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: i64,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagWithCount {
    pub name: String,
    pub count: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AttachTagDto {
    pub name: Option<String>,
    pub tag: Option<String>,
}

impl AttachTagDto {
    pub fn get_name(&self) -> Option<&str> {
        self.name.as_deref().or(self.tag.as_deref())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaggableRecord {
    pub tag_id: i64,
    pub entity_type: String,
    pub entity_id: i64,
}

// ==========================================
// Boards & Board Items
// ==========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Board {
    pub id: i64,
    pub name: String,
    pub theme: String,
    pub canvas_style: String,
    pub pan_x: f64,
    pub pan_y: f64,
    pub zoom: f64,
    pub drawing_data: serde_json::Value,
    pub created_at: String,
    pub items_count: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateBoardDto {
    pub name: String,
    pub theme: Option<String>,
    pub canvas_style: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateBoardDto {
    pub name: Option<String>,
    pub theme: Option<String>,
    pub canvas_style: Option<String>,
    pub pan_x: Option<f64>,
    pub pan_y: Option<f64>,
    pub zoom: Option<f64>,
    pub drawing_data: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateDrawingDto {
    pub drawing_data: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoardItem {
    pub id: i64,
    pub board_id: i64,
    pub entity_type: String, // 'prompt' | 'character' | 'link' | 'note'
    pub entity_id: Option<i64>,
    pub note_text: Option<String>,
    pub pos_x: f64,
    pub pos_y: f64,
    pub width: f64,
    pub height: f64,
    pub z_index: i64,
    pub color: Option<String>,
    pub created_at: String,

    // Joined metadata from referenced entity
    pub entity_title: Option<String>,
    pub entity_subtitle: Option<String>,
    pub entity_image: Option<String>,
    #[serde(default)]
    pub entity_tags: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateBoardItemDto {
    pub entity_type: String,
    pub entity_id: Option<i64>,
    pub note_text: Option<String>,
    pub pos_x: Option<f64>,
    pub pos_y: Option<f64>,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub z_index: Option<i64>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PatchBoardItemDto {
    pub pos_x: Option<f64>,
    pub pos_y: Option<f64>,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub z_index: Option<i64>,
    pub color: Option<String>,
    pub note_text: Option<String>,
}

// ==========================================
// Search & Unified Result
// ==========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub entity_type: String, // 'prompt' | 'character' | 'link'
    pub id: i64,
    pub title: String,
    pub snippet: String,
    pub image_path: Option<String>,
    pub tags: Vec<String>,
    pub created_at: String,
    pub is_favorite: Option<bool>,
}

// ==========================================
// Backup & Manifest Models
// ==========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupCounts {
    pub characters: usize,
    pub prompts: usize,
    pub links: usize,
    pub tags: usize,
    pub taggables: usize,
    pub boards: usize,
    pub board_items: usize,
    pub uploads: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupManifest {
    pub version: String,
    pub app_name: String,
    pub created_at: String,
    pub counts: BackupCounts,
    pub checksums: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FullBackupData {
    pub characters: Vec<Character>,
    pub prompts: Vec<Prompt>,
    pub links: Vec<Link>,
    pub tags: Vec<Tag>,
    pub taggables: Vec<TaggableRecord>,
    pub boards: Vec<Board>,
    pub board_items: Vec<BoardItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SingleBoardExport {
    pub board: Board,
    pub items: Vec<BoardItem>,
}
