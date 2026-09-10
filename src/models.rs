use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ==========================================
// Projects
// ==========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub status: String,
    pub color: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub prompts_count: Option<i64>,
    #[serde(default)]
    pub characters_count: Option<i64>,
    #[serde(default)]
    pub links_count: Option<i64>,
    #[serde(default)]
    pub boards_count: Option<i64>,
    #[serde(default)]
    pub parts_count: Option<i64>,
    #[serde(default)]
    pub completed_parts_count: Option<i64>,
    #[serde(default)]
    pub progress_percent: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateProjectDto {
    pub name: String,
    pub description: Option<String>,
    pub status: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateProjectDto {
    pub name: Option<String>,
    pub description: Option<String>,
    pub status: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CopyProjectDto {
    #[serde(alias = "name")]
    pub new_name: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MergeProjectDto {
    pub source_project_id: Option<i64>,
    pub target_project_id: Option<i64>,
    pub keep_source: Option<bool>,
    pub rename_conflicts: Option<bool>,
    pub copy_media: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferItemDto {
    pub entity_type: String, // "character" | "prompt" | "link" | "board" | "part"
    pub entity_id: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TransferProjectDto {
    pub source_project_id: i64,
    pub target_project_id: i64,
    pub items: Vec<TransferItemDto>,
    #[serde(alias = "mode")]
    pub action: String, // "move" | "copy"
}

#[derive(Debug, Clone, Deserialize)]
pub struct RevealDto {
    pub path: String,
}

// ==========================================
// Project Parts
// ==========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectPart {
    pub id: i64,
    pub project_id: i64,
    pub title: String,
    pub part_type: String,
    pub status: String,
    pub order_index: i64,
    pub description: Option<String>,
    pub notes: Option<String>,
    pub board_id: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
    #[serde(default)]
    pub linked_character_ids: Vec<i64>,
    #[serde(default)]
    pub linked_prompt_ids: Vec<i64>,
    #[serde(default)]
    pub linked_link_ids: Vec<i64>,
    #[serde(default)]
    pub linked_characters: Vec<Character>,
    #[serde(default)]
    pub linked_prompts: Vec<Prompt>,
    #[serde(default)]
    pub linked_links: Vec<Link>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreatePartDto {
    pub title: String,
    pub part_type: Option<String>,
    pub status: Option<String>,
    pub order_index: Option<i64>,
    pub description: Option<String>,
    pub notes: Option<String>,
    pub board_id: Option<i64>,
    pub linked_character_ids: Option<Vec<i64>>,
    pub linked_prompt_ids: Option<Vec<i64>>,
    pub linked_link_ids: Option<Vec<i64>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdatePartDto {
    pub title: Option<String>,
    pub part_type: Option<String>,
    pub status: Option<String>,
    pub order_index: Option<i64>,
    pub description: Option<String>,
    pub notes: Option<String>,
    pub board_id: Option<i64>,
    pub linked_character_ids: Option<Vec<i64>>,
    pub linked_prompt_ids: Option<Vec<i64>>,
    pub linked_link_ids: Option<Vec<i64>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdatePartStatusDto {
    pub status: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ReorderPartsDto {
    pub part_ids: Vec<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AttachPartEntityDto {
    pub entity_type: String,
    pub entity_id: i64,
}

// ==========================================
// Project Attachments (Custom Addons)
// ==========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectAttachment {
    pub id: i64,
    pub project_id: i64,
    pub part_id: Option<i64>,
    pub name: String,
    pub addon_type: String,
    pub file_path: String,
    pub file_size: Option<i64>,
    pub mime_type: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub download_url: Option<String>,
}

// ==========================================
// Dual Storage Manifest
// ==========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectManifest {
    pub project: Project,
    #[serde(default)]
    pub parts: Vec<ProjectPart>,
    #[serde(default)]
    pub prompts: Vec<Prompt>,
    #[serde(default)]
    pub characters: Vec<Character>,
    #[serde(default)]
    pub links: Vec<Link>,
    #[serde(default)]
    pub boards: Vec<Board>,
    #[serde(default)]
    pub board_items: Vec<BoardItem>,
    #[serde(default)]
    pub attachments: Vec<ProjectAttachment>,
}

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
    #[serde(default)]
    pub project_id: Option<i64>,
    pub created_at: String,
    #[serde(default)]
    pub updated_at: Option<String>,
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
    pub project_id: Option<i64>,
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
    pub project_id: Option<i64>,
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
    #[serde(default)]
    pub project_id: Option<i64>,
    pub created_at: String,
    #[serde(default)]
    pub updated_at: Option<String>,
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
    pub project_id: Option<i64>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateCharacterDto {
    pub name: Option<String>,
    pub description: Option<String>,
    pub traits: Option<String>,
    pub image_path: Option<String>,
    pub notes: Option<String>,
    pub project_id: Option<i64>,
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
    #[serde(default)]
    pub project_id: Option<i64>,
    pub created_at: String,
    #[serde(default)]
    pub updated_at: Option<String>,
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
    pub project_id: Option<i64>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateLinkDto {
    pub url: Option<String>,
    pub platform: Option<String>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub thumbnail_url: Option<String>,
    pub project_id: Option<i64>,
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
    #[serde(default)]
    pub project_id: Option<i64>,
    pub created_at: String,
    #[serde(default)]
    pub updated_at: Option<String>,
    pub items_count: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateBoardDto {
    pub name: String,
    pub theme: Option<String>,
    pub canvas_style: Option<String>,
    pub project_id: Option<i64>,
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
    pub project_id: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateDrawingDto {
    pub drawing_data: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoardItem {
    pub id: i64,
    pub board_id: i64,
    pub entity_type: String, // 'prompt' | 'character' | 'link' | 'note' | 'part'
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

// ==========================================
// Settings Models
// ==========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingItem {
    pub key: String,
    pub value: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SetSettingDto {
    pub value: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct BulkSettingsDto {
    #[serde(default)]
    pub settings: Option<HashMap<String, String>>,
    #[serde(flatten)]
    pub extra: HashMap<String, String>,
}

// ==========================================
// Project Activity Feed
// ==========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectActivityItem {
    pub id: String,
    pub entity_type: String, // "part" | "prompt" | "character" | "link" | "board" | "attachment" | "project"
    pub entity_id: i64,
    pub title: String,
    pub action: String, // "Created" | "Updated" | "Completed"
    pub timestamp: String,
    pub details: Option<String>,
}

// ==========================================
// AI Assistant Models
// ==========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiChatMessage {
    pub role: String, // "system" | "user" | "assistant"
    pub content: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AiChatRequest {
    pub provider: Option<String>,
    pub api_key: Option<String>,
    pub model: Option<String>,
    pub base_url: Option<String>,
    pub messages: Vec<AiChatMessage>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub test_connection: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiChatResponse {
    pub content: String,
    pub model: String,
    pub provider: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<serde_json::Value>,
}
