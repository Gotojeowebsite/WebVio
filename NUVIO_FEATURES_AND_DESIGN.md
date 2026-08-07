# Webvio — Features & Nuvio Design Reference

> A complete catalogue of every feature implemented and every design decision made for the Webvio streaming SPA.

---

## 🏛️ Architecture

| Property | Detail |
|---|---|
| **App Type** | 100% client-side Single Page Application (SPA) |
| **Framework** | React 19 + Vite 8 + TypeScript |
| **State** | Zustand 5 stores (no server, all in browser memory + `localStorage`) |
| **Routing** | React Router v7 with `BrowserRouter` + Cloudflare Pages `_redirects` SPA fallback |
| **Styling** | Vanilla CSS design system (no Tailwind) |

---

## 🔑 Authentication & Cloud Sync

### Nuvio (Primary)
- Login via **Supabase Password Grant** (`/auth/v1/token?grant_type=password`) to `https://api.nuvio.tv`
- Anon key: `sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN`
- JWT `access_token` and `refresh_token` stored in `localStorage`
- **Addon Sync**: `sync_push_addons` RPC called whenever addons are added, removed, reordered, or toggled
- **Collection Sync**: `sync_pull_collections` / `sync_push_collections` RPC for library items

### TorBox (Optional debrid)
- API key validated against `/v1/api/user/me`
- Stored in `localStorage`; shown as connected badge in Navbar

### Simkl (Optional tracking)
- OAuth Authorization Code flow via `https://simkl.com/oauth/authorize`
- User supplies their own **Client ID** (registered at simkl.com/settings/developer)
- Access token stored in `localStorage`

---

## 🧩 Addon System (Stremio Protocol)

### Installation
- **Auto-load from Nuvio**: On login, fetches `/rest/v1/addons?user_id=&profile_id=` and loads every enabled addon manifest
- **Manual install**: Paste any Stremio-compatible manifest URL in Settings
- Manifests are cached in `localStorage` (`webvio_addons`) — works offline

### Addon Client (`AddonClient` class)
- Fetches `manifest.json` from addon base URL
- **Catalog**: `GET /catalog/{type}/{id}/{extra=value&extra2=value2}.json` (Stremio path-segment format)
- **Meta**: `GET /meta/{type}/{id}.json`
- **Streams**: `GET /stream/{type}/{id}.json`
- **Subtitles**: `GET /subtitles/{type}/{id}.json`
- All requests routed through configurable **CORS proxy** (`fetchWithProxy`)

### Reordering
- HTML5 drag-and-drop with `draggable`, `onDragStart`, `onDrop`
- ▲ / ▼ move-up/move-down quick buttons
- Reorder triggers `sync_push_addons` RPC to sync order back to Nuvio

### Priority
- Addons are queried in their stored order — first addon wins for meta lookups; all addons queried in parallel for streams

---

## 🔗 CORS Proxy
- User-configurable URL prefix stored in `localStorage` (`webvio_cors_proxy`)
- Applied as: `${proxyUrl}${encodeURIComponent(targetUrl)}`
- Falls back to direct fetch if proxy fails
- Can be a free **Cloudflare Worker** proxy

---

## 🎬 Stream Resolution

### Stream Types & Priority

| Icon | Type | Description |
|------|------|-------------|
| 🔗 | **Direct HTTP** | Free, no debrid. Played directly. Sorted first. |
| ⚡ | **Debrid Cached** | TorBox instant playback. Sorted second. |
| 🧲 | **P2P Torrent** | Uncached. TorBox creates + resolves the torrent. |
| 🌐 | **External** | `externalUrl` — opened in new browser tab. |

### Stream Info Parsing (`parseStreamInfo`)
Extracted from stream `name`, `title`, and `behaviorHints.filename`:
- **Quality**: 4K / 1080p / 720p / 480p
- **Codec**: HEVC / H.264 / AV1
- **HDR**: Dolby Vision / HDR detection
- **Audio**: Atmos / DTS-HD / TrueHD / DD+ 5.1 / AAC
- **File size**: GB / MB extraction
- **Seeders**: `👤 N` or `N seed` pattern

