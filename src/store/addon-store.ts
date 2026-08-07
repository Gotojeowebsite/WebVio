import { create } from 'zustand';
import { AddonClient, AddonManifest } from '../api/addon-client';
import { getAddonCollection, pushAddonsToNuvio } from '../api/nuvio-auth';
import { useAuthStore } from './auth-store';

export interface InstalledAddon {
  manifestUrl: string;
  manifest: AddonManifest;
  enabled: boolean;
  order: number;
}

interface AddonState {
  addons: InstalledAddon[];
  loading: boolean;
  error: string | null;

  loadAddonsFromNuvio: (accessToken: string, userId: string) => Promise<void>;
  addAddonByUrl: (manifestUrl: string) => Promise<void>;
  removeAddon: (manifestUrl: string) => void;
  toggleAddon: (manifestUrl: string) => void;
  reorderAddons: (from: number, to: number) => void;
  moveAddonUp: (index: number) => void;
  moveAddonDown: (index: number) => void;
  saveToStorage: () => void;
  loadFromStorage: () => Promise<void>;
}

const DEFAULT_ADDON_URLS = [
  'https://v3-cinemeta.strem.io/manifest.json',
  'https://opensubtitles-v3.strem.io/manifest.json',
];

export const useAddonStore = create<AddonState>((set, get) => ({
  addons: [],
  loading: false,
  error: null,

  loadAddonsFromNuvio: async (accessToken, userId) => {
    set({ loading: true, error: null });
    try {
      const urls = await getAddonCollection(accessToken, userId);
      const targetUrls = urls.length > 0 ? urls : DEFAULT_ADDON_URLS;
      const addons: InstalledAddon[] = [];

      const results = await Promise.allSettled(
        targetUrls.map(async (url: string, index: number) => {
          try {
            const client = new AddonClient(url);
            const manifest = await client.loadManifest();
            return { manifestUrl: url, manifest, enabled: true, order: index };
          } catch {
            return null;
          }
        })
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          addons.push(result.value);
        }
      }

      set({ addons, loading: false });
      get().saveToStorage();
    } catch (err: any) {
      set({ error: err.message || 'Failed to load addons', loading: false });
    }
  },

  addAddonByUrl: async (manifestUrl) => {
    const existing = get().addons.find(a => a.manifestUrl === manifestUrl);
    if (existing) throw new Error('Addon already installed');

    const client = new AddonClient(manifestUrl);
    const manifest = await client.loadManifest();

    const addon: InstalledAddon = {
      manifestUrl,
      manifest,
      enabled: true,
      order: get().addons.length,
    };

    const newAddons = [...get().addons, addon];
    set({ addons: newAddons });
    get().saveToStorage();

    const { nuvioAccessToken } = useAuthStore.getState();
    if (nuvioAccessToken) {
      pushAddonsToNuvio(
        nuvioAccessToken,
        newAddons.map((a, i) => ({
          url: a.manifestUrl,
          name: a.manifest.name,
          enabled: a.enabled,
          sort_order: i,
        }))
      );
    }
  },

  removeAddon: (manifestUrl) => {
    const newAddons = get().addons.filter(a => a.manifestUrl !== manifestUrl);
    set({ addons: newAddons });
    get().saveToStorage();

    const { nuvioAccessToken } = useAuthStore.getState();
    if (nuvioAccessToken) {
      pushAddonsToNuvio(
        nuvioAccessToken,
        newAddons.map((a, i) => ({
          url: a.manifestUrl,
          name: a.manifest.name,
          enabled: a.enabled,
          sort_order: i,
        }))
      );
    }
  },

  toggleAddon: (manifestUrl) => {
    const newAddons = get().addons.map(a =>
      a.manifestUrl === manifestUrl ? { ...a, enabled: !a.enabled } : a
    );
    set({ addons: newAddons });
    get().saveToStorage();

    const { nuvioAccessToken } = useAuthStore.getState();
    if (nuvioAccessToken) {
      pushAddonsToNuvio(
        nuvioAccessToken,
        newAddons.map((a, i) => ({
          url: a.manifestUrl,
          name: a.manifest.name,
          enabled: a.enabled,
          sort_order: i,
        }))
      );
    }
  },

  reorderAddons: (from, to) => {
    const list = get().addons;
    if (from < 0 || from >= list.length || to < 0 || to >= list.length) return;
    const addons = [...list];
    const [moved] = addons.splice(from, 1);
    addons.splice(to, 0, moved);
    const updated = addons.map((a, i) => ({ ...a, order: i }));
    set({ addons: updated });
    get().saveToStorage();

    const { nuvioAccessToken } = useAuthStore.getState();
    if (nuvioAccessToken) {
      pushAddonsToNuvio(
        nuvioAccessToken,
        updated.map((a, i) => ({
          url: a.manifestUrl,
          name: a.manifest.name,
          enabled: a.enabled,
          sort_order: i,
        }))
      );
    }
  },

  moveAddonUp: (index) => {
    if (index > 0) {
      get().reorderAddons(index, index - 1);
    }
  },

  moveAddonDown: (index) => {
    if (index < get().addons.length - 1) {
      get().reorderAddons(index, index + 1);
    }
  },

  saveToStorage: () => {
    const data = get().addons.map(a => ({
      manifestUrl: a.manifestUrl,
      manifest: a.manifest,
      enabled: a.enabled,
      order: a.order,
    }));
    localStorage.setItem('webvio_addons', JSON.stringify(data));
  },

  loadFromStorage: async () => {
    const stored = localStorage.getItem('webvio_addons');
    if (stored) {
      try {
        const data = JSON.parse(stored) as InstalledAddon[];
        if (data && data.length > 0) {
          set({ addons: data });
          return;
        }
      } catch {
        // Fallback to default
      }
    }

    // Initialize with default addons if none stored
    set({ loading: true });
    try {
      const defaultAddons: InstalledAddon[] = [];
      for (let i = 0; i < DEFAULT_ADDON_URLS.length; i++) {
        const url = DEFAULT_ADDON_URLS[i];
        try {
          const client = new AddonClient(url);
          const manifest = await client.loadManifest();
          defaultAddons.push({
            manifestUrl: url,
            manifest,
            enabled: true,
            order: i,
          });
        } catch (e) {
          console.warn('Could not load default addon:', url, e);
        }
      }
      set({ addons: defaultAddons, loading: false });
      get().saveToStorage();
    } catch {
      set({ loading: false });
    }
  },
}));
