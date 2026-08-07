# ⚡ Webvio — Project Handoff Documentation

Webvio is a **100% client-side, web-based media aggregation and streaming application** inspired by **Nuvio** and **Stremio**. It runs entirely in modern web browsers as a Single Page Application (SPA), connecting directly to Nuvio's account database for addon & collection syncing, Stremio-compatible scrapers for content discovery, TorBox for debrid stream unrestricted playback, and Simkl for watch history scrobbling.

---

## 🏗️ Architecture & Core Components

```
                      ┌───────────────────────────────────────────────┐
                      │              Webvio (Web SPA)               │
                      └───────┬──────────────┬──────────────┬─────────┘
                              │              │              │
       ┌──────────────────────▼───────┐      │      ┌───────▼────────────────┐
       │   Nuvio Cloud API (Supabase) │      │      │     TorBox Debrid      │
       │   - User Authentication      │      │      │   - Torrent Unrestrict │
       │   - Addon Sync (RPC)         │      │      │   - Cached Stream Links│
       │   - Collections Sync (RPC)   │      │      └────────────────────────┘
       └──────────────────────────────┘      │
                                     ┌───────▼─────────────┐
                                     │  Stremio Scrapers   │
                                     │  - Catalogs & Metas │
                                     │  - Stream Resolvers │
                                     │  - (via CORS Proxy) │
                                     └─────────────────────┘
```

---

## 📁 Repository File Structure

```
Webvio/
├── index.html                   # HTML entry point with Outfit & Inter typography
├── package.json                 # Dependencies (React 19, Zustand, HLS.js, Lucide, Vite 7)
├── tsconfig.app.json            # Vite bundler TS config
├── vite.config.ts               # Vite configuration
└── src/
    ├── main.tsx                 # React DOM mount
    ├── App.tsx                  # Client routing (React Router) & Auth guard
    ├── index.css                # Obsidian & Neon-Violet Design System (~740 lines)
    ├── App.css                  # Global shell overrides
    │
    ├── api/                     # Backend & Third-Party Connectors
    │   ├── nuvio-auth.ts        # Nuvio Supabase auth, RPC addons & collections sync
    │   ├── addon-client.ts      # Stremio-protocol addon manifest/catalog/stream scraper
    │   ├── torbox.ts            # TorBox debrid API (instant availability, unrestrict)
    │   └── simkl.ts             # Simkl OAuth, scrobbler, and library tracking
    │
    ├── store/                   # Zustand State Stores (LocalStorage Persisted)
    │   ├── auth-store.ts        # Nuvio, TorBox, Simkl credentials & CORS proxy config
    │   ├── addon-store.ts       # Installed addons, active state, reordering & RPC sync
    │   └── player-store.ts      # Stream playback position, playback events, subtitles
    │
    ├── utils/                   # Helper Utilities
    │   ├── constants.ts         # Base URLs (Nuvio, Simkl, TorBox)
    │   ├── cors-proxy.ts        # CORS proxy wrapper for browser-restricted addons
    │   └── stream-resolver.ts   # Stream classification (Direct HTTP, Debrid, Torrent)
    │
    ├── components/
    │   ├── layout/              # Layout shell
    │   │   ├── Layout.tsx       # Shell wrapper with Navbar & Sidebar
    │   │   ├── Navbar.tsx       # Floating glass header with search & status badges
    │   │   ├── Sidebar.tsx      # Floating vertical navigation rail
    │   │   └── layout.css       # Layout styles & responsive design
    │   │
    │   ├── catalog/             # Catalog browsing components
    │   │   ├── MediaCard.tsx    # Poster card with hover zoom & overlay badges
    │   │   └── CatalogRow.tsx   # Horizontal scrollable catalog rows
    │   │
    │   ├── detail/              # Media detail & stream selection
    │   │   ├── StreamPicker.tsx # Stream scraper list with ⚡Cached / 🔗Direct tags
    │   │   └── stream-picker.css# Modal & scraper row styles
    │   │
    │   └── player/              # Video playback
    │       ├── VideoPlayer.tsx  # HLS.js adaptive player with native MP4 fallback
    │       └── player.css       # Custom player controls & progress bar
    │
    └── pages/                   # Application Views
        ├── Home.tsx             # Cinematic hero section & multi-addon catalog rows
        ├── Detail.tsx           # Backdrop hero, season/episode selector, stream picker
        ├── Search.tsx           # Real-time multi-addon search with debouncing
        ├── Library.tsx          # Synced Nuvio collection cards & Simkl watch history
        ├── Player.tsx           # Fullscreen player with 80% Simkl scrobbling
        ├── Settings.tsx         # Addon drag-and-drop manager & API credentials
        └── *.css                # Page-specific styling
```