### TorBox Debrid Flow
1. `checkCached` — batch hash check to mark ⚡ vs 🧲
2. On play: `createTorrent` → `getTorrentList` → find largest video file (or `fileIdx`) → `requestDownloadLink`
3. Sort order in picker: Direct URL → Cached → Uncached, then descending quality

---

## 📺 Video Player

### Adaptive Playback
- **HLS.js** for `.m3u8` streams (with automatic error recovery for NETWORK_ERROR and MEDIA_ERROR)
- **Safari native HLS** fallback via `canPlayType('application/vnd.apple.mpegurl')`
- **HTML5 `<video>`** for direct MP4 / MKV / AVI streams

### Resume Playback
- Progress saved to `localStorage` (`webvio_progress`) every **5 seconds** and on unmount
- Resume position loaded when opening Player — seeking happens after `loadedmetadata`
- Only saved if `currentTime > 10s` and `duration > 30s` (avoids saving intro skips)

### Simkl Scrobbling
- Fires once per playback session when `time / duration > 0.80` (80% watched)
- Movies: `POST /sync/history` with `movies: [{ ids: { imdb }, watched_at }]`
- Series: `POST /sync/history` with `shows: [{ seasons: [{ episodes: [...] }] }]`
- Only fires when `currentVideo.season` and `currentVideo.episode` are both present

---

## 🏠 Home Page
- **Cinematic hero section**: full-bleed backdrop/poster image with gradient overlay
- Auto-selects first item from first catalog that loads as the hero
- **Continue Watching row**: reads `webvio_progress`, sorted by `updatedAt DESC`, max 20 items
- **Multi-addon catalog rows**: up to 3 catalogs per addon, fetched in parallel, each row shows loading skeleton while pending

---

## 🔍 Search Page
- Queries every enabled addon that has a catalog with `extra: [{ name: 'search' }]`
- All addon searches run in parallel (`Promise.allSettled`)
- Results **deduplicated by `id`** before render
- Live URL sync (`?q=...` query param) — shareable search links
- Clear button resets query and results

---

## 📄 Detail Page
- Meta fetched sequentially from enabled addons until one returns a result
- **Movies**: single Play button → stream picker
- **Series**: season tab selector + episode list sorted by `episode` number
- Series without season/episode structure: flat video list fallback
- Cast display (up to 10 actors)
- Episode release date display

---

## 📚 Library Page
- **Source toggle**: Nuvio Collections OR Simkl History
- **Nuvio source**: `sync_pull_collections` RPC → maps collection items to `MetaPreview` grid
- **Simkl source**: `GET /sync/all-items/{type}` filtered by status tab
  - Status tabs: Watching / Plan to Watch / Completed / On Hold / Dropped / All
  - Type tabs: TV Shows / Movies / Anime
  - Poster URL: `https://simkl.in/posters/{poster}_m.webp`

---

## ⚙️ Settings Page
Sections:
1. **Nuvio Account** — email display, access token preview, logout
2. **TorBox** — API key input + validate + connect/disconnect + plan info
3. **Simkl Tracking** — Client ID save + OAuth redirect + disconnect
4. **CORS Proxy** — URL input + save
5. **Addon Manager** — manual URL add, drag-and-drop reorder, ▲▼ move, enable/disable toggle, remove

---

## 🎨 Nuvio Design System

### Color Palette

| Token | Value | Usage |
|---|---|---|
| `--bg-primary` | `#030407` | Ultra-dark obsidian base |
| `--bg-elevated` | `#08090d` | Card / elevated surface |
| `--bg-glass` | `rgba(8,9,13,0.85)` | Glassmorphism surfaces |
| `--accent-violet` | `#8b5cf6` | Primary accent, CTA buttons |
| `--accent-magenta` | `#d946ef` | Secondary accent, gradient endpoints |
| `--text-primary` | `#f1f5f9` | Body text |
| `--text-muted` | `#64748b` | Secondary / helper text |

