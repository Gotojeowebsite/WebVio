/**
 * HLS.js Streaming Pipeline for WebVio
 * Adaptive bitrate HTTP Live Streaming with automated error recovery,
 * multi-track audio/subtitles, and buffer control.
 */

import Hls, { ErrorData, Events } from 'hls.js';
import {
  BasePipeline,
  StreamFormat,
  StreamSource,
  EngineConfig,
  QualityLevel,
  AudioTrackInfo,
  EngineError,
} from '../types';

export class HlsPipeline implements BasePipeline {
  public readonly format: StreamFormat = 'hls';
  private hls: Hls | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private currentSource: StreamSource | null = null;
  private config: EngineConfig = {};
  
  private mediaRecoveryAttempts = 0;
  private networkRecoveryAttempts = 0;
  private maxRecoveryAttempts = 3;

  private onErrorCallback?: (err: EngineError) => void;
  private onQualityLevelsCallback?: (levels: QualityLevel[], currentId: number | string) => void;
  private onAudioTracksCallback?: (tracks: AudioTrackInfo[], currentId: number | string) => void;

  public get isSupported(): boolean {
    return Hls.isSupported() || (typeof document !== 'undefined' && document.createElement('video').canPlayType('application/vnd.apple.mpegurl') !== '');
  }

  public setCallbacks(callbacks: {
    onError?: (err: EngineError) => void;
    onQualityLevels?: (levels: QualityLevel[], currentId: number | string) => void;
    onAudioTracks?: (tracks: AudioTrackInfo[], currentId: number | string) => void;
  }): void {
    this.onErrorCallback = callbacks.onError;
    this.onQualityLevelsCallback = callbacks.onQualityLevels;
    this.onAudioTracksCallback = callbacks.onAudioTracks;
  }

  public async initialize(
    videoElement: HTMLVideoElement,
    source: StreamSource,
    config: EngineConfig
  ): Promise<void> {
    this.videoElement = videoElement;
    this.currentSource = source;
    this.config = config;
    await this.load(source);
  }

  public async load(source: StreamSource): Promise<void> {
    this.currentSource = source;
    this.mediaRecoveryAttempts = 0;
    this.networkRecoveryAttempts = 0;

    if (!this.videoElement) {
      throw new Error('[HlsPipeline] Video element not attached');
    }

    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }

