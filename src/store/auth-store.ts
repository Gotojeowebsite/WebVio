import { create } from 'zustand';
import { setCorsProxy } from '../utils/cors-proxy';
import {
  SimklHistoryData,
  EpisodeProgress,
  fetchUserHistory,
  recordEpisodeWatched,
  recordMovieWatched,
  processSyncQueue,
  getSyncQueue,
} from '../api/simkl-sync';

export interface TorBoxUser {
  id?: number;
  email?: string;
  plan?: string;
  premium?: boolean;
}

export interface SimklUser {
  username?: string;
  name?: string;
  avatar?: string;
}

export interface TraktUser {
  username?: string;
  name?: string;
  avatar?: string;
}

interface AuthState {
  nuvioAccessToken: string | null;
  nuvioRefreshToken: string | null;
  nuvioEmail: string | null;
  nuvioUserId: string | null;
  nuvioLoggedIn: boolean;
  torboxApiKey: string | null;
  torboxUser: TorBoxUser | null;
  torboxConnected: boolean;
  simklAccessToken: string | null;
  simklUser: SimklUser | null;
  simklConnected: boolean;
  simklClientId: string;
  simklClientSecret: string;
  simklHistory: SimklHistoryData | null;
  lastSimklSync: number | null;
  isSyncingSimkl: boolean;
  simklSyncQueueLength: number;
  simklProgress: Record<string, EpisodeProgress>;
  traktAccessToken: string | null;
  traktUser: TraktUser | null;
  traktConnected: boolean;
  traktClientId: string;
  corsProxyUrl: string;

  setNuvioAuth: (accessToken: string, refreshToken: string, userId: string, email?: string) => void;
  clearNuvioAuth: () => void;
  setTorboxAuth: (apiKey: string, user?: TorBoxUser) => void;
  clearTorboxAuth: () => void;
  setSimklAuth: (accessToken: string, user?: SimklUser) => void;
  clearSimklAuth: () => void;
  setSimklClientId: (id: string) => void;
  setSimklClientSecret: (secret: string) => void;
  syncSimklHistory: (forceRefresh?: boolean) => Promise<void>;
  recordSimklEpisode: (imdbId: string, season: number, episode: number, watchedAt?: string) => Promise<boolean>;
  recordSimklMovie: (imdbId: string, watchedAt?: string) => Promise<boolean>;
  setSimklProgress: (key: string, progress: EpisodeProgress) => void;
  processOfflineQueue: () => Promise<{ success: number; failed: number }>;
  refreshQueueLength: () => void;
  setTraktAuth: (accessToken: string, user?: TraktUser) => void;
  clearTraktAuth: () => void;
  setTraktClientId: (id: string) => void;
  setCorsProxyUrl: (url: string) => void;
  loadFromStorage: () => void;
}

