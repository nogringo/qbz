//! Bundle token extraction from Qobuz web player
//!
//! Extracts app_id and secrets from the Qobuz JavaScript bundle.
//! This is necessary because Qobuz doesn't provide a public API.

use regex::Regex;
use reqwest::Client;

use super::error::{ApiError, Result};

const LOGIN_PAGE_URL: &str = "https://play.qobuz.com/login";
const BUNDLE_BASE_URL: &str = "https://play.qobuz.com";

/// Extracted bundle tokens
#[derive(Debug, Clone)]
pub struct BundleTokens {
    pub app_id: String,
    pub secrets: Vec<String>,
}

/// Extract app_id and secrets from Qobuz bundle
pub async fn extract_bundle_tokens(client: &Client) -> Result<BundleTokens> {
    // Step 1: Get login page to find bundle URL
    let login_page = client
        .get(LOGIN_PAGE_URL)
        .send()
        .await?
        .text()
        .await?;

    let bundle_url = extract_bundle_url(&login_page)?;
    let full_bundle_url = format!("{}{}", BUNDLE_BASE_URL, bundle_url);

    // Step 2: Fetch the bundle
    let bundle_content = client
        .get(&full_bundle_url)
        .send()
        .await?
        .text()
        .await?;

    // Step 3: Extract app_id
    let app_id = extract_app_id(&bundle_content)?;

    // Step 4: Extract secrets
    let secrets = extract_secrets(&bundle_content)?;

    if secrets.is_empty() {
        return Err(ApiError::BundleExtractionError(
            "No secrets found in bundle".to_string(),
        ));
    }

    Ok(BundleTokens { app_id, secrets })
}

fn extract_bundle_url(html: &str) -> Result<String> {
    // Pattern: <script src="/resources/X.X.X-bXXX/bundle.js"></script>
    let re = Regex::new(r#"<script src="(/resources/\d+\.\d+\.\d+-[a-z]\d{3}/bundle\.js)"></script>"#)
        .expect("Invalid regex");

    re.captures(html)
        .and_then(|caps| caps.get(1))
        .map(|m| m.as_str().to_string())
        .ok_or_else(|| ApiError::BundleExtractionError("Bundle URL not found".to_string()))
}

fn extract_app_id(bundle: &str) -> Result<String> {
    // Pattern: production:{api:{appId:"XXXXXXXXX"
    let re = Regex::new(r#"production:\{api:\{appId:"(?P<app_id>\d{9})""#)
        .expect("Invalid regex");

    re.captures(bundle)
        .and_then(|caps| caps.name("app_id"))
        .map(|m| m.as_str().to_string())
        .ok_or_else(|| ApiError::BundleExtractionError("App ID not found".to_string()))
}

fn extract_secrets(bundle: &str) -> Result<Vec<String>> {
    // Extract seeds with their timezone keys
    // Pattern: X.initialSeed("SEED",window.utimezone.TIMEZONE)
    let seed_re = Regex::new(
        r#"[a-z]\.initialSeed\("(?P<seed>[\w=]+)",window\.utimezone\.(?P<timezone>[a-z]+)\)"#,
    )
    .expect("Invalid regex");

    let mut seeds: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for caps in seed_re.captures_iter(bundle) {
        if let (Some(seed), Some(tz)) = (caps.name("seed"), caps.name("timezone")) {
            seeds.insert(tz.as_str().to_string(), seed.as_str().to_string());
        }
    }

    if seeds.is_empty() {
        return Err(ApiError::BundleExtractionError("No seeds found".to_string()));
    }

    // Extract info and extras for each timezone
    // This is a simplified version - the actual extraction is more complex
    // and involves base64 decoding and concatenation
    let info_re = Regex::new(r#""(?P<timezone>[a-z]+)":\{info:"(?P<info>[\w=]+)",extras:"(?P<extras>[\w=]+)""#)
        .expect("Invalid regex");

    let mut secrets = Vec::new();

    for caps in info_re.captures_iter(bundle) {
        if let (Some(tz), Some(info), Some(extras)) = (
            caps.name("timezone"),
            caps.name("info"),
            caps.name("extras"),
        ) {
            if let Some(seed) = seeds.get(tz.as_str()) {
                // Concatenate seed + info + extras, remove last 44 chars, base64 decode
                let combined = format!("{}{}{}", seed, info.as_str(), extras.as_str());
                if combined.len() > 44 {
                    let trimmed = &combined[..combined.len() - 44];
                    if let Ok(decoded) = base64::Engine::decode(
                        &base64::engine::general_purpose::STANDARD,
                        trimmed,
                    ) {
                        if let Ok(secret) = String::from_utf8(decoded) {
                            secrets.push(secret);
                        }
                    }
                }
            }
        }
    }

    // If the complex extraction fails, try a simpler pattern
    // that might work for some bundle versions
    if secrets.is_empty() {
        let simple_re = Regex::new(r#"appSecret:"([a-f0-9]{32})""#).expect("Invalid regex");
        for caps in simple_re.captures_iter(bundle) {
            if let Some(secret) = caps.get(1) {
                secrets.push(secret.as_str().to_string());
            }
        }
    }

    Ok(secrets)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_bundle_url() {
        let html = r#"<script src="/resources/7.0.1-b001/bundle.js"></script>"#;
        let result = extract_bundle_url(html);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "/resources/7.0.1-b001/bundle.js");
    }

    #[test]
    fn test_extract_app_id() {
        let bundle = r#"production:{api:{appId:"123456789",appSecret:"abc"}"#;
        let result = extract_app_id(bundle);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "123456789");
    }
}
