/**
 * Stream Engine Metrics Tracker for WebVio
 * Real-time monitoring of playback latency, seek performance, buffer health, and frame statistics.
 */

import { EngineMetrics, StreamFormat } from './types';

export interface PerformanceMemory {
  usedJSHeapSize?: number;
  totalJSHeapSize?: number;
  jsHeapSizeLimit?: number;
}

export class EngineMetricsTracker {
  private videoElement: HTMLVideoElement | null = null;
  private activePipeline: StreamFormat | null = null;
  
  private loadStartTime: number | null = null;
  private firstFrameTimeMs: number | null = null;
  
  private seekStartTime: number | null = null;
  private seekLatencyMs: number | null = null;
  
  private lastFrameCount = 0;
  private lastDroppedCount = 0;
  private lastFpsCheckTime = performance.now();
  private currentFps = 0;
  
  private bandwidthSamples: { bytes: number; durationMs: number }[] = [];
  
  private updateInterval: number | null = null;
  private listeners: Set<(metrics: EngineMetrics) => void> = new Set();

  private boundOnLoadedData: (() => void) | null = null;
  private boundOnSeeking: (() => void) | null = null;
  private boundOnSeeked: (() => void) | null = null;
  private boundOnWaiting: (() => void) | null = null;
  private boundOnPlaying: (() => void) | null = null;

  /**
   * Attach the metrics tracker to a video element and streaming pipeline
   */
  public attach(videoElement: HTMLVideoElement, pipeline: StreamFormat): void {
    this.detach();
    this.videoElement = videoElement;
    this.activePipeline = pipeline;
    this.resetStats();

    this.boundOnLoadedData = () => {
      if (this.loadStartTime !== null && this.firstFrameTimeMs === null) {
        this.firstFrameTimeMs = Math.max(0, performance.now() - this.loadStartTime);
      }
    };

    this.boundOnSeeking = () => {
      this.seekStartTime = performance.now();
    };

    this.boundOnSeeked = () => {
      if (this.seekStartTime !== null) {
        this.seekLatencyMs = Math.max(0, performance.now() - this.seekStartTime);
        this.seekStartTime = null;
      }
    };

    this.boundOnPlaying = () => {
      if (this.loadStartTime !== null && this.firstFrameTimeMs === null) {
        this.firstFrameTimeMs = Math.max(0, performance.now() - this.loadStartTime);
      }
    };

    this.videoElement.addEventListener('loadeddata', this.boundOnLoadedData);
    this.videoElement.addEventListener('seeking', this.boundOnSeeking);
    this.videoElement.addEventListener('seeked', this.boundOnSeeked);
    this.videoElement.addEventListener('playing', this.boundOnPlaying);

    this.startPeriodicUpdates();
  }

  /**
   * Detach tracker from the current video element
   */
  public detach(): void {
    if (this.updateInterval !== null) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (this.videoElement) {
      if (this.boundOnLoadedData) this.videoElement.removeEventListener('loadeddata', this.boundOnLoadedData);
      if (this.boundOnSeeking) this.videoElement.removeEventListener('seeking', this.boundOnSeeking);
      if (this.boundOnSeeked) this.videoElement.removeEventListener('seeked', this.boundOnSeeked);
      if (this.boundOnPlaying) this.videoElement.removeEventListener('playing', this.boundOnPlaying);
    }

    this.videoElement = null;
    this.activePipeline = null;
  }

  /**
   * Notify tracker that media loading has started
   */
  public onLoadStart(): void {
    this.loadStartTime = performance.now();
    this.firstFrameTimeMs = null;
  }

  /**
   * Set active pipeline format
   */
  public setActivePipeline(pipeline: StreamFormat): void {
    this.activePipeline = pipeline;
  }

  /**
   * Record downloaded segment / chunk for bandwidth estimation
   */
  public recordChunkDownload(bytes: number, durationMs: number): void {
    if (durationMs <= 0 || bytes <= 0) return;
    this.bandwidthSamples.push({ bytes, durationMs });
    if (this.bandwidthSamples.length > 20) {
      this.bandwidthSamples.shift();
    }
  }

