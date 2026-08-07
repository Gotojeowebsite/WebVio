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
  corsProxyUrl: string;
  simklClientId: string;

  setNuvioAuth: (accessToken: string, refreshToken: string, userId: string, email?: string) => void;
  clearNuvioAuth: () => void;
  setTorboxAuth: (apiKey: string, user?: TorBoxUser) => void;
  clearTorboxAuth: () => void;
  setSimklAuth: (accessToken: string, user?: SimklUser) => void;
  clearSimklAuth: () => void;
  setCorsProxyUrl: (url: string) => void;
  setSimklClientId: (id: string) => void;
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
  corsProxyUrl: '',
  simklClientId: '',

  setNuvioAuth: (accessToken, refreshToken, userId, email) => {
    localStorage.setItem('tornode_nuvio_accessToken', accessToken);
    localStorage.setItem('tornode_nuvio_refreshToken', refreshToken);
    localStorage.setItem('tornode_nuvio_userId', userId);
    if (email) localStorage.setItem('tornode_nuvio_email', email);
    set({
      nuvioAccessToken: accessToken,
      nuvioRefreshToken: refreshToken,
      nuvioUserId: userId,
      nuvioEmail: email || null,
      nuvioLoggedIn: true
    });
  },

  clearNuvioAuth: () => {
    localStorage.removeItem('tornode_nuvio_accessToken');
    localStorage.removeItem('tornode_nuvio_refreshToken');
    localStorage.removeItem('tornode_nuvio_userId');
    localStorage.removeItem('tornode_nuvio_email');
    set({
      nuvioAccessToken: null,
      nuvioRefreshToken: null,
      nuvioUserId: null,
      nuvioEmail: null,
      nuvioLoggedIn: false
    });
  },

  setTorboxAuth: (apiKey, user) => {
    localStorage.setItem('tornode_torbox_apiKey', apiKey);
    if (user) localStorage.setItem('tornode_torbox_user', JSON.stringify(user));
    set({ torboxApiKey: apiKey, torboxUser: user || null, torboxConnected: true });
  },

  clearTorboxAuth: () => {
    localStorage.removeItem('tornode_torbox_apiKey');
    localStorage.removeItem('tornode_torbox_user');
    set({ torboxApiKey: null, torboxUser: null, torboxConnected: false });
  },

  setSimklAuth: (accessToken, user) => {
    localStorage.setItem('tornode_simkl_token', accessToken);
    if (user) localStorage.setItem('tornode_simkl_user', JSON.stringify(user));
    set({ simklAccessToken: accessToken, simklUser: user || null, simklConnected: true });
  },

  clearSimklAuth: () => {
    localStorage.removeItem('tornode_simkl_token');
    localStorage.removeItem('tornode_simkl_user');
    set({ simklAccessToken: null, simklUser: null, simklConnected: false });
  },

  setCorsProxyUrl: (url) => {
    localStorage.setItem('tornode_cors_proxy', url);
    setCorsProxy(url);
    set({ corsProxyUrl: url });
  },

  setSimklClientId: (id) => {
    localStorage.setItem('tornode_simkl_clientId', id);
    set({ simklClientId: id });
  },

  loadFromStorage: () => {
    const nuvioAccessToken = localStorage.getItem('tornode_nuvio_accessToken');
    const nuvioRefreshToken = localStorage.getItem('tornode_nuvio_refreshToken');
    const nuvioUserId = localStorage.getItem('tornode_nuvio_userId');
    const nuvioEmail = localStorage.getItem('tornode_nuvio_email');
    const torboxApiKey = localStorage.getItem('tornode_torbox_apiKey');
    const torboxUserStr = localStorage.getItem('tornode_torbox_user');
    const simklToken = localStorage.getItem('tornode_simkl_token');
    const simklUserStr = localStorage.getItem('tornode_simkl_user');
    const corsProxy = localStorage.getItem('tornode_cors_proxy') || '';
    const simklClientId = localStorage.getItem('tornode_simkl_clientId') || '';

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
      corsProxyUrl: corsProxy,
      simklClientId,
    });
  },
}));
