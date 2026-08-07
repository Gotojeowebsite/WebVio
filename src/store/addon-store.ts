import { create } from 'zustand';
import { AddonClient, AddonManifest } from '../api/addon-client';
import { getAddonCollection } from '../api/nuvio-auth';

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
  saveToStorage: () => void;
  loadFromStorage: () => Promise<void>;
}

export const useAddonStore = create<AddonState>((set, get) => ({
  addons: [],
  loading: false,
  error: null,

  loadAddonsFromNuvio: async (accessToken, userId) => {
    set({ loading: true, error: null });
    try {
      const urls = await getAddonCollection(accessToken, userId);
      const addons: InstalledAddon[] = [];

      const results = await Promise.allSettled(
        urls.map(async (url: string, index: number) => {
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

    set({ addons: [...get().addons, addon] });
    get().saveToStorage();
  },

  removeAddon: (manifestUrl) => {
    set({ addons: get().addons.filter(a => a.manifestUrl !== manifestUrl) });
    get().saveToStorage();
  },

  toggleAddon: (manifestUrl) => {
    set({
      addons: get().addons.map(a =>
        a.manifestUrl === manifestUrl ? { ...a, enabled: !a.enabled } : a
      ),
    });
    get().saveToStorage();
  },

  reorderAddons: (from, to) => {
    const addons = [...get().addons];
    const [moved] = addons.splice(from, 1);
    addons.splice(to, 0, moved);
    set({ addons: addons.map((a, i) => ({ ...a, order: i })) });
    get().saveToStorage();
  },

  saveToStorage: () => {
    const data = get().addons.map(a => ({
      manifestUrl: a.manifestUrl,
      manifest: a.manifest,
      enabled: a.enabled,
      order: a.order,
    }));
    localStorage.setItem('tornode_addons', JSON.stringify(data));
  },

  loadFromStorage: async () => {
    const stored = localStorage.getItem('tornode_addons');
    if (!stored) return;
    try {
      const data = JSON.parse(stored) as InstalledAddon[];
      set({ addons: data });
    } catch {
      // Ignore corrupted storage
    }
  },
}));
