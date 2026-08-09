/**
 * WebTorrent Chunk Streaming Pipeline for WebVio
 * Client-side BitTorrent streaming pipeline with sequential piece fetching,
 * dynamic seek buffer management, and direct media streaming.
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

export interface TorrentFileStats {
  name: string;
  length: number;
  downloaded: number;
  progress: number;
}

export class WebTorrentPipeline implements BasePipeline {
  public readonly format: StreamFormat = 'webtorrent';
  private videoElement: HTMLVideoElement | null = null;
  private currentSource: StreamSource | null = null;
  private config: EngineConfig = {};

  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;
  private objectUrl: string | null = null;
  private activeBlobUrl: string | null = null;

  private isDownloading = false;
  private totalLength = 0;
  private chunkSize = 2 * 1024 * 1024; // 2MB chunk window
  private currentByteOffset = 0;
  private abortController: AbortController | null = null;
  private appendQueue: Uint8Array[] = [];

  private onErrorCallback?: (err: EngineError) => void;
  private onQualityLevelsCallback?: (levels: QualityLevel[], currentId: number | string) => void;
  private onAudioTracksCallback?: (tracks: AudioTrackInfo[], currentId: number | string) => void;

  public get isSupported(): boolean {
    return typeof window !== 'undefined' && (typeof window.MediaSource !== 'undefined' || typeof window.ReadableStream !== 'undefined');
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
      throw new Error('[WebTorrentPipeline] Video element not attached');
    }

    try {
      this.abortController = new AbortController();

      // If a direct stream URL exists (e.g. cached debrid stream or WebTorrent HTTP gateway)
      if (source.url.startsWith('http://') || source.url.startsWith('https://')) {
        // Probe total length via HEAD request
        await this.probeStreamMetadata(source.url);

        // If MediaSource is supported and stream is fragmented MP4 or WebM
        const mimeType = source.mimeType || 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"';
        if (typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported(mimeType)) {
          await this.setupMsePlayback(source.url, mimeType);
        } else {
          // Native media element direct streaming with byte-range support
          this.videoElement.src = source.url;
        }
      } else if (source.infoHash || source.url.startsWith('magnet:')) {
        // Handle Magnet/InfoHash streaming with sequential piece loader
        await this.setupMagnetStream(source);
      } else {
        throw new Error('Unsupported torrent source format');
      }

      if (source.initialTime && source.initialTime > 0) {
        this.seek(source.initialTime);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.reportFatalError('TORRENT_STREAM_ERROR', errorMsg, err);
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

    if (this.totalLength > 0 && this.videoElement.duration > 0) {
      const targetPercent = Math.min(1, Math.max(0, time / this.videoElement.duration));
      this.currentByteOffset = Math.floor(targetPercent * this.totalLength);
      // Restart sequential fetch from seek position
      this.fetchSequentialChunks();
    }
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
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }

    if (this.activeBlobUrl) {
      URL.revokeObjectURL(this.activeBlobUrl);
      this.activeBlobUrl = null;
    }

    this.mediaSource = null;
    this.sourceBuffer = null;
    this.appendQueue = [];
    this.isDownloading = false;
    this.currentByteOffset = 0;
    this.totalLength = 0;
  }

  private async probeStreamMetadata(url: string): Promise<void> {
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        signal: this.abortController?.signal,
        headers: this.config.headers || {},
      });
      const contentLength = res.headers.get('content-length');
      if (contentLength) {
        this.totalLength = parseInt(contentLength, 10);
      }
    } catch {
      // Non-fatal if HEAD request fails or is blocked by CORS
    }
  }

  private async setupMsePlayback(url: string, mimeType: string): Promise<void> {
    this.mediaSource = new MediaSource();
    this.objectUrl = URL.createObjectURL(this.mediaSource);
    if (this.videoElement) {
      this.videoElement.src = this.objectUrl;
    }

    await new Promise<void>((resolve, reject) => {
      if (!this.mediaSource) return reject(new Error('MediaSource is null'));

      const onOpen = () => {
        this.mediaSource?.removeEventListener('sourceopen', onOpen);
        try {
          if (this.mediaSource) {
            this.sourceBuffer = this.mediaSource.addSourceBuffer(mimeType);
            this.sourceBuffer.addEventListener('updateend', () => this.processAppendQueue());
          }
          resolve();
        } catch (e) {
          reject(e);
        }
      };

      this.mediaSource.addEventListener('sourceopen', onOpen);
    });

    this.fetchSequentialChunks();
  }

  private async setupMagnetStream(source: StreamSource): Promise<void> {
    // When dealing with magnet/infoHash without direct gateway URL,
    // establish WebRTC / WebSocket tracker connection or fallback to debrid HTTP gateway
    const magnetUri = source.url.startsWith('magnet:') ? source.url : `magnet:?xt=urn:btih:${source.infoHash}`;
    
    // Check if browser has global WebTorrent instance available or create streamable response
    const win = window as unknown as { WebTorrent?: new () => { add: (uri: string, cb: (torrent: unknown) => void) => void } };
    if (typeof win.WebTorrent !== 'undefined') {
      try {
        const client = new win.WebTorrent();
        client.add(magnetUri, (torrent: unknown) => {
          const t = torrent as { files: { name: string; renderTo: (el: HTMLVideoElement) => void }[] };
          if (t.files && t.files.length > 0 && this.videoElement) {
            const targetFile = t.files[source.fileIdx || 0] || t.files[0];
            targetFile.renderTo(this.videoElement);
          }
        });
        return;
      } catch {
        // Fall through
      }
    }

    throw new Error(`Torrent requires debrid resolution or WebTorrent client to stream: ${source.infoHash || source.url}`);
  }

  private async fetchSequentialChunks(): Promise<void> {
    if (this.isDownloading || !this.currentSource) return;
    this.isDownloading = true;

    try {
      const url = this.currentSource.url;
      const start = this.currentByteOffset;
      const end = this.totalLength > 0 ? Math.min(start + this.chunkSize - 1, this.totalLength - 1) : start + this.chunkSize - 1;

      const headers: Record<string, string> = {
        ...this.config.headers,
        Range: `bytes=${start}-${end}`,
      };

      const res = await fetch(url, {
        headers,
        signal: this.abortController?.signal,
      });

      if (res.ok || res.status === 206) {
        const buf = await res.arrayBuffer();
        const data = new Uint8Array(buf);
        this.currentByteOffset += data.length;

        if (this.sourceBuffer) {
          this.queueAppend(data);
        }

        // If there's more data and buffer needs filling, fetch next chunk
        if (this.getBufferHealth() < (this.config.maxBufferLength || 30) && (!this.totalLength || this.currentByteOffset < this.totalLength)) {
          setTimeout(() => {
            this.isDownloading = false;
            this.fetchSequentialChunks();
          }, 50);
          return;
        }
      }
    } catch (e: unknown) {
      if ((e as Error)?.name !== 'AbortError') {
        console.warn('[WebTorrentPipeline] Chunk fetch error:', e);
      }
    } finally {
      this.isDownloading = false;
    }
  }

  private queueAppend(data: Uint8Array): void {
    this.appendQueue.push(data);
    this.processAppendQueue();
  }

  private processAppendQueue(): void {
    if (!this.sourceBuffer || this.sourceBuffer.updating || this.appendQueue.length === 0) {
      return;
    }
    const chunk = this.appendQueue.shift();
    if (chunk) {
      try {
        this.sourceBuffer.appendBuffer(chunk.buffer as ArrayBuffer);
      } catch (err) {
        console.error('[WebTorrentPipeline] Append buffer error:', err);
      }
    }
  }

  private reportFatalError(code: string, message: string, details?: unknown): void {
    if (this.onErrorCallback) {
      this.onErrorCallback({
        code,
        message,
        fatal: true,
        pipeline: 'webtorrent',
        details,
      });
    }
  }
}
