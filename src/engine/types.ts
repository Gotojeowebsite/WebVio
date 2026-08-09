/**
 * Stream Engine Types and Interfaces for WebVio
 * Unified Software Decoder and Multi-Pipeline Streaming Engine
 */

export type StreamFormat =
  | 'hls'
  | 'dash'
  | 'webtorrent'
  | 'mse'
  | 'native'
  | 'ffmpeg-fallback'
  | 'auto';

export type EngineStatus =
  | 'idle'
  | 'initializing'
  | 'probing'
  | 'buffering'
  | 'playing'
  | 'paused'
  | 'seeking'
  | 'recovering'
  | 'ended'
  | 'error'
  | 'destroyed';

export interface EngineConfig {
  /** Enable Turbo Mode: native fast-path bypass for instant <1.5s playback on compatible streams */
  turboMode?: boolean;
  /** Maximum forward buffer length in seconds (default: 30) */
  maxBufferLength?: number;
  /** Hard cap on forward buffer length in seconds (default: 60) */
  maxMaxBufferLength?: number;
  /** Eviction back-buffer length in seconds (default: 30) */
  backBufferLength?: number;
  /** Duration of active transcode segment for FFmpeg fallback in seconds (default: 30) */
  ffmpegSegmentDuration?: number;
  /** Enable WebCodecs hardware accelerated demux/decode when available */
  enableWebCodecs?: boolean;
  /** Automatically fallback to next pipeline if fatal error occurs (default: true) */
  autoFallback?: boolean;
  /** Low latency tuning for live/torrent chunks */
  lowLatencyMode?: boolean;
  /** Preferred audio language tag (e.g. 'en', 'eng') */
  preferredAudioLanguage?: string;
  /** Preferred subtitle language tag */
  preferredSubtitleLanguage?: string;
  /** Custom request headers for stream fetches */
  headers?: Record<string, string>;
}

export interface QualityLevel {
  id: number | string;
  name?: string;
  bitrate: number;
  width?: number;
  height?: number;
  codec?: string;
  fps?: number;
}

export interface AudioTrackInfo {
  id: number | string;
  name: string;
  lang: string;
  default?: boolean;
  channels?: number;
  codec?: string;
}

export interface SubtitleTrackInfo {
  id: string;
  name?: string;
  lang: string;
  url?: string;
  isDefault?: boolean;
}

export interface EngineMetrics {
  /** Time from load request to first rendered frame in ms */
  firstFrameTimeMs: number | null;
  /** Latency of most recent seek operation in ms */
  seekLatencyMs: number | null;
  /** Current forward buffered duration in seconds */
  bufferHealthSeconds: number;
  /** Estimated CPU / decode load percentage (0 - 100) */
  cpuEstimate: number;
  /** Dropped video frames count */
  droppedFrames: number;
  /** Total video frames rendered */
  totalFrames: number;
  /** Current decoded frames per second */
  fps: number;
  /** Estimated JS heap memory usage in MB */
  memoryMb: number;
  /** Estimated network bandwidth in bits per second */
  bandwidthBps: number;
  /** Active streaming pipeline format */
  activePipeline: StreamFormat | null;
  /** Timestamp when metrics were collected */
  timestamp: number;
}

export interface EngineError {
  code: string;
  message: string;
  fatal: boolean;
  pipeline: StreamFormat;
  details?: unknown;
}

export interface StreamSource {
  /** Stream URL (direct http/https, blob, or magnet/torrent link) */
  url: string;
  /** Explicit format hint, or 'auto' for automatic detection */
  format?: StreamFormat;
  /** MIME type hint (e.g. 'video/mp4', 'application/x-mpegURL') */
  mimeType?: string;
  /** InfoHash for torrent streaming */
  infoHash?: string;
  /** File index within torrent multi-file archive */
  fileIdx?: number;
  /** Media title */
  title?: string;
  /** Custom fetch headers */
  headers?: Record<string, string>;
  /** Start playback timestamp in seconds */
  initialTime?: number;
  /** Optional file size in bytes */
  sizeBytes?: number;
}

export type EngineEventCallback<T = unknown> = (data: T) => void;

export interface EngineEvents {
  statusChange: (status: EngineStatus) => void;
  metricsUpdate: (metrics: EngineMetrics) => void;
  qualityLevelsChanged: (levels: QualityLevel[], currentLevel: number | string) => void;
  qualityChanged: (level: QualityLevel) => void;
  audioTracksChanged: (tracks: AudioTrackInfo[], currentTrack: number | string) => void;
  pipelineChanged: (pipeline: StreamFormat, reason?: string) => void;
  error: (error: EngineError) => void;
  warning: (message: string, data?: unknown) => void;
  bufferHealth: (seconds: number) => void;
}

/** Unified pipeline interface implemented by all stream decoders */
export interface BasePipeline {
  readonly format: StreamFormat;
  readonly isSupported: boolean;

  /** Initialize pipeline and attach to the video element */
  initialize(videoElement: HTMLVideoElement, source: StreamSource, config: EngineConfig): Promise<void>;
  
  /** Load media source */
  load(source: StreamSource): Promise<void>;
  
  /** Start playback */
  play(): Promise<void>;
  
  /** Pause playback */
  pause(): void;
  
  /** Seek to target time in seconds */
  seek(time: number): Promise<void>;
  
  /** Set quality level */
  setQuality?(qualityId: number | string): void;
  
  /** Get available quality levels */
  getQualityLevels?(): QualityLevel[];
  
  /** Get current quality level */
  getCurrentQuality?(): QualityLevel | null;
  
  /** Select audio track */
  setAudioTrack?(trackId: number | string): void;
  
  /** Get available audio tracks */
  getAudioTracks?(): AudioTrackInfo[];
  
  /** Get current forward buffer health in seconds */
  getBufferHealth(): number;
  
  /** Destroy pipeline and clean up all resources */
  destroy(): Promise<void> | void;
}
