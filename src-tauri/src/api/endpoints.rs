//! API endpoint definitions

pub const BASE_URL: &str = "https://www.qobuz.com/api.json/0.2";

/// Endpoint paths
pub mod paths {
    // User
    pub const USER_LOGIN: &str = "/user/login";

    // Track
    pub const TRACK_GET: &str = "/track/get";
    pub const TRACK_SEARCH: &str = "/track/search";
    pub const TRACK_GET_FILE_URL: &str = "/track/getFileUrl";

    // Album
    pub const ALBUM_GET: &str = "/album/get";
    pub const ALBUM_SEARCH: &str = "/album/search";

    // Artist
    pub const ARTIST_GET: &str = "/artist/get";
    pub const ARTIST_SEARCH: &str = "/artist/search";

    // Playlist
    pub const PLAYLIST_GET: &str = "/playlist/get";
    pub const PLAYLIST_SEARCH: &str = "/playlist/search";
    pub const PLAYLIST_GET_USER_PLAYLISTS: &str = "/playlist/getUserPlaylists";

    // Favorites
    pub const FAVORITE_GET_USER_FAVORITES: &str = "/favorite/getUserFavorites";
    pub const FAVORITE_CREATE: &str = "/favorite/create";
    pub const FAVORITE_DELETE: &str = "/favorite/delete";

    // Label
    pub const LABEL_GET: &str = "/label/get";
}

/// Build full URL for an endpoint
pub fn build_url(endpoint: &str) -> String {
    format!("{}{}", BASE_URL, endpoint)
}