---

## 🔑 Key Features & Implementation Details

### 1. Nuvio Cloud Sync Integration (`src/api/nuvio-auth.ts`)
* **Endpoint**: `https://api.nuvio.tv`
* **Anon Key**: `sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN`
* **Authentication**: Supabase Password Grant (`/auth/v1/token?grant_type=password`).
* **Addon Sync**: Calls Supabase RPC `sync_push_addons` with `p_profile_id` and `p_addons` whenever addons are added, removed, or reordered.
* **Collection Sync**: Calls Supabase RPC `sync_pull_collections` on library load and `sync_push_collections` when items are saved/removed.

### 2. Addon Reordering (`src/store/addon-store.ts` & `src/pages/Settings.tsx`)
* **Drag-and-Drop**: Built-in HTML5 drag-and-drop handles (`⋮⋮`) with `draggable`, `onDragStart`, `onDrop`.
* **Move Up/Down**: `moveAddonUp(index)` and `moveAddonDown(index)` quick action buttons.
* **Execution Priority**: The reordered sequence immediately sets the prioritization order for homepage catalog rows and stream resolution.

### 3. Stream Picker & TorBox Debrid (`src/components/detail/StreamPicker.tsx` & `src/utils/stream-resolver.ts`)
* Classifies streams into:
  * ⚡ **Debrid Cached** (Instant playback via TorBox unrestrict).
  * 🔗 **Direct Stream** (Free HTTP streams, no debrid required).
  * 🧲 **P2P Torrent** (Can be sent to TorBox to download & cache).
* Displays quality badges (`4K`, `1080p`, `720p`), codec (`HEVC`, `AVC`), and seeders/peers.

### 4. Video Player & Auto-Scrobble (`src/pages/Player.tsx` & `src/components/player/VideoPlayer.tsx`)
* **Adaptive HLS & Direct MP4**: Automatically mounts HLS.js for `.m3u8` streams and falls back to standard HTML5 `<video>` for `.mp4`/`.mkv`.
* **Watch Progress**: Automatically saved every 5 seconds to `localStorage`.
* **Simkl Scrobbler**: Sends a scrobble request (`/sync/history`) to Simkl when playback crosses the **80% threshold**.

### 5. Nuvio Obsidian Design System (`src/index.css`)
* **Palette**: Ultra-dark obsidian (`#030407`), elevated glass (`#08090d`), glowing violet (`#8b5cf6`), and neon magenta (`#d946ef`).
* **Components**: Floating glass header (`top: 15px`, `backdrop-filter: blur(20px)`), floating expandable sidebar, and cards with hover scale (`translateY(-6px) scale(1.03)`).

---

## 🚀 How to Run & Deploy

### Run Locally (Development)
```bash
# 1. Install dependencies
npm install

# 2. Start Vite development server
npm run dev
# -> Accessible at http://localhost:5173
```

### Production Build
```bash
npm run build
# -> Outputs static bundle to dist/
```

### Static Hosting (Vercel, Netlify, GitHub Pages, Cloudflare Pages)
Webvio is 100% client-side:
1. Connect your repository to **Vercel**, **Netlify**, or **Cloudflare Pages**.
2. Set build command: `npm run build`.
3. Set output directory: `dist`.
4. All user tokens and API keys are stored in `localStorage` in the user's browser, requiring zero server-side infrastructure.

---

## 💾 LocalStorage Key Schema

| Key | Description |
|-----|-------------|
| `webvio_nuvio_accessToken` | Nuvio Supabase JWT session token |
| `webvio_nuvio_refreshToken` | Nuvio session refresh token |
| `webvio_nuvio_userId` | Nuvio user UUID |
| `webvio_nuvio_email` | Nuvio account email |
| `webvio_torbox_apiKey` | TorBox user API key |
| `webvio_torbox_user` | Cached TorBox account info JSON |
| `webvio_simkl_token` | Simkl OAuth access token |
| `webvio_simkl_clientId` | Simkl client ID |
| `webvio_cors_proxy` | Custom CORS proxy URL prefix |
| `webvio_addons` | Installed addon manifests and order JSON |
| `webvio_progress` | Watch history progress dictionary |

---

## 🔮 Recommended Next Steps

1. **Subtitles Addon Support**: Integrate Stremio subtitle addons (e.g., OpenSubtitles v3) into `VideoPlayer.tsx` using `<track>` elements.
2. **Trakt Integration**: Add Trakt OAuth support alongside Simkl for multi-platform scrobbling.
3. **TV Navigation Mode**: Implement spatial navigation (arrow keys & D-pad) for full 10-foot Smart TV/Android TV controller support.
