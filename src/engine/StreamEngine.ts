/**
 * StreamEngine Master Orchestrator for WebVio
 * Unifies HLS, DASH, WebTorrent, MSE, WebCodecs, Native Turbo Mode, and FFmpeg.wasm Fallback.
 */

import {
  BasePipeline,
  EngineConfig,
  EngineError,
  EngineEvents,
  EngineMetrics,
  EngineStatus,
  QualityLevel,
  AudioTrackInfo,
  StreamFormat,
  StreamSource,
} from './types';
import { EngineMetricsTracker } from './metrics';
import { HlsPipeline } from './pipelines/HlsPipeline';
import { DashPipeline } from './pipelines/DashPipeline';
import { WebTorrentPipeline } from './pipelines/WebTorrentPipeline';
import { MseWebCodecsPipeline } from './pipelines/MseWebCodecsPipeline';
import { FFmpegFallbackPipeline } from './pipelines/FFmpegFallbackPipeline';

export class StreamEngine {
  private videoElement: HTMLVideoElement | null = null;
  private currentSource: StreamSource | null = null;
  private config: EngineConfig = {
    turboMode: true,
    maxBufferLength: 30,
    maxMaxBufferLength: 60,
    backBufferLength: 30,
    autoFallback: true,
    ffmpegSegmentDuration: 30,
  };

  private activePipeline: BasePipeline | null = null;
  private activePipelineFormat: StreamFormat | null = null;
  private status: EngineStatus = 'idle';

  private metricsTracker: EngineMetricsTracker = new EngineMetricsTracker();
  private eventListeners = new Map<keyof EngineEvents, Set<unknown>>();

  private attemptedPipelines: Set<StreamFormat> = new Set();
  private isDestroyed = false;

  private boundOnPlay = () => this.setStatus('playing');
  private boundOnPause = () => this.setStatus('paused');
  private boundOnWaiting = () => this.setStatus('buffering');
  private boundOnPlaying = () => this.setStatus('playing');
  private boundOnSeeking = () => this.setStatus('seeking');
  private boundOnSeeked = () => this.setStatus('playing');
  private boundOnEnded = () => this.setStatus('ended');
  private boundOnError = (e: Event) => this.handleNativeVideoError(e);

