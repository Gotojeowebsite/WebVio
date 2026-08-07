import { create } from 'zustand';
import { Meta, Video, Subtitle, Stream } from '../api/addon-client';

export interface EnrichedStream extends Stream {
  addonName: string;
  addonId: string;
  quality?: string;
  size?: string;
  codec?: string;
  isCached?: boolean;
  seeders?: number;
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
  volume: 1,
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
    localStorage.setItem('tornode_volume', String(volume));
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
    const progress = JSON.parse(localStorage.getItem('tornode_progress') || '{}');
    progress[videoId] = {
      time: currentTime,
      duration,
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
    localStorage.setItem('tornode_progress', JSON.stringify(progress));
  },

  loadProgress: (videoId) => {
    const progress = JSON.parse(localStorage.getItem('tornode_progress') || '{}');
    return progress[videoId]?.time || 0;
  },
}));
