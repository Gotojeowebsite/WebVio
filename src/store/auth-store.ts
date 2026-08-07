import { create } from 'zustand';
import { setCorsProxy } from '../utils/cors-proxy';

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
  traktAccessToken: string | null;
  traktUser: any | null;
  traktConnected: boolean;
  corsProxyUrl: string;
  simklClientId: string;
  traktClientId: string;

  setNuvioAuth: (accessToken: string, refreshToken: string, userId: string, email?: string) => void;
  clearNuvioAuth: () => void;
  setTorboxAuth: (apiKey: string, user?: TorBoxUser) => void;
  clearTorboxAuth: () => void;
  setSimklAuth: (accessToken: string, user?: SimklUser) => void;
  clearSimklAuth: () => void;
  setTraktAuth: (accessToken: string, user?: any) => void;
  clearTraktAuth: () => void;
  setCorsProxyUrl: (url: string) => void;
  setSimklClientId: (id: string) => void;
  setTraktClientId: (id: string) => void;
  loadFromStorage: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
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
  traktAccessToken: null,
  traktUser: null,
  traktConnected: false,
  corsProxyUrl: '',
  simklClientId: '',
  traktClientId: '',

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
      nuvioLoggedIn: true
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
      nuvioLoggedIn: false
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
  },

  clearSimklAuth: () => {
    localStorage.removeItem('webvio_simkl_token');
    localStorage.removeItem('webvio_simkl_user');
    set({ simklAccessToken: null, simklUser: null, simklConnected: false });
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

  setCorsProxyUrl: (url) => {
    localStorage.setItem('webvio_cors_proxy', url);
    setCorsProxy(url);
    set({ corsProxyUrl: url });
  },

  setSimklClientId: (id) => {
    localStorage.setItem('webvio_simkl_clientId', id);
    set({ simklClientId: id });
  },

  setTraktClientId: (id) => {
    localStorage.setItem('webvio_trakt_clientId', id);
    set({ traktClientId: id });
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
    const traktToken = localStorage.getItem('webvio_trakt_token');
    const traktUserStr = localStorage.getItem('webvio_trakt_user');
    const corsProxy = localStorage.getItem('webvio_cors_proxy') || '';
    const simklClientId = localStorage.getItem('webvio_simkl_clientId') || '';
    const traktClientId = localStorage.getItem('webvio_trakt_clientId') || '';

    if (corsProxy) setCorsProxy(corsProxy);

    set({
      nuvioAccessToken,
      nuvioRefreshToken,
      nuvioUserId,
      nuvioEmail,
      nuvioLoggedIn: !!nuvioAccessToken,
      torboxApiKey,
      torboxUser: torboxUserStr ? JSON.parse(torboxUserStr) : null,
      torboxConnected: !!torboxApiKey,
      simklAccessToken: simklToken,
      simklUser: simklUserStr ? JSON.parse(simklUserStr) : null,
      simklConnected: !!simklToken,
      traktAccessToken: traktToken,
      traktUser: traktUserStr ? JSON.parse(traktUserStr) : null,
      traktConnected: !!traktToken,
      corsProxyUrl: corsProxy,
      simklClientId,
      traktClientId,
    });
  },
}));