### Gradient
- Primary gradient: `linear-gradient(135deg, #8b5cf6, #d946ef)` (violet → magenta)
- Used on `.btn-primary`, `.hero-title`, `.navbar-brand`, active badge borders

### Typography
- **Font**: Inter (Google Fonts) — weights 300/400/500/600/700/800/900
- Loaded via `<link>` in `index.html` with preconnect hints

### Glassmorphism (`.card-glass`)
- `background: rgba(8, 9, 13, 0.85)`
- `backdrop-filter: blur(20px)`
- `border: 1px solid rgba(139, 92, 246, 0.15)`
- `border-radius: var(--radius-lg)` (16px)

### Floating Navbar
- Position: `fixed; top: 15px; left: 50%; transform: translateX(-50%)`
- Width: `calc(100vw - 2rem)`, max `1400px`
- Backdrop blur: `20px`
- Becomes more opaque on scroll (`scrolled` class when `window.scrollY > 20`)

### Floating Sidebar
- Vertical navigation rail, fixed left
- Icons with labels: 🏠 Home / 🔍 Search / 📚 Library / ⚙️ Settings
- Expandable on hover with label animation

### Media Cards (`.media-card`)
- Hover: `translateY(-6px) scale(1.03)` with smooth transition
- Overlay gradient on hover revealing title and metadata
- Lazy-loaded poster images with name fallback on error

### Badges
| Class | Style |
|---|---|
| `.badge-hd` | Blue-tinted (HD quality) |
| `.badge-4k` | Violet-tinted (4K / HDR) |
| `.badge-cached` | Green-tinted (TorBox cached) |
| `.badge-uncached` | Muted grey |
| `.badge-success` | Green (connected status) |

### Buttons
| Class | Style |
|---|---|
| `.btn-primary` | Gradient violet→magenta fill, white text |
| `.btn-secondary` | Glass border, muted fill |
| `.btn-ghost` | Transparent, subtle hover |
| `.btn-danger` | Red tint |
| `.btn-lg` | Larger padding for hero CTAs |

### Loading States
- `.loading-spinner`: CSS rotating ring animation in violet
- `.skeleton`: Animated shimmer placeholder for grid cards

### Animations
- Card hover: 200ms ease transform
- Sidebar label: 200ms opacity + translate
- Navbar blur increase: 200ms on scroll class
- Toast notifications: 3s auto-dismiss

---

## 🗄️ LocalStorage Key Schema

| Key | Content |
|---|---|
| `webvio_nuvio_accessToken` | Nuvio Supabase JWT |
| `webvio_nuvio_refreshToken` | Nuvio refresh token |
| `webvio_nuvio_userId` | Nuvio user UUID |
| `webvio_nuvio_email` | Nuvio account email |
| `webvio_torbox_apiKey` | TorBox API key |
| `webvio_torbox_user` | TorBox account JSON |
| `webvio_simkl_token` | Simkl OAuth access token |
| `webvio_simkl_clientId` | Simkl app client ID |
| `webvio_simkl_user` | Simkl user JSON |
| `webvio_cors_proxy` | CORS proxy URL prefix |
| `webvio_addons` | Installed addon manifests + order JSON |
| `webvio_progress` | Watch history dictionary keyed by video ID |
| `webvio_volume` | Last player volume (0–1) |

---

## ☁️ Cloudflare Pages Deployment

| Setting | Value |
|---|---|
| **Build command** | `npm run build` |
| **Output directory** | `dist` |
| **Node version** | 20+ |
| **SPA routing** | `public/_redirects` → `/* /index.html 200` |

> All credentials are stored in the user's own browser `localStorage`. Zero server-side infrastructure required. Fits entirely within Cloudflare Pages **free tier**.

---

## 🔮 Planned / Recommended Next Steps

1. **Subtitle Addon Support** — Integrate OpenSubtitles v3 Stremio addon into `VideoPlayer.tsx` via `<track>` elements
2. **Trakt Integration** — Add Trakt OAuth alongside Simkl for multi-platform scrobbling
3. **TV / 10-foot Mode** — Spatial navigation (arrow keys + D-pad) for Smart TV / Android TV