  constructor(config?: Partial<EngineConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  /**
   * Attach video element to the StreamEngine
   */
  public attach(videoElement: HTMLVideoElement): void {
    if (this.videoElement === videoElement) return;
    this.detach();

    this.videoElement = videoElement;
    this.videoElement.addEventListener('play', this.boundOnPlay);
    this.videoElement.addEventListener('pause', this.boundOnPause);
    this.videoElement.addEventListener('waiting', this.boundOnWaiting);
    this.videoElement.addEventListener('playing', this.boundOnPlaying);
    this.videoElement.addEventListener('seeking', this.boundOnSeeking);
    this.videoElement.addEventListener('seeked', this.boundOnSeeked);
    this.videoElement.addEventListener('ended', this.boundOnEnded);
    this.videoElement.addEventListener('error', this.boundOnError);

    this.metricsTracker.attach(this.videoElement, this.activePipelineFormat || 'native');
    this.metricsTracker.subscribe((metrics) => this.emit('metricsUpdate', metrics));
  }

  /**
   * Detach video element and reset listeners
   */
  public detach(): void {
    if (this.videoElement) {
      this.videoElement.removeEventListener('play', this.boundOnPlay);
      this.videoElement.removeEventListener('pause', this.boundOnPause);
      this.videoElement.removeEventListener('waiting', this.boundOnWaiting);
      this.videoElement.removeEventListener('playing', this.boundOnPlaying);
      this.videoElement.removeEventListener('seeking', this.boundOnSeeking);
      this.videoElement.removeEventListener('seeked', this.boundOnSeeked);
      this.videoElement.removeEventListener('ended', this.boundOnEnded);
      this.videoElement.removeEventListener('error', this.boundOnError);
      this.videoElement = null;
    }
    this.metricsTracker.detach();
  }

  /**
   * Load stream source with automated format probing and Turbo Mode fast-path
   */
  public async load(sourceInput: StreamSource | string): Promise<void> {
    const source: StreamSource = typeof sourceInput === 'string' ? { url: sourceInput } : sourceInput;
    this.currentSource = source;
    this.attemptedPipelines.clear();
    this.setStatus('initializing');
    this.metricsTracker.onLoadStart();

    const targetFormat = this.detectFormat(source);
    await this.mountPipeline(targetFormat, source);
  }

  /**
   * Start playback
   */
  public async play(): Promise<void> {
    if (this.activePipeline) {
      await this.activePipeline.play();
    } else if (this.videoElement) {
      await this.videoElement.play();
    }
  }

  /**
   * Pause playback
   */
  public pause(): void {
    if (this.activePipeline) {
      this.activePipeline.pause();
    } else if (this.videoElement) {
      this.videoElement.pause();
    }
  }

  /**
   * Seek to timestamp in seconds
   */
  public async seek(time: number): Promise<void> {
    if (this.activePipeline) {
      await this.activePipeline.seek(time);
    } else if (this.videoElement) {
      this.videoElement.currentTime = Math.max(0, time);
    }
  }

  /**
   * Switch video quality level
   */
  public setQuality(qualityId: number | string): void {
    if (this.activePipeline?.setQuality) {
      this.activePipeline.setQuality(qualityId);
    }
  }

  /**
   * Get available video quality levels
   */
  public getQualityLevels(): QualityLevel[] {
    return this.activePipeline?.getQualityLevels?.() || [];
  }

  /**
   * Get currently active video quality level
   */
  public getCurrentQuality(): QualityLevel | null {
    return this.activePipeline?.getCurrentQuality?.() || null;
  }

  /**
   * Switch active audio track
   */
  public setAudioTrack(trackId: number | string): void {
    if (this.activePipeline?.setAudioTrack) {
      this.activePipeline.setAudioTrack(trackId);
    }
  }

  /**
   * Get available audio tracks
   */
  public getAudioTracks(): AudioTrackInfo[] {
    return this.activePipeline?.getAudioTracks?.() || [];
  }

  /**
   * Get active streaming pipeline
   */
  public getActivePipeline(): StreamFormat | null {
    return this.activePipelineFormat;
  }

  /**
   * Get current engine status
   */
  public getStatus(): EngineStatus {
    return this.status;
  }

  /**
   * Get live metrics snapshot
   */
  public getMetrics(): EngineMetrics {
    return this.metricsTracker.getMetrics();
  }

  /**
   * Subscribe to engine events
   */
  public on<K extends keyof EngineEvents>(event: K, handler: EngineEvents[K]): () => void {
    let handlers = this.eventListeners.get(event);
    if (!handlers) {
      handlers = new Set();
      this.eventListeners.set(event, handlers);
    }
    handlers.add(handler);

    return () => {
      handlers?.delete(handler);
    };
  }

  /**
   * Unsubscribe from engine events
   */
  public off<K extends keyof EngineEvents>(event: K, handler: EngineEvents[K]): void {
    const handlers = this.eventListeners.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Destroy the StreamEngine and release all pipeline memory
   */
  public async destroy(): Promise<void> {
    this.isDestroyed = true;
    this.setStatus('destroyed');
    this.detach();
    if (this.activePipeline) {
      await this.activePipeline.destroy();
      this.activePipeline = null;
    }
    this.activePipelineFormat = null;
    this.currentSource = null;
    this.eventListeners.clear();
  }

  /**
   * Probe source format based on URL extensions, mime hints, and metadata
   */
  private detectFormat(source: StreamSource): StreamFormat {
    if (source.format && source.format !== 'auto') {
      return source.format;
    }

    const url = (source.url || '').toLowerCase();
    const mime = (source.mimeType || '').toLowerCase();

    // 1. Check HLS (.m3u8)
    if (url.includes('.m3u8') || mime.includes('mpegurl') || mime.includes('hls')) {
      return 'hls';
    }

    // 2. Check DASH (.mpd)
    if (url.includes('.mpd') || mime.includes('dash+xml')) {
      return 'dash';
    }

    // 3. Check WebTorrent / Magnet
    if (source.infoHash || url.startsWith('magnet:') || url.endsWith('.torrent')) {
      return 'webtorrent';
    }

    // 4. Check Unsupported Containers requiring FFmpeg software transcoding
    if (url.includes('.mkv') || url.includes('.avi') || url.includes('.flv') || url.includes('.wmv')) {
      return 'ffmpeg-fallback';
    }

    // 5. Check Turbo Mode Native Fast-Path for direct MP4/WebM/HTTP streams
    if (this.config.turboMode && (url.includes('.mp4') || url.includes('.webm') || url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:'))) {
      return 'native';
    }

    return 'mse';
  }

  /**
   * Mount and initialize the requested pipeline
   */
  private async mountPipeline(format: StreamFormat, source: StreamSource): Promise<void> {
    if (this.isDestroyed || !this.videoElement) return;

    this.attemptedPipelines.add(format);
    this.activePipelineFormat = format;
    this.metricsTracker.setActivePipeline(format);
    this.emit('pipelineChanged', format);

    if (this.activePipeline) {
      await this.activePipeline.destroy();
      this.activePipeline = null;
    }

    try {
      switch (format) {
        case 'native':
          // Turbo Mode Native Fast-Path: Direct browser HTML5 video playback (<1.5s start)
          this.videoElement.src = source.url;
          if (source.initialTime && source.initialTime > 0) {
            this.videoElement.currentTime = source.initialTime;
          }
          break;

        case 'hls': {
          const hlsPipe = new HlsPipeline();
          hlsPipe.setCallbacks({
            onError: (err) => this.handlePipelineError(err),
            onQualityLevels: (levels, cur) => this.emit('qualityLevelsChanged', levels, cur),
            onAudioTracks: (tracks, cur) => this.emit('audioTracksChanged', tracks, cur),
          });
          await hlsPipe.initialize(this.videoElement, source, this.config);
          this.activePipeline = hlsPipe;
          break;
        }

        case 'dash': {
          const dashPipe = new DashPipeline();
          dashPipe.setCallbacks({
            onError: (err) => this.handlePipelineError(err),
            onQualityLevels: (levels, cur) => this.emit('qualityLevelsChanged', levels, cur),
            onAudioTracks: (tracks, cur) => this.emit('audioTracksChanged', tracks, cur),
          });
          await dashPipe.initialize(this.videoElement, source, this.config);
          this.activePipeline = dashPipe;
          break;
        }

        case 'webtorrent': {
          const wtPipe = new WebTorrentPipeline();
          wtPipe.setCallbacks({
            onError: (err) => this.handlePipelineError(err),
            onQualityLevels: (levels, cur) => this.emit('qualityLevelsChanged', levels, cur),
            onAudioTracks: (tracks, cur) => this.emit('audioTracksChanged', tracks, cur),
          });
          await wtPipe.initialize(this.videoElement, source, this.config);
          this.activePipeline = wtPipe;
          break;
        }

        case 'mse': {
          const msePipe = new MseWebCodecsPipeline();
          msePipe.setCallbacks({
            onError: (err) => this.handlePipelineError(err),
            onQualityLevels: (levels, cur) => this.emit('qualityLevelsChanged', levels, cur),
            onAudioTracks: (tracks, cur) => this.emit('audioTracksChanged', tracks, cur),
          });
          await msePipe.initialize(this.videoElement, source, this.config);
          this.activePipeline = msePipe;
          break;
        }

        case 'ffmpeg-fallback': {
          const ffPipe = new FFmpegFallbackPipeline();
          ffPipe.setCallbacks({
            onError: (err) => this.handlePipelineError(err),
            onQualityLevels: (levels, cur) => this.emit('qualityLevelsChanged', levels, cur),
            onAudioTracks: (tracks, cur) => this.emit('audioTracksChanged', tracks, cur),
          });
          await ffPipe.initialize(this.videoElement, source, this.config);
          this.activePipeline = ffPipe;
          break;
        }

        default:
          throw new Error(`Unknown pipeline format: ${format}`);
      }
    } catch (err: unknown) {
      console.warn(`[StreamEngine] Pipeline '${format}' failed to initialize:`, err);
      if (this.config.autoFallback) {
        await this.fallbackToNextPipeline(format);
      } else {
        this.emit('error', {
          code: 'PIPELINE_MOUNT_FAILED',
          message: err instanceof Error ? err.message : String(err),
          fatal: true,
          pipeline: format,
          details: err,
        });
      }
    }
  }

  /**
   * Automatic multi-tier pipeline fallback
   */
  private async fallbackToNextPipeline(failedFormat: StreamFormat): Promise<void> {
    if (!this.currentSource) return;

    this.emit('warning', `Pipeline ${failedFormat} failed. Attempting fallback...`);

    const fallbackHierarchy: Record<StreamFormat, StreamFormat[]> = {
      native: ['mse', 'ffmpeg-fallback'],
      hls: ['native', 'ffmpeg-fallback'],
      dash: ['mse', 'ffmpeg-fallback'],
      webtorrent: ['native', 'ffmpeg-fallback'],
      mse: ['ffmpeg-fallback'],
      'ffmpeg-fallback': [],
      auto: ['native', 'mse', 'ffmpeg-fallback'],
    };

    const candidates = fallbackHierarchy[failedFormat] || ['ffmpeg-fallback'];
    const nextFormat = candidates.find((f) => !this.attemptedPipelines.has(f));

    if (nextFormat) {
      console.info(`[StreamEngine] Falling back from '${failedFormat}' to '${nextFormat}'`);
      this.setStatus('recovering');
      await this.mountPipeline(nextFormat, this.currentSource);
    } else {
      this.setStatus('error');
      this.emit('error', {
        code: 'ALL_FALLBACKS_EXHAUSTED',
        message: `All streaming pipelines failed for source: ${this.currentSource.url}`,
        fatal: true,
        pipeline: failedFormat,
      });
    }
  }

  private handleNativeVideoError(_e: Event): void {
    if (this.activePipelineFormat === 'native' && this.config.autoFallback) {
      console.warn('[StreamEngine] Native HTML5 video error. Switching to fallback pipeline...');
      this.fallbackToNextPipeline('native');
    }
  }

  private handlePipelineError(err: EngineError): void {
    if (err.fatal && this.config.autoFallback) {
      console.warn(`[StreamEngine] Fatal error in pipeline ${err.pipeline}. Triggering auto-fallback...`);
      this.fallbackToNextPipeline(err.pipeline);
    } else {
      this.emit('error', err);
    }
  }

  private setStatus(status: EngineStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.emit('statusChange', status);
    }
  }

  public emit<K extends keyof EngineEvents>(event: K, ...args: Parameters<EngineEvents[K]>): void {
    const handlers = this.eventListeners.get(event);
    if (handlers) {
      handlers.forEach((fn) => {
        try {
          (fn as (...a: unknown[]) => void)(...args);
        } catch (e) {
          console.error(`[StreamEngine] Error in '${event}' event listener:`, e);
        }
      });
    }
  }
}
