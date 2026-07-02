use crate::error::AppResult;
use std::fs;
use std::path::{Path, PathBuf};

pub fn old_electron_data_dir() -> Option<PathBuf> {
    std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .map(|dir| dir.join("traffic-card-manager"))
}

pub fn copy_legacy_files(old_dir: &Path, new_dir: &Path) -> AppResult<()> {
    fs::create_dir_all(new_dir)?;

    let old_db = old_dir.join("traffic-cards.db");
    let new_db = new_dir.join("traffic-cards.db");
    if !new_db.exists() && old_db.exists() {
        fs::copy(&old_db, &new_db)?;
    }

    let old_config = old_dir.join("config.json");
    let new_config = new_dir.join("config.json");
    if !new_config.exists() && old_config.exists() {
        fs::copy(&old_config, &new_config)?;
    }

    Ok(())
}
