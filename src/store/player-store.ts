import { create } from 'zustand';
import { Meta, Video, Subtitle, Stream } from '../api/addon-client';

export interface EnrichedStream extends Stream {
  addonName: string;
  addonId: string;
  quality?: string;
  size?: string;
  sizeBytes?: number;
  codec?: string;
  isCached?: boolean;
  seeders?: number | null;
  source?: string;
  audio?: string;
  bitrate?: string;
  releaseGroup?: string;
  cleanTitle?: string;
  starRating?: number;
  health?: 'healthy' | 'average' | 'poor';
  hdr?: boolean;
}

export interface ResolvedStream {
  url: string;
  title: string;
  quality?: string;
  source: string;
}

interface PlayerState {
  currentStream: ResolvedStream | null;
  currentMeta: Meta | null;
  currentVideo: Video | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  subtitles: Subtitle[];
  selectedSubtitle: string | null;
  availableStreams: EnrichedStream[];
  streamsLoading: boolean;

  setStream: (stream: ResolvedStream) => void;
  setMeta: (meta: Meta) => void;
  setVideo: (video: Video | null) => void;
  updateTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setAvailableStreams: (streams: EnrichedStream[]) => void;
  setStreamsLoading: (loading: boolean) => void;
  clearPlayer: () => void;
  saveProgress: () => void;
  loadProgress: (videoId: string) => number;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentStream: null,
  currentMeta: null,
  currentVideo: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: parseFloat(localStorage.getItem('webvio_volume') || '1'),
  muted: false,
  subtitles: [],
  selectedSubtitle: null,
  availableStreams: [],
  streamsLoading: false,

  setStream: (stream) => set({ currentStream: stream, isPlaying: true }),
  setMeta: (meta) => set({ currentMeta: meta }),
  setVideo: (video) => set({ currentVideo: video }),
  updateTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setVolume: (volume) => {
    localStorage.setItem('webvio_volume', String(volume));
    set({ volume });
  },
  toggleMute: () => set((s) => ({ muted: !s.muted })),
  setAvailableStreams: (streams) => set({ availableStreams: streams }),
  setStreamsLoading: (loading) => set({ streamsLoading: loading }),

  clearPlayer: () =>
    set({
      currentStream: null,
      currentMeta: null,
      currentVideo: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      subtitles: [],
      selectedSubtitle: null,
      availableStreams: [],
      streamsLoading: false,
    }),

  saveProgress: () => {
    const { currentMeta, currentVideo, currentTime, duration } = get();
    if (!currentMeta || currentTime < 10 || duration < 30) return;
    const videoId = currentVideo?.id || currentMeta.id;
    const percent = Math.min(100, Math.round((currentTime / duration) * 100));
    const isCompleted = percent >= 80;

    let progress: Record<string, any> = {};
    try {
      progress = JSON.parse(localStorage.getItem('webvio_progress') || '{}');
    } catch {
      // Ignore parse errors
    }
    const itemData = {
      time: currentTime,
      duration,
      percent,
      completed: isCompleted,
      updatedAt: Date.now(),
      meta: {
        id: currentMeta.id,
        name: currentMeta.name,
        poster: currentMeta.poster,
        type: currentMeta.type,
      },
      video: currentVideo
        ? {
            id: currentVideo.id,
            title: currentVideo.title,
            season: currentVideo.season,
            episode: currentVideo.episode,
          }
        : null,
    };

    progress[videoId] = itemData;
    if (currentVideo?.season !== undefined && currentVideo?.episode !== undefined) {
      progress[`${currentMeta.id}:${currentVideo.season}:${currentVideo.episode}`] = itemData;
    }
    localStorage.setItem('webvio_progress', JSON.stringify(progress));

    // Also update auth-store simklProgress map
    try {
      import('./auth-store').then(({ useAuthStore }) => {
        const setSimklProgress = useAuthStore.getState().setSimklProgress;
        if (setSimklProgress) {
          setSimklProgress(videoId, {
            time: currentTime,
            duration,
            percent,
            completed: isCompleted,
            updatedAt: Date.now(),
          });
          if (currentVideo?.season !== undefined && currentVideo?.episode !== undefined) {
            setSimklProgress(`${currentMeta.id}:${currentVideo.season}:${currentVideo.episode}`, {
              time: currentTime,
              duration,
              percent,
              completed: isCompleted,
              updatedAt: Date.now(),
            });
          }
        }
      });
    } catch {
      // Ignore
    }
  },

  loadProgress: (videoId) => {
    let progress: Record<string, any> = {};
    try {
      progress = JSON.parse(localStorage.getItem('webvio_progress') || '{}');
    } catch {
      // Ignore parse errors
    }
    return progress[videoId]?.time || 0;
  },
}));
