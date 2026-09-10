pub mod ai;
pub mod attachments;
pub mod backup;
pub mod boards;
pub mod characters;
pub mod filesystem;
pub mod links;
pub mod parts;
pub mod projects;
pub mod prompts;
pub mod search;
pub mod settings;
pub mod tags;
pub mod upload;

pub fn safe_truncate(s: &str, max_chars: usize) -> String {
    let char_count = s.chars().count();
    if char_count > max_chars {
        let take_count = max_chars.saturating_sub(3);
        let prefix: String = s.chars().take(take_count).collect();
        format!("{}...", prefix)
    } else {
        s.to_string()
    }
}
