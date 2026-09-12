use atelier::{create_app, db::init_pool, main_types::AppState};
use std::net::SocketAddr;
use std::path::PathBuf;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let args: Vec<String> = std::env::args().collect();

    // Check for help/version flags
    if args.iter().any(|a| a == "--help" || a == "-h") {
        println!("Atelier v0.1.0 - Creative Social Media & Content Planning Studio\n");
        println!("USAGE:");
        println!("  atelier [OPTIONS]\n");
        println!("OPTIONS:");
        println!("  --port <PORT>        Specify HTTP server port (default: 8080 or PORT env)");
        println!("  --data-dir <PATH>    Specify custom data directory (default: %LOCALAPPDATA%/Atelier/data or ./data)");
        println!("  --portable           Force portable mode (stores data in ./data next to executable)");
        println!("  --no-browser         Do not open the default web browser on launch");
        println!("  --headless           Same as --no-browser");
        println!("  -h, --help           Print help information");
        println!("  -v, --version        Print version information");
        return Ok(());
    }

    if args.iter().any(|a| a == "--version" || a == "-v") {
        println!("Atelier v0.1.0");
        return Ok(());
    }

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "atelier=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Determine executable directory
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));

    let cur_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));

    // 1. Resolve static directory
    let static_dir = if exe_dir.join("static").is_dir() {
        exe_dir.join("static")
    } else if cur_dir.join("static").is_dir() {
        cur_dir.join("static")
    } else {
        exe_dir.join("static")
    };

    // 2. Parse command-line parameters
    let mut custom_data_dir: Option<PathBuf> = None;
    let mut custom_port: Option<u16> = None;
    let is_portable = args.iter().any(|a| a == "--portable");
    let no_browser = args.iter().any(|a| a == "--no-browser" || a == "--headless");

    let mut i = 1;
    while i < args.len() {
        if args[i] == "--data-dir" && i + 1 < args.len() {
            custom_data_dir = Some(PathBuf::from(&args[i + 1]));
            i += 2;
        } else if args[i] == "--port" && i + 1 < args.len() {
            if let Ok(p) = args[i + 1].parse::<u16>() {
                custom_port = Some(p);
            }
            i += 2;
        } else {
            i += 1;
        }
    }

    // 3. Resolve data directory
    let data_dir = if let Some(dir) = custom_data_dir {
        dir
    } else if let Ok(env_dir) = std::env::var("ATELIER_DATA_DIR") {
        PathBuf::from(env_dir)
    } else if is_portable || exe_dir.join("data").is_dir() {
        exe_dir.join("data")
    } else if cur_dir.join("data").is_dir() {
        cur_dir.join("data")
    } else {
        #[cfg(target_os = "windows")]
        {
            if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
                PathBuf::from(local_appdata).join("Atelier").join("data")
            } else if let Ok(appdata) = std::env::var("APPDATA") {
                PathBuf::from(appdata).join("Atelier").join("data")
            } else {
                exe_dir.join("data")
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            if let Ok(home) = std::env::var("HOME") {
                PathBuf::from(home).join(".atelier").join("data")
            } else {
                exe_dir.join("data")
            }
        }
    };

    let uploads_dir = data_dir.join("uploads");
    let db_path = data_dir.join("atelier.db");

    std::fs::create_dir_all(&data_dir)?;
    std::fs::create_dir_all(&uploads_dir)?;
    std::fs::create_dir_all(&static_dir)?;

    tracing::info!("Atelier base directory: {:?}", exe_dir);
    tracing::info!("Atelier data directory: {:?}", data_dir);
    tracing::info!("Atelier static directory: {:?}", static_dir);

    let pool = init_pool(&db_path)?;
    let http_client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()?;

    let state = AppState {
        pool,
        db_path,
        data_dir,
        uploads_dir,
        static_dir,
        http_client,
    };

    let app = create_app(state);

    let port: u16 = custom_port
        .or_else(|| std::env::var("PORT").ok().and_then(|p| p.parse().ok()))
        .unwrap_or(8080);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("Atelier studio server starting on http://localhost:{}", port);

    // Auto-launch web browser on desktop startup if not suppressed
    if !no_browser {
        let launch_url = format!("http://localhost:{}", port);
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(350)).await;
            #[cfg(target_os = "windows")]
            {
                let _ = std::process::Command::new("cmd")
                    .args(["/C", "start", &launch_url])
                    .spawn();
            }
            #[cfg(target_os = "macos")]
            {
                let _ = std::process::Command::new("open")
                    .arg(&launch_url)
                    .spawn();
            }
            #[cfg(target_os = "linux")]
            {
                let _ = std::process::Command::new("xdg-open")
                    .arg(&launch_url)
                    .spawn();
            }
        });
    }

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    tracing::info!("Shutting down Atelier gracefully...");
}