    if (Hls.isSupported()) {
      const hlsConfig = {
        enableWorker: true,
        maxBufferLength: this.config.maxBufferLength || 30,
        maxMaxBufferLength: this.config.maxMaxBufferLength || 60,
        backBufferLength: this.config.backBufferLength || 30,
        fragLoadingTimeOut: 25000,
        manifestLoadingTimeOut: 25000,
        lowLatencyMode: this.config.lowLatencyMode || false,
        xhrSetup: (xhr: XMLHttpRequest) => {
          if (this.config.headers) {
            Object.entries(this.config.headers).forEach(([k, v]) => {
              xhr.setRequestHeader(k, v);
            });
          }
        },
      };

      const hls = new Hls(hlsConfig);
      this.hls = hls;

      hls.on(Events.ERROR, (_event: Events.ERROR, data: ErrorData) => {
        this.handleHlsError(data);
      });

      hls.on(Events.MANIFEST_PARSED, () => {
        if (source.initialTime && source.initialTime > 0 && this.videoElement) {
          this.videoElement.currentTime = source.initialTime;
        }
        this.emitQualityLevels();
        this.emitAudioTracks();
      });

      hls.on(Events.LEVEL_LOADED, () => {
        this.emitQualityLevels();
      });

      hls.on(Events.AUDIO_TRACK_SWITCHED, () => {
        this.emitAudioTracks();
      });

      hls.loadSource(source.url);
      hls.attachMedia(this.videoElement);
    } else {
      // Native Apple HLS fallback (Safari / iOS) or standard video element direct playback
      this.videoElement.src = source.url;
      if (source.initialTime && source.initialTime > 0) {
        this.videoElement.currentTime = source.initialTime;
      }
    }
  }

  public async play(): Promise<void> {
    if (this.videoElement) {
      await this.videoElement.play();
    }
  }

  public pause(): void {
    if (this.videoElement) {
      this.videoElement.pause();
    }
  }

  public async seek(time: number): Promise<void> {
    if (this.videoElement) {
      this.videoElement.currentTime = Math.max(0, time);
    }
  }

  public setQuality(qualityId: number | string): void {
    if (!this.hls) return;
    if (qualityId === 'auto' || qualityId === -1) {
      this.hls.currentLevel = -1; // Enable Auto ABR
    } else {
      const levelIdx = typeof qualityId === 'string' ? parseInt(qualityId, 10) : qualityId;
      if (levelIdx >= 0 && levelIdx < this.hls.levels.length) {
        this.hls.currentLevel = levelIdx;
      }
    }
    this.emitQualityLevels();
  }

  public getQualityLevels(): QualityLevel[] {
    if (!this.hls || !this.hls.levels.length) return [];
    return this.hls.levels.map((level, idx) => ({
      id: idx,
      name: level.height ? `${level.height}p` : `Level ${idx + 1}`,
      bitrate: level.bitrate,
      width: level.width,
      height: level.height,
      codec: level.attrs?.CODECS || level.videoCodec,
    }));
  }

  public getCurrentQuality(): QualityLevel | null {
    if (!this.hls || this.hls.currentLevel < 0 || !this.hls.levels[this.hls.currentLevel]) {
      return null;
    }
    const idx = this.hls.currentLevel;
    const level = this.hls.levels[idx];
    return {
      id: idx,
      name: level.height ? `${level.height}p` : `Level ${idx + 1}`,
      bitrate: level.bitrate,
      width: level.width,
      height: level.height,
      codec: level.attrs?.CODECS || level.videoCodec,
    };
  }

  public setAudioTrack(trackId: number | string): void {
    if (!this.hls) return;
    const id = typeof trackId === 'string' ? parseInt(trackId, 10) : trackId;
    if (id >= 0 && id < this.hls.audioTracks.length) {
      this.hls.audioTrack = id;
      this.emitAudioTracks();
    }
  }

  public getAudioTracks(): AudioTrackInfo[] {
    if (!this.hls || !this.hls.audioTracks.length) return [];
    return this.hls.audioTracks.map((track, idx) => ({
      id: idx,
      name: track.name || `Audio Track ${idx + 1}`,
      lang: track.lang || 'und',
      default: track.default,
    }));
  }

  public getBufferHealth(): number {
    if (!this.videoElement || !this.videoElement.buffered.length) return 0;
    const curTime = this.videoElement.currentTime;
    for (let i = 0; i < this.videoElement.buffered.length; i++) {
      const start = this.videoElement.buffered.start(i);
      const end = this.videoElement.buffered.end(i);
      if (curTime >= start && curTime <= end) {
        return Math.max(0, end - curTime);
      }
    }
    return 0;
  }

  public destroy(): void {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    this.videoElement = null;
    this.currentSource = null;
  }

  private handleHlsError(data: ErrorData): void {
    if (!this.hls) return;

    if (data.fatal) {
      switch (data.type) {
        case Hls.ErrorTypes.NETWORK_ERROR:
          this.networkRecoveryAttempts++;
          if (this.networkRecoveryAttempts <= this.maxRecoveryAttempts) {
            console.warn(`[HlsPipeline] Fatal network error encountered, attempting reload #${this.networkRecoveryAttempts}`);
            this.hls.startLoad();
          } else {
            this.reportFatalError('NETWORK_ERROR', `Failed to load HLS stream after ${this.maxRecoveryAttempts} attempts`, data);
          }
          break;

        case Hls.ErrorTypes.MEDIA_ERROR:
          this.mediaRecoveryAttempts++;
          if (this.mediaRecoveryAttempts <= this.maxRecoveryAttempts) {
            console.warn(`[HlsPipeline] Fatal media error encountered, recovering media #${this.mediaRecoveryAttempts}`);
            this.hls.recoverMediaError();
          } else if (this.mediaRecoveryAttempts === this.maxRecoveryAttempts + 1) {
            console.warn('[HlsPipeline] Swapping audio codec for secondary recovery');
            this.hls.swapAudioCodec();
            this.hls.recoverMediaError();
          } else {
            this.reportFatalError('MEDIA_ERROR', 'Unrecoverable media decoding error in HLS stream', data);
          }
          break;

        default:
          this.reportFatalError('OTHER_FATAL_ERROR', `HLS fatal error: ${data.details}`, data);
          break;
      }
    }
  }

  private reportFatalError(code: string, message: string, details?: unknown): void {
    if (this.onErrorCallback) {
      this.onErrorCallback({
        code,
        message,
        fatal: true,
        pipeline: 'hls',
        details,
      });
    }
  }

  private emitQualityLevels(): void {
    if (!this.onQualityLevelsCallback || !this.hls) return;
    const levels = this.getQualityLevels();
    const currentId = this.hls.currentLevel === -1 ? 'auto' : this.hls.currentLevel;
    this.onQualityLevelsCallback(levels, currentId);
  }

  private emitAudioTracks(): void {
    if (!this.onAudioTracksCallback || !this.hls) return;
    const tracks = this.getAudioTracks();
    const currentId = this.hls.audioTrack;
    this.onAudioTracksCallback(tracks, currentId);
  }
}
