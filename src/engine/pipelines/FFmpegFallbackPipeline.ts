/**
 * Smart Segment-Based FFmpeg.wasm Fallback Pipeline for WebVio
 * Transcodes on-demand segments with `-ss` and `-t` windows to avoid full-file lockups,
 * enabling responsive playback of unsupported containers (MKV, AVI, FLV) and codecs (DTS, AC3, HEVC).
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import {
  BasePipeline,
  StreamFormat,
  StreamSource,
  EngineConfig,
  QualityLevel,
  AudioTrackInfo,
  EngineError,
} from '../types';

export class FFmpegFallbackPipeline implements BasePipeline {
  public readonly format: StreamFormat = 'ffmpeg-fallback';
  private videoElement: HTMLVideoElement | null = null;
  private currentSource: StreamSource | null = null;
  private config: EngineConfig = {};

  private ffmpeg: FFmpeg | null = null;
  private isFfmpegLoaded = false;
  private isTranscoding = false;

  private segmentDuration = 30; // 30 second chunks
  private activeSegmentIndex = 0;
  private segmentUrls: Map<number, string> = new Map();
  private prefetchingSegmentIndex: number | null = null;

  private abortController: AbortController | null = null;
  private currentInputFile: Uint8Array | null = null;
  private isSourceFileLoaded = false;

  private onErrorCallback?: (err: EngineError) => void;
  private onQualityLevelsCallback?: (levels: QualityLevel[], currentId: number | string) => void;
  private onAudioTracksCallback?: (tracks: AudioTrackInfo[], currentId: number | string) => void;
  private onTranscodeProgress?: (progress: number, message: string) => void;

  public get isSupported(): boolean {
    return typeof window !== 'undefined' && typeof WebAssembly !== 'undefined';
  }

  public setCallbacks(callbacks: {
    onError?: (err: EngineError) => void;
    onQualityLevels?: (levels: QualityLevel[], currentId: number | string) => void;
    onAudioTracks?: (tracks: AudioTrackInfo[], currentId: number | string) => void;
    onTranscodeProgress?: (progress: number, message: string) => void;
  }): void {
    this.onErrorCallback = callbacks.onError;
    this.onQualityLevelsCallback = callbacks.onQualityLevels;
    this.onAudioTracksCallback = callbacks.onAudioTracks;
    this.onTranscodeProgress = callbacks.onTranscodeProgress;
  }

  public async initialize(
    videoElement: HTMLVideoElement,
    source: StreamSource,
    config: EngineConfig
  ): Promise<void> {
    this.videoElement = videoElement;
    this.currentSource = source;
    this.config = config;
    if (config.ffmpegSegmentDuration) {
      this.segmentDuration = config.ffmpegSegmentDuration;
    }
    await this.load(source);
  }

  public async load(source: StreamSource): Promise<void> {
    this.currentSource = source;
    this.cleanup();

    if (!this.videoElement) {
      throw new Error('[FFmpegFallbackPipeline] Video element not attached');
    }

    try {
      this.abortController = new AbortController();

      // 1. Initialize FFmpeg instance if not already loaded
      await this.ensureFfmpegLoaded();

      // 2. Fetch source video data
      this.onTranscodeProgress?.(10, 'Fetching media for software decoding...');
      const fileData = await this.fetchSourceData(source.url);
      this.currentInputFile = fileData;
      this.isSourceFileLoaded = true;

      // 3. Write input to FFmpeg virtual filesystem
      await this.ffmpeg?.writeFile('input_media', fileData);

      // 4. Start transcoding initial segment (at initialTime or 0)
      const startTime = source.initialTime || 0;
      this.activeSegmentIndex = Math.floor(startTime / this.segmentDuration);
      
      this.onTranscodeProgress?.(30, 'Transcoding initial segment...');
      const segmentUrl = await this.transcodeSegment(this.activeSegmentIndex);

      if (!this.videoElement) return;

      this.videoElement.src = segmentUrl;
      const offsetInSegment = startTime % this.segmentDuration;
      
      const onLoadedMetadata = () => {
        if (this.videoElement && offsetInSegment > 0) {
          this.videoElement.currentTime = offsetInSegment;
        }
        this.videoElement?.removeEventListener('loadedmetadata', onLoadedMetadata);
      };
      this.videoElement.addEventListener('loadedmetadata', onLoadedMetadata);

      // 5. Setup segment boundary listener to trigger continuous background prefetch
      this.setupContinuousPlayback();

    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.reportFatalError('FFMPEG_TRANSCODE_ERROR', errorMsg, err);
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
    if (!this.videoElement || !this.isSourceFileLoaded) return;

    const targetSegIdx = Math.floor(time / this.segmentDuration);
    const offsetInSeg = time % this.segmentDuration;

    if (targetSegIdx === this.activeSegmentIndex && this.segmentUrls.has(targetSegIdx)) {
      // Seeking within current active segment
      this.videoElement.currentTime = offsetInSeg;
      return;
    }

    // Transcode target segment on-demand
    this.activeSegmentIndex = targetSegIdx;
    try {
      let segUrl = this.segmentUrls.get(targetSegIdx);
      if (!segUrl) {
        segUrl = await this.transcodeSegment(targetSegIdx);
      }

      this.videoElement.src = segUrl;
      const onLoaded = () => {
        if (this.videoElement) {
          this.videoElement.currentTime = offsetInSeg;
          this.videoElement.play().catch(() => {});
        }
        this.videoElement?.removeEventListener('loadedmetadata', onLoaded);
      };
      this.videoElement.addEventListener('loadedmetadata', onLoaded);
    } catch (e) {
      console.error('[FFmpegFallbackPipeline] Seek transcode error:', e);
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

    this.segmentUrls.forEach((url) => {
      URL.revokeObjectURL(url);
    });
    this.segmentUrls.clear();

    if (this.ffmpeg) {
      try {
        this.ffmpeg.deleteFile('input_media').catch(() => {});
        this.ffmpeg.deleteFile('output_seg.mp4').catch(() => {});
      } catch {
        // Ignore VFS cleanup errors
      }
    }

    this.currentInputFile = null;
    this.isSourceFileLoaded = false;
    this.isTranscoding = false;
    this.prefetchingSegmentIndex = null;
  }

  private async ensureFfmpegLoaded(): Promise<void> {
    if (this.isFfmpegLoaded && this.ffmpeg) return;

    this.onTranscodeProgress?.(5, 'Loading WebAssembly FFmpeg Core...');
    const ffmpeg = new FFmpeg();
    this.ffmpeg = ffmpeg;

    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';

    ffmpeg.on('progress', ({ progress }) => {
      const percent = Math.round(progress * 100);
      this.onTranscodeProgress?.(percent, `Transcoding: ${percent}%`);
    });

    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    this.isFfmpegLoaded = true;
  }

  private async fetchSourceData(url: string): Promise<Uint8Array> {
    const res = await fetch(url, {
      signal: this.abortController?.signal,
      headers: this.config.headers || {},
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch video for FFmpeg transcode: HTTP ${res.status}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  private async transcodeSegment(segmentIndex: number): Promise<string> {
    if (!this.ffmpeg) throw new Error('FFmpeg not initialized');
    this.isTranscoding = true;

    const startTimeSec = segmentIndex * this.segmentDuration;
    const outputFilename = `output_seg_${segmentIndex}.mp4`;

    try {
      // Smart Segment Transcode Arguments:
      // -ss before -i for fast input seeking without decoding prior keyframes
      // -t specifies duration window (e.g. 30s)
      // -preset ultrafast for minimal latency
      // -c:v libx264 -crf 26 for efficient browser compatibility
      // -c:a aac -b:a 128k for universal audio compatibility
      // -movflags +faststart to ensure moov atom is at start of segment
      const args = [
        '-ss',
        String(startTimeSec),
        '-i',
        'input_media',
        '-t',
        String(this.segmentDuration),
        '-preset',
        'ultrafast',
        '-c:v',
        'libx264',
        '-crf',
        '26',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-movflags',
        '+faststart',
        outputFilename,
      ];

      await this.ffmpeg.exec(args);

      const data = await this.ffmpeg.readFile(outputFilename);
      const blob = new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' });
      const blobUrl = URL.createObjectURL(blob);

      this.segmentUrls.set(segmentIndex, blobUrl);

      // Clean up output file from VFS to avoid memory bloat
      await this.ffmpeg.deleteFile(outputFilename);

      return blobUrl;
    } finally {
      this.isTranscoding = false;
    }
  }

  private setupContinuousPlayback(): void {
    if (!this.videoElement) return;

    const onTimeUpdate = () => {
      if (!this.videoElement) return;
      const curTime = this.videoElement.currentTime;
      const duration = this.videoElement.duration || this.segmentDuration;

      // When reaching near end of current segment (e.g. within 5s), prefetch next segment
      if (duration - curTime <= 5 && !this.isTranscoding && this.prefetchingSegmentIndex === null) {
        const nextSeg = this.activeSegmentIndex + 1;
        if (!this.segmentUrls.has(nextSeg)) {
          this.prefetchingSegmentIndex = nextSeg;
          this.transcodeSegment(nextSeg)
            .catch((e) => console.warn('[FFmpegFallbackPipeline] Segment prefetch error:', e))
            .finally(() => {
              this.prefetchingSegmentIndex = null;
            });
        }
      }
    };

    const onEnded = () => {
      // Seamlessly transition to next segment
      const nextSeg = this.activeSegmentIndex + 1;
      const nextUrl = this.segmentUrls.get(nextSeg);

      if (nextUrl && this.videoElement) {
        this.activeSegmentIndex = nextSeg;
        this.videoElement.src = nextUrl;
        this.videoElement.play().catch(() => {});
      }
    };

    this.videoElement.addEventListener('timeupdate', onTimeUpdate);
    this.videoElement.addEventListener('ended', onEnded);
  }

  private reportFatalError(code: string, message: string, details?: unknown): void {
    if (this.onErrorCallback) {
      this.onErrorCallback({
        code,
        message,
        fatal: true,
        pipeline: 'ffmpeg-fallback',
        details,
      });
    }
  }
}
