use axum::{extract::State, Json};
use serde_json::json;
use std::time::Duration;

use crate::{
    main_types::{AppError, AppState},
    models::{AiChatMessage, AiChatRequest, AiChatResponse},
};

fn get_db_setting(conn: &rusqlite::Connection, key: &str) -> Option<String> {
    let mut stmt = conn
        .prepare("SELECT value FROM settings WHERE key = ?1")
        .ok()?;
    stmt.query_row([key], |row| row.get(0)).ok()
}

pub async fn ai_chat(
    State(state): State<AppState>,
    Json(payload): Json<AiChatRequest>,
) -> Result<Json<AiChatResponse>, AppError> {
    let conn = state.pool.get()?;

    // Resolve provider
    let provider = payload
        .provider
        .filter(|s| !s.trim().is_empty())
        .or_else(|| get_db_setting(&conn, "ai_provider"))
        .unwrap_or_else(|| "openrouter".to_string())
        .to_lowercase();

    // Resolve API key
    let api_key = payload
        .api_key
        .filter(|s| !s.trim().is_empty())
        .or_else(|| get_db_setting(&conn, "ai_api_key"))
        .unwrap_or_default();

    // Resolve model
    let model = payload
        .model
        .filter(|s| !s.trim().is_empty())
        .or_else(|| get_db_setting(&conn, "ai_model"))
        .unwrap_or_else(|| match provider.as_str() {
            "openrouter" => "anthropic/claude-3.5-sonnet".to_string(),
            "openai" => "gpt-4o-mini".to_string(),
            "anthropic" => "claude-3-5-sonnet-20241022".to_string(),
            "gemini" => "gemini-1.5-flash".to_string(),
            "groq" => "llama-3.1-70b-versatile".to_string(),
            "ollama" => "llama3".to_string(),
            _ => "default-model".to_string(),
        });

    // Resolve base URL
    let base_url = payload
        .base_url
        .filter(|s| !s.trim().is_empty())
        .or_else(|| get_db_setting(&conn, "ai_base_url"));

    // Check if test connection mode
    let is_test = payload.test_connection.unwrap_or(false);

    // Support offline mock / testing for tests and development
    if provider == "mock"
        || api_key == "test-key"
        || api_key == "mock-test"
        || model.starts_with("mock")
    {
        let mock_reply = if is_test {
            "Connection test successful! (Mock provider mode active)".to_string()
        } else {
            let user_prompt = payload
                .messages
                .last()
                .map(|m| m.content.as_str())
                .unwrap_or("Hello");
            format!(
                "Atelier AI [{}]: Mock generated response for \"{}\". Ready to assist with prompts, characters, and scenes.",
                model, user_prompt
            )
        };

        return Ok(Json(AiChatResponse {
            content: mock_reply,
            model,
            provider,
            usage: Some(json!({ "prompt_tokens": 10, "completion_tokens": 25, "total_tokens": 35 })),
        }));
    }

    // Validation
    if provider != "ollama" && api_key.trim().is_empty() {
        return Err(AppError::BadRequest(format!(
            "API key is required for provider '{}'. Configure it in Settings.",
            provider
        )));
    }

    let messages = if payload.messages.is_empty() {
        vec![AiChatMessage {
            role: "user".to_string(),
            content: "Hello".to_string(),
        }]
    } else {
        payload.messages
    };

    let client = state.http_client.clone();
    let timeout = Duration::from_secs(45);

    match provider.as_str() {
        "openrouter" | "openai" | "groq" => {
            let endpoint = if let Some(ref base) = base_url {
                let trimmed = base.trim_end_matches('/');
                if trimmed.ends_with("/chat/completions") {
                    trimmed.to_string()
                } else {
                    format!("{}/chat/completions", trimmed)
                }
            } else {
                match provider.as_str() {
                    "openrouter" => "https://openrouter.ai/api/v1/chat/completions".to_string(),
                    "openai" => "https://api.openai.com/v1/chat/completions".to_string(),
                    "groq" => "https://api.groq.com/openai/v1/chat/completions".to_string(),
                    _ => unreachable!(),
                }
            };

            let body = json!({
                "model": model,
                "messages": messages.iter().map(|m| json!({
                    "role": m.role,
                    "content": m.content
                })).collect::<Vec<_>>(),
                "temperature": payload.temperature.unwrap_or(0.7),
                "max_tokens": payload.max_tokens.unwrap_or(1024),
            });

            let mut req_builder = client
                .post(&endpoint)
                .timeout(timeout)
                .header("Authorization", format!("Bearer {}", api_key))
                .header("Content-Type", "application/json");

            if provider == "openrouter" {
                req_builder = req_builder
                    .header("HTTP-Referer", "http://localhost:8080")
                    .header("X-Title", "Atelier");
            }

            let resp = req_builder
                .json(&body)
                .send()
                .await
                .map_err(|e| AppError::Internal(format!("Failed to reach {}: {}", provider, e)))?;

            let status = resp.status();
            let resp_text = resp
                .text()
                .await
                .unwrap_or_else(|_| "Failed to read response body".to_string());

            if !status.is_success() {
                return Err(AppError::BadRequest(format!(
                    "{} API error (HTTP {}): {}",
                    provider, status, resp_text
                )));
            }

            let parsed: serde_json::Value = serde_json::from_str(&resp_text)
                .map_err(|e| AppError::Internal(format!("Failed to parse response JSON: {}", e)))?;

            let content = parsed["choices"][0]["message"]["content"]
                .as_str()
                .unwrap_or("")
                .to_string();

            Ok(Json(AiChatResponse {
                content,
                model,
                provider,
                usage: parsed.get("usage").cloned(),
            }))
        }
        "anthropic" => {
            let endpoint = base_url
                .as_deref()
                .map(|b| {
                    let trimmed = b.trim_end_matches('/');
                    if trimmed.ends_with("/messages") {
                        trimmed.to_string()
                    } else {
                        format!("{}/v1/messages", trimmed)
                    }
                })
                .unwrap_or_else(|| "https://api.anthropic.com/v1/messages".to_string());

            // Extract system message if present
            let mut system_prompt = String::new();
            let mut anthropic_messages = Vec::new();
            for m in &messages {
                if m.role == "system" {
                    if !system_prompt.is_empty() {
                        system_prompt.push('\n');
                    }
                    system_prompt.push_str(&m.content);
                } else {
                    anthropic_messages.push(json!({
                        "role": m.role,
                        "content": m.content
                    }));
                }
            }

            let mut body = json!({
                "model": model,
                "messages": anthropic_messages,
                "max_tokens": payload.max_tokens.unwrap_or(1024),
                "temperature": payload.temperature.unwrap_or(0.7),
            });

            if !system_prompt.is_empty() {
                body["system"] = json!(system_prompt);
            }

            let resp = client
                .post(endpoint)
                .timeout(timeout)
                .header("x-api-key", &api_key)
                .header("anthropic-version", "2023-06-01")
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await
                .map_err(|e| AppError::Internal(format!("Failed to reach Anthropic: {}", e)))?;

            let status = resp.status();
            let resp_text = resp
                .text()
                .await
                .unwrap_or_else(|_| "Failed to read response body".to_string());

            if !status.is_success() {
                return Err(AppError::BadRequest(format!(
                    "Anthropic API error (HTTP {}): {}",
                    status, resp_text
                )));
            }

            let parsed: serde_json::Value = serde_json::from_str(&resp_text)
                .map_err(|e| AppError::Internal(format!("Failed to parse response JSON: {}", e)))?;

            let content = parsed["content"][0]["text"]
                .as_str()
                .unwrap_or("")
                .to_string();

            Ok(Json(AiChatResponse {
                content,
                model,
                provider,
                usage: parsed.get("usage").cloned(),
            }))
        }
        "gemini" => {
            let endpoint = format!(
                "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
                model, api_key
            );

            let contents = messages
                .iter()
                .map(|m| {
                    let role = if m.role == "assistant" { "model" } else { "user" };
                    json!({
                        "role": role,
                        "parts": [{ "text": m.content }]
                    })
                })
                .collect::<Vec<_>>();

            let body = json!({
                "contents": contents,
                "generationConfig": {
                    "temperature": payload.temperature.unwrap_or(0.7),
                    "maxOutputTokens": payload.max_tokens.unwrap_or(1024),
                }
            });

            let resp = client
                .post(&endpoint)
                .timeout(timeout)
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await
                .map_err(|e| AppError::Internal(format!("Failed to reach Gemini: {}", e)))?;

            let status = resp.status();
            let resp_text = resp
                .text()
                .await
                .unwrap_or_else(|_| "Failed to read response body".to_string());

            if !status.is_success() {
                return Err(AppError::BadRequest(format!(
                    "Gemini API error (HTTP {}): {}",
                    status, resp_text
                )));
            }

            let parsed: serde_json::Value = serde_json::from_str(&resp_text)
                .map_err(|e| AppError::Internal(format!("Failed to parse response JSON: {}", e)))?;

            let content = parsed["candidates"][0]["content"]["parts"][0]["text"]
                .as_str()
                .unwrap_or("")
                .to_string();

            Ok(Json(AiChatResponse {
                content,
                model,
                provider,
                usage: parsed.get("usageMetadata").cloned(),
            }))
        }
        "ollama" => {
            let host = base_url.unwrap_or_else(|| "http://localhost:11434".to_string());
            let endpoint = format!("{}/api/chat", host.trim_end_matches('/'));

            let body = json!({
                "model": model,
                "messages": messages.iter().map(|m| json!({
                    "role": m.role,
                    "content": m.content
                })).collect::<Vec<_>>(),
                "stream": false,
            });

            let resp = client
                .post(&endpoint)
                .timeout(timeout)
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await
                .map_err(|e| AppError::Internal(format!("Failed to reach Ollama at {}: {}", host, e)))?;

            let status = resp.status();
            let resp_text = resp
                .text()
                .await
                .unwrap_or_else(|_| "Failed to read response body".to_string());

            if !status.is_success() {
                return Err(AppError::BadRequest(format!(
                    "Ollama error (HTTP {}): {}",
                    status, resp_text
                )));
            }

            let parsed: serde_json::Value = serde_json::from_str(&resp_text)
                .map_err(|e| AppError::Internal(format!("Failed to parse response JSON: {}", e)))?;

            let content = parsed["message"]["content"]
                .as_str()
                .unwrap_or("")
                .to_string();

            Ok(Json(AiChatResponse {
                content,
                model,
                provider,
                usage: None,
            }))
        }
        _ => Err(AppError::BadRequest(format!(
            "Unsupported AI provider '{}'. Supported: openrouter, openai, anthropic, gemini, groq, ollama",
            provider
        ))),
    }
}