function buildProgressMap(
  history: SimklHistoryData,
  currentProgress: Record<string, EpisodeProgress> = {}
): Record<string, EpisodeProgress> {
  const newProgress: Record<string, EpisodeProgress> = { ...currentProgress };

  // 1. Shows
  (history.shows || []).forEach((s) => {
    const imdb = s.show?.ids?.imdb;
    const simkl = s.show?.ids?.simkl;
    (s.seasons || []).forEach((sn) => {
      (sn.episodes || []).forEach((ep) => {
        if (ep.watched_at) {
          const item: EpisodeProgress = {
            time: 1800,
            duration: 1800,
            percent: 100,
            completed: true,
            watchedAt: ep.watched_at,
            updatedAt: new Date(ep.watched_at).getTime(),
          };
          if (imdb) {
            newProgress[`${imdb}:${sn.number}:${ep.number}`] = item;
            newProgress[`${imdb}:s${sn.number}:e${ep.number}`] = item;
          }
          if (simkl) {
            newProgress[`${simkl}:${sn.number}:${ep.number}`] = item;
          }
        }
      });
    });
  });

  // 2. Anime
  (history.anime || []).forEach((a) => {
    const imdb = a.anime?.ids?.imdb;
    const kitsu = a.anime?.ids?.kitsu;
    const simkl = a.anime?.ids?.simkl;
    (a.episodes || []).forEach((ep) => {
      if (ep.watched_at) {
        const item: EpisodeProgress = {
          time: 1400,
          duration: 1400,
          percent: 100,
          completed: true,
          watchedAt: ep.watched_at,
          updatedAt: new Date(ep.watched_at).getTime(),
        };
        if (imdb) newProgress[`${imdb}:1:${ep.number}`] = item;
        if (kitsu) newProgress[`kitsu:${kitsu}:${ep.number}`] = item;
        if (simkl) newProgress[`${simkl}:${ep.number}`] = item;
      }
    });
  });

  // 3. Movies
  (history.movies || []).forEach((m) => {
    const imdb = m.movie?.ids?.imdb;
    const simkl = m.movie?.ids?.simkl;
    if (m.last_watched_at || m.status === 'completed') {
      const item: EpisodeProgress = {
        time: 7200,
        duration: 7200,
        percent: 100,
        completed: true,
        watchedAt: m.last_watched_at,
        updatedAt: m.last_watched_at ? new Date(m.last_watched_at).getTime() : Date.now(),
      };
      if (imdb) newProgress[imdb] = item;
      if (simkl) newProgress[String(simkl)] = item;
    }
  });

  return newProgress;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  nuvioAccessToken: null,
  nuvioRefreshToken: null,
  nuvioEmail: null,
  nuvioUserId: null,
  nuvioLoggedIn: false,
  torboxApiKey: null,
  torboxUser: null,
  torboxConnected: false,
  simklAccessToken: null,
  simklUser: null,
  simklConnected: false,
  simklClientId: '',
  simklClientSecret: '',
  simklHistory: null,
  lastSimklSync: null,
  isSyncingSimkl: false,
  simklSyncQueueLength: 0,
  simklProgress: {},
  traktAccessToken: null,
  traktUser: null,
  traktConnected: false,
  traktClientId: '',
  corsProxyUrl: '',

  setNuvioAuth: (accessToken, refreshToken, userId, email) => {
    localStorage.setItem('webvio_nuvio_accessToken', accessToken);
    localStorage.setItem('webvio_nuvio_refreshToken', refreshToken);
    localStorage.setItem('webvio_nuvio_userId', userId);
    if (email) localStorage.setItem('webvio_nuvio_email', email);
    set({
      nuvioAccessToken: accessToken,
      nuvioRefreshToken: refreshToken,
      nuvioUserId: userId,
      nuvioEmail: email || null,
      nuvioLoggedIn: true,
    });
  },

  clearNuvioAuth: () => {
    localStorage.removeItem('webvio_nuvio_accessToken');
    localStorage.removeItem('webvio_nuvio_refreshToken');
    localStorage.removeItem('webvio_nuvio_userId');
    localStorage.removeItem('webvio_nuvio_email');
    set({
      nuvioAccessToken: null,
      nuvioRefreshToken: null,
      nuvioUserId: null,
      nuvioEmail: null,
      nuvioLoggedIn: false,
    });
  },

  setTorboxAuth: (apiKey, user) => {
    localStorage.setItem('webvio_torbox_apiKey', apiKey);
    if (user) localStorage.setItem('webvio_torbox_user', JSON.stringify(user));
    set({ torboxApiKey: apiKey, torboxUser: user || null, torboxConnected: true });
  },

  clearTorboxAuth: () => {
    localStorage.removeItem('webvio_torbox_apiKey');
    localStorage.removeItem('webvio_torbox_user');
    set({ torboxApiKey: null, torboxUser: null, torboxConnected: false });
  },

  setSimklAuth: (accessToken, user) => {
    localStorage.setItem('webvio_simkl_token', accessToken);
    if (user) localStorage.setItem('webvio_simkl_user', JSON.stringify(user));
    set({ simklAccessToken: accessToken, simklUser: user || null, simklConnected: true });
    // Trigger history sync
    get().syncSimklHistory(true).catch(() => {});
  },

  clearSimklAuth: () => {
    localStorage.removeItem('webvio_simkl_token');
    localStorage.removeItem('webvio_simkl_user');
    localStorage.removeItem('webvio_simkl_history_cache');
    localStorage.removeItem('webvio_simkl_last_sync');
    set({
      simklAccessToken: null,
      simklUser: null,
      simklConnected: false,
      simklHistory: null,
      lastSimklSync: null,
      simklProgress: {},
    });
  },

  setSimklClientId: (id) => {
    localStorage.setItem('webvio_simkl_clientId', id);
    set({ simklClientId: id });
  },

  setSimklClientSecret: (secret) => {
    localStorage.setItem('webvio_simkl_clientSecret', secret);
    set({ simklClientSecret: secret });
  },

  syncSimklHistory: async (forceRefresh = false) => {
    const { simklClientId, simklAccessToken, isSyncingSimkl } = get();
    if (!simklClientId || !simklAccessToken || isSyncingSimkl) return;

    set({ isSyncingSimkl: true });
    try {
      const history = await fetchUserHistory(simklClientId, simklAccessToken, forceRefresh);
      const queue = getSyncQueue();
      const updatedProgress = buildProgressMap(history, get().simklProgress);

      set({
        simklHistory: history,
        lastSimklSync: history.lastFetched || Date.now(),
        simklProgress: updatedProgress,
        simklSyncQueueLength: queue.length,
        isSyncingSimkl: false,
      });
    } catch (err) {
      console.error('Failed to sync Simkl history:', err);
      set({ isSyncingSimkl: false });
    }
  },

  recordSimklEpisode: async (imdbId, season, episode, watchedAt) => {
    const { simklClientId, simklAccessToken, simklProgress } = get();
    const timestamp = watchedAt || new Date().toISOString();
    const key = `${imdbId}:${season}:${episode}`;

    // Update state immediately
    const updated = {
      ...simklProgress,
      [key]: {
        time: 1800,
        duration: 1800,
        percent: 100,
        completed: true,
        watchedAt: timestamp,
        updatedAt: Date.now(),
      },
      [`${imdbId}:s${season}:e${episode}`]: {
        time: 1800,
        duration: 1800,
        percent: 100,
        completed: true,
        watchedAt: timestamp,
        updatedAt: Date.now(),
      },
    };
    set({ simklProgress: updated });

    const success = await recordEpisodeWatched(
      simklClientId,
      simklAccessToken || '',
      imdbId,
      season,
      episode,
      timestamp
    );

    get().refreshQueueLength();
    return success;
  },

  recordSimklMovie: async (imdbId, watchedAt) => {
    const { simklClientId, simklAccessToken, simklProgress } = get();
    const timestamp = watchedAt || new Date().toISOString();

    const updated = {
      ...simklProgress,
      [imdbId]: {
        time: 7200,
        duration: 7200,
        percent: 100,
        completed: true,
        watchedAt: timestamp,
        updatedAt: Date.now(),
      },
    };
    set({ simklProgress: updated });

    const success = await recordMovieWatched(
      simklClientId,
      simklAccessToken || '',
      imdbId,
      timestamp
    );

    get().refreshQueueLength();
    return success;
  },

  setSimklProgress: (key, progress) => {
    set((state) => ({
      simklProgress: {
        ...state.simklProgress,
        [key]: progress,
      },
    }));
  },

  processOfflineQueue: async () => {
    const { simklClientId, simklAccessToken } = get();
    if (!simklClientId || !simklAccessToken) return { success: 0, failed: 0 };
    const res = await processSyncQueue(simklClientId, simklAccessToken);
    get().refreshQueueLength();
    return res;
  },

  refreshQueueLength: () => {
    const queue = getSyncQueue();
    set({ simklSyncQueueLength: queue.length });
  },

  setTraktAuth: (accessToken, user) => {
    localStorage.setItem('webvio_trakt_token', accessToken);
    if (user) localStorage.setItem('webvio_trakt_user', JSON.stringify(user));
    set({ traktAccessToken: accessToken, traktUser: user || null, traktConnected: true });
  },

  clearTraktAuth: () => {
    localStorage.removeItem('webvio_trakt_token');
    localStorage.removeItem('webvio_trakt_user');
    set({ traktAccessToken: null, traktUser: null, traktConnected: false });
  },

  setTraktClientId: (id) => {
    localStorage.setItem('webvio_trakt_clientId', id);
    set({ traktClientId: id });
  },

  setCorsProxyUrl: (url) => {
    localStorage.setItem('webvio_cors_proxy', url);
    setCorsProxy(url);
    set({ corsProxyUrl: url });
  },

  loadFromStorage: () => {
    const nuvioAccessToken = localStorage.getItem('webvio_nuvio_accessToken');
    const nuvioRefreshToken = localStorage.getItem('webvio_nuvio_refreshToken');
    const nuvioUserId = localStorage.getItem('webvio_nuvio_userId');
    const nuvioEmail = localStorage.getItem('webvio_nuvio_email');
    const torboxApiKey = localStorage.getItem('webvio_torbox_apiKey');
    const torboxUserStr = localStorage.getItem('webvio_torbox_user');
    const simklToken = localStorage.getItem('webvio_simkl_token');
    const simklUserStr = localStorage.getItem('webvio_simkl_user');
    const simklClientId = localStorage.getItem('webvio_simkl_clientId') || '';
    const simklClientSecret = localStorage.getItem('webvio_simkl_clientSecret') || '';
    const lastSyncStr = localStorage.getItem('webvio_simkl_last_sync');
    const traktToken = localStorage.getItem('webvio_trakt_token');
    const traktUserStr = localStorage.getItem('webvio_trakt_user');
    const traktClientId = localStorage.getItem('webvio_trakt_clientId') || '';
    const corsProxy = localStorage.getItem('webvio_cors_proxy') || '';

    if (corsProxy) setCorsProxy(corsProxy);

    const safeParse = (str: string | null) => {
      if (!str) return null;
      try {
        return JSON.parse(str);
      } catch {
        return null;
      }
    };

    let cachedHistory: SimklHistoryData | null = null;
    try {
      const historyRaw = localStorage.getItem('webvio_simkl_history_cache');
      if (historyRaw) cachedHistory = JSON.parse(historyRaw);
    } catch {
      // Ignore
    }

    const queue = getSyncQueue();
    const initialProgress = cachedHistory ? buildProgressMap(cachedHistory) : {};

    // Merge local playback progress
    try {
      const localProgress: Record<string, any> = JSON.parse(
        localStorage.getItem('webvio_progress') || '{}'
      );
      Object.entries(localProgress).forEach(([k, v]) => {
        if (v && v.time > 0 && v.duration > 0) {
          const percent = Math.min(100, Math.round((v.time / v.duration) * 100));
          initialProgress[k] = {
            time: v.time,
            duration: v.duration,
            percent,
            completed: percent >= 80 || v.completed === true,
            watchedAt: v.watchedAt,
            updatedAt: v.updatedAt,
          };
        }
      });
    } catch {
      // Ignore
    }

    set({
      nuvioAccessToken,
      nuvioRefreshToken,
      nuvioUserId,
      nuvioEmail,
      nuvioLoggedIn: !!nuvioAccessToken,
      torboxApiKey,
      torboxUser: safeParse(torboxUserStr),
      torboxConnected: !!torboxApiKey,
      simklAccessToken: simklToken,
      simklUser: safeParse(simklUserStr),
      simklConnected: !!simklToken,
      simklClientId,
      simklClientSecret,
      simklHistory: cachedHistory,
      lastSimklSync: lastSyncStr ? Number(lastSyncStr) : cachedHistory?.lastFetched || null,
      simklSyncQueueLength: queue.length,
      simklProgress: initialProgress,
      traktAccessToken: traktToken,
      traktUser: safeParse(traktUserStr),
      traktConnected: !!traktToken,
      traktClientId,
      corsProxyUrl: corsProxy,
    });

    // Auto-sync in background if connected
    if (simklToken && simklClientId) {
      setTimeout(() => {
        get().syncSimklHistory(false).catch(() => {});
      }, 1000);
    }
  },
}));
