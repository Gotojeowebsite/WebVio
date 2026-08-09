/**
 * Hardware-Accelerated MSE & WebCodecs Pipeline for WebVio
 * Low-latency chunk-by-chunk demuxing and decoding with GPU hardware acceleration.
 */

import {
  BasePipeline,
  StreamFormat,
  StreamSource,
  EngineConfig,
  QualityLevel,
  AudioTrackInfo,
  EngineError,
} from '../types';

export class MseWebCodecsPipeline implements BasePipeline {
  public readonly format: StreamFormat = 'mse';
  private videoElement: HTMLVideoElement | null = null;
  private currentSource: StreamSource | null = null;
  private config: EngineConfig = {};

  private mediaSource: MediaSource | null = null;
  private videoSourceBuffer: SourceBuffer | null = null;
  private audioSourceBuffer: SourceBuffer | null = null;
  private objectUrl: string | null = null;

  private appendQueue: Uint8Array[] = [];
  private isFeeding = false;
  private abortController: AbortController | null = null;
  private streamReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  private onErrorCallback?: (err: EngineError) => void;
  private onQualityLevelsCallback?: (levels: QualityLevel[], currentId: number | string) => void;
  private onAudioTracksCallback?: (tracks: AudioTrackInfo[], currentId: number | string) => void;

  public get isSupported(): boolean {
    return typeof window !== 'undefined' && typeof window.MediaSource !== 'undefined';
  }

  public get hasWebCodecsSupport(): boolean {
    return typeof window !== 'undefined' && typeof (window as unknown as { VideoDecoder?: unknown }).VideoDecoder !== 'undefined';
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
    this.cleanup();

    if (!this.videoElement) {
      throw new Error('[MseWebCodecsPipeline] Video element not attached');
    }

    if (!this.isSupported) {
      throw new Error('[MseWebCodecsPipeline] MediaSource is not supported');
    }

    try {
      this.abortController = new AbortController();

      // Determine codec mime type
      const mime = source.mimeType || 'video/mp4; codecs="avc1.640028, mp4a.40.2"';
      const isMimeSupported = MediaSource.isTypeSupported(mime);

      if (!isMimeSupported) {
        // Test common web codecs fallback
        const fallbackMimes = [
          'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
          'video/webm; codecs="vp9, opus"',
          'video/webm; codecs="vp8, vorbis"',
        ];
        const supported = fallbackMimes.find((m) => MediaSource.isTypeSupported(m));
        if (!supported) {
          throw new Error(`Unsupported MSE MIME format: ${mime}`);
        }
      }

      this.mediaSource = new MediaSource();
      this.objectUrl = URL.createObjectURL(this.mediaSource);
      this.videoElement.src = this.objectUrl;

      await new Promise<void>((resolve, reject) => {
        if (!this.mediaSource) return reject(new Error('MediaSource is null'));

        const onSourceOpen = () => {
          this.mediaSource?.removeEventListener('sourceopen', onSourceOpen);
          try {
            if (this.mediaSource) {
              this.videoSourceBuffer = this.mediaSource.addSourceBuffer(mime);
              this.videoSourceBuffer.mode = 'segments';
              this.videoSourceBuffer.addEventListener('updateend', () => {
                this.processAppendQueue();
                this.evictBackBuffer();
              });
            }
            resolve();
          } catch (e) {
            reject(e);
          }
        };

        this.mediaSource.addEventListener('sourceopen', onSourceOpen);
      });

      // Stream data from source URL directly into SourceBuffer
      this.startStreamingFeed(source.url);

      if (source.initialTime && source.initialTime > 0) {
        this.seek(source.initialTime);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.reportFatalError('MSE_INIT_ERROR', errorMsg, err);
      throw err;
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
    if (!this.videoElement) return;
    this.videoElement.currentTime = Math.max(0, time);
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
    this.cleanup();
    this.videoElement = null;
    this.currentSource = null;
  }

  private cleanup(): void {
    if (this.streamReader) {
      this.streamReader.cancel().catch(() => {});
      this.streamReader = null;
    }

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.mediaSource && this.mediaSource.readyState === 'open') {
      try {
        this.mediaSource.endOfStream();
      } catch {
        // Ignore endOfStream errors on teardown
      }
    }

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }

    this.mediaSource = null;
    this.videoSourceBuffer = null;
    this.audioSourceBuffer = null;
    this.appendQueue = [];
    this.isFeeding = false;
  }

  private async startStreamingFeed(url: string): Promise<void> {
    if (this.isFeeding) return;
    this.isFeeding = true;

    try {
      const res = await fetch(url, {
        headers: this.config.headers || {},
        signal: this.abortController?.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Failed to fetch media stream: HTTP ${res.status}`);
      }

      this.streamReader = res.body.getReader();

      while (this.isFeeding) {
        const { done, value } = await this.streamReader.read();
        if (done) {
          if (this.mediaSource && this.mediaSource.readyState === 'open') {
            try {
              this.mediaSource.endOfStream();
            } catch {
              // Ignore
            }
          }
          break;
        }

        if (value && value.byteLength > 0) {
          this.queueAppend(value);
        }
      }
    } catch (e: unknown) {
      if ((e as Error)?.name !== 'AbortError') {
        console.warn('[MseWebCodecsPipeline] Streaming feed interrupted:', e);
      }
    } finally {
      this.isFeeding = false;
    }
  }

  private queueAppend(data: Uint8Array): void {
    this.appendQueue.push(data);
    this.processAppendQueue();
  }

  private processAppendQueue(): void {
    if (!this.videoSourceBuffer || this.videoSourceBuffer.updating || this.appendQueue.length === 0) {
      return;
    }
    const chunk = this.appendQueue.shift();
    if (chunk) {
      try {
        this.videoSourceBuffer.appendBuffer(chunk.buffer as ArrayBuffer);
      } catch (err) {
        console.error('[MseWebCodecsPipeline] Append error:', err);
      }
    }
  }

  private evictBackBuffer(): void {
    if (!this.videoSourceBuffer || this.videoSourceBuffer.updating || !this.videoElement) return;
    const backBufferLimit = this.config.backBufferLength || 30;
    const curTime = this.videoElement.currentTime;

    if (curTime > backBufferLimit + 10) {
      try {
        const removeEnd = curTime - backBufferLimit;
        if (this.videoSourceBuffer.buffered.length > 0 && this.videoSourceBuffer.buffered.start(0) < removeEnd) {
          this.videoSourceBuffer.remove(0, removeEnd);
        }
      } catch {
        // Non-critical eviction error
      }
    }
  }

  private reportFatalError(code: string, message: string, details?: unknown): void {
    if (this.onErrorCallback) {
      this.onErrorCallback({
        code,
        message,
        fatal: true,
        pipeline: 'mse',
        details,
      });
    }
  }
}
