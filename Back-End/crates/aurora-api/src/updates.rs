use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};
use semver::Version;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct UpdateQuery {
    pub platform: Option<String>,
    pub current_version: String,
}

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    name: Option<String>,
    body: Option<String>,
    html_url: String,
    published_at: Option<String>,
    assets: Vec<GitHubAsset>,
}

#[derive(Debug, Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

#[derive(Debug, Serialize)]
struct ApkAsset {
    name: String,
    download_url: String,
    size_bytes: u64,
}

#[derive(Debug, Serialize)]
struct UpdateResponse {
    platform: String,
    current_version: String,
    latest_version: Option<String>,
    update_available: bool,
    installable: bool,
    release_name: Option<String>,
    release_notes: Option<String>,
    release_page: Option<String>,
    published_at: Option<String>,
    apk: Option<ApkAsset>,
}

fn parse_version(value: &str) -> Option<Version> {
    Version::parse(value.trim().trim_start_matches('v')).ok()
}

/// Consulta a release mais recente do GitHub. O APK é baixado diretamente
/// do asset oficial da release; a API nunca hospeda nem modifica o instalador.
pub async fn check_update(
    State(state): State<AppState>,
    Query(query): Query<UpdateQuery>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let platform = query.platform.as_deref().unwrap_or("android");
    if platform != "android" {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Plataforma não suportada" })),
        ));
    }

    let current = parse_version(&query.current_version).ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "current_version precisa ser uma versão semântica válida" })),
        )
    })?;

    let url = format!(
        "https://api.github.com/repos/{}/releases/latest",
        state.release_repository
    );

    let response = reqwest::Client::new()
        .get(url)
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .header(reqwest::header::USER_AGENT, "Aurora-IDE-Updater")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|error| {
            tracing::warn!(%error, "Falha ao consultar releases do GitHub");
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "error": "Não foi possível consultar as atualizações" })),
            )
        })?;

    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(Json(json!(UpdateResponse {
            platform: platform.to_owned(),
            current_version: query.current_version,
            latest_version: None,
            update_available: false,
            installable: false,
            release_name: None,
            release_notes: None,
            release_page: None,
            published_at: None,
            apk: None,
        })));
    }

    if !response.status().is_success() {
        let status = response.status();
        tracing::warn!(%status, "GitHub não retornou releases com sucesso");
        return Err((
            StatusCode::BAD_GATEWAY,
            Json(json!({ "error": "O serviço de releases está temporariamente indisponível" })),
        ));
    }

    let release: GitHubRelease = response.json().await.map_err(|error| {
        tracing::error!(%error, "Resposta de release do GitHub inválida");
        (
            StatusCode::BAD_GATEWAY,
            Json(json!({ "error": "Resposta de atualização inválida" })),
        )
    })?;

    let latest = parse_version(&release.tag_name).ok_or_else(|| {
        (
            StatusCode::BAD_GATEWAY,
            Json(json!({ "error": "A release mais recente possui uma versão inválida" })),
        )
    })?;
    let update_available = latest > current;
    let apk = release
        .assets
        .iter()
        .find(|asset| asset.name.to_ascii_lowercase().ends_with(".apk"))
        .map(|asset| ApkAsset {
            name: asset.name.clone(),
            download_url: asset.browser_download_url.clone(),
            size_bytes: asset.size,
        });

    Ok(Json(json!(UpdateResponse {
        platform: platform.to_owned(),
        current_version: query.current_version,
        latest_version: Some(release.tag_name),
        update_available,
        installable: update_available && apk.is_some(),
        release_name: release.name,
        release_notes: release.body,
        release_page: Some(release.html_url),
        published_at: release.published_at,
        apk,
    })))
}

#[cfg(test)]
mod tests {
    use super::parse_version;

    #[test]
    fn accepts_versions_with_or_without_v_prefix() {
        assert_eq!(parse_version("v1.2.3"), parse_version("1.2.3"));
    }

    #[test]
    fn rejects_invalid_versions() {
        assert!(parse_version("versao-invalida").is_none());
    }

    #[test]
    fn compares_semantic_versions_correctly() {
        assert!(parse_version("1.2.0") > parse_version("1.1.9"));
        assert!(parse_version("1.2.0") > parse_version("1.2.0-rc.1"));
    }
}