  /**
   * Calculate current metrics snapshot
   */
  public getMetrics(): EngineMetrics {
    const video = this.videoElement;
    const now = performance.now();

    let droppedFrames = 0;
    let totalFrames = 0;

    if (video) {
      if (typeof video.getVideoPlaybackQuality === 'function') {
        const quality = video.getVideoPlaybackQuality();
        droppedFrames = quality.droppedVideoFrames;
        totalFrames = quality.totalVideoFrames;
      } else {
        const anyVideo = video as unknown as { webkitDroppedFrameCount?: number; webkitDecodedFrameCount?: number };
        droppedFrames = anyVideo.webkitDroppedFrameCount || 0;
        totalFrames = anyVideo.webkitDecodedFrameCount || 0;
      }
    }

    // Calculate instantaneous FPS
    const timeDeltaSec = (now - this.lastFpsCheckTime) / 1000;
    if (timeDeltaSec >= 0.5) {
      const framesDelta = totalFrames - this.lastFrameCount;
      this.currentFps = Math.max(0, Math.round(framesDelta / timeDeltaSec));
      this.lastFrameCount = totalFrames;
      this.lastDroppedCount = droppedFrames;
      this.lastFpsCheckTime = now;
    }

    // Calculate buffer health
    let bufferHealthSeconds = 0;
    if (video && video.buffered && video.buffered.length > 0) {
      const currentTime = video.currentTime;
      for (let i = 0; i < video.buffered.length; i++) {
        const start = video.buffered.start(i);
        const end = video.buffered.end(i);
        if (currentTime >= start && currentTime <= end) {
          bufferHealthSeconds = Math.max(0, end - currentTime);
          break;
        } else if (start > currentTime && bufferHealthSeconds === 0) {
          // Future buffered segment
          bufferHealthSeconds = Math.max(0, end - start);
        }
      }
    }

    // Estimate memory usage
    let memoryMb = 0;
    const perf = window.performance as unknown as { memory?: PerformanceMemory };
    if (perf && perf.memory && perf.memory.usedJSHeapSize) {
      memoryMb = Math.round((perf.memory.usedJSHeapSize / (1024 * 1024)) * 10) / 10;
    }

    // Estimate bandwidth in bps
    let bandwidthBps = 0;
    if (this.bandwidthSamples.length > 0) {
      const totalBytes = this.bandwidthSamples.reduce((acc, s) => acc + s.bytes, 0);
      const totalDurationSec = this.bandwidthSamples.reduce((acc, s) => acc + s.durationMs, 0) / 1000;
      if (totalDurationSec > 0) {
        bandwidthBps = Math.round((totalBytes * 8) / totalDurationSec);
      }
    }

    // Estimate CPU/decode stress (0-100)
    let cpuEstimate = 10;
    if (this.currentFps > 0 && totalFrames > 0) {
      const dropRate = droppedFrames / totalFrames;
      cpuEstimate = Math.min(100, Math.round(15 + dropRate * 200 + (this.currentFps > 50 ? 25 : 10)));
    }

    return {
      firstFrameTimeMs: this.firstFrameTimeMs !== null ? Math.round(this.firstFrameTimeMs) : null,
      seekLatencyMs: this.seekLatencyMs !== null ? Math.round(this.seekLatencyMs) : null,
      bufferHealthSeconds: Math.round(bufferHealthSeconds * 100) / 100,
      cpuEstimate,
      droppedFrames,
      totalFrames,
      fps: this.currentFps,
      memoryMb,
      bandwidthBps,
      activePipeline: this.activePipeline,
      timestamp: Date.now(),
    };
  }

  /**
   * Subscribe to periodic metrics updates
   */
  public subscribe(listener: (metrics: EngineMetrics) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private startPeriodicUpdates(): void {
    if (this.updateInterval !== null) {
      clearInterval(this.updateInterval);
    }
    this.updateInterval = window.setInterval(() => {
      if (this.listeners.size > 0) {
        const metrics = this.getMetrics();
        this.listeners.forEach((listener) => {
          try {
            listener(metrics);
          } catch (e) {
            console.error('[EngineMetricsTracker] Listener error:', e);
          }
        });
      }
    }, 1000);
  }

  private resetStats(): void {
    this.loadStartTime = performance.now();
    this.firstFrameTimeMs = null;
    this.seekStartTime = null;
    this.seekLatencyMs = null;
    this.lastFrameCount = 0;
    this.lastDroppedCount = 0;
    this.lastFpsCheckTime = performance.now();
    this.currentFps = 0;
    this.bandwidthSamples = [];
  }
}
