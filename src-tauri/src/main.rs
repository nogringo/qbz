// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Use xdg-desktop-portal for file dialogs on Linux
    // This makes GTK apps use native file pickers (e.g., KDE's on Plasma)
    #[cfg(target_os = "linux")]
    std::env::set_var("GTK_USE_PORTAL", "1");

    qbz_nix_lib::run()
}
