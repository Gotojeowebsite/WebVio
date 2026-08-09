/**
 * MPEG-DASH Adaptive MSE Pipeline for WebVio
 * High-performance browser-native MPD manifest parser and segment scheduler using MediaSource Extensions.
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

interface DashRepresentation {
  id: string;
  bandwidth: number;
  width?: number;
  height?: number;
  codecs?: string;
  mimeType: string;
  frameRate?: number;
  initializationTemplate?: string;
  mediaTemplate?: string;
  timescale: number;
  duration: number;
  startNumber: number;
  baseURL: string;
}

interface DashAdaptationSet {
  id: string;
  contentType: 'video' | 'audio';
  mimeType: string;
  codecs?: string;
  representations: DashRepresentation[];
  lang?: string;
}

export class DashPipeline implements BasePipeline {
  public readonly format: StreamFormat = 'dash';
  private videoElement: HTMLVideoElement | null = null;
  private currentSource: StreamSource | null = null;
  private config: EngineConfig = {};

  private mediaSource: MediaSource | null = null;
  private videoSourceBuffer: SourceBuffer | null = null;
  private audioSourceBuffer: SourceBuffer | null = null;
  private objectUrl: string | null = null;

  private videoAdaptationSets: DashAdaptationSet[] = [];
  private audioAdaptationSets: DashAdaptationSet[] = [];
  private activeVideoRep: DashRepresentation | null = null;
  private activeAudioRep: DashRepresentation | null = null;

  private videoAppendQueue: Uint8Array[] = [];
  private audioAppendQueue: Uint8Array[] = [];

  private isSegmentFetching = false;
  private lastFetchedVideoSegment = -1;
  private lastFetchedAudioSegment = -1;
  private abortController: AbortController | null = null;
  private segmentCheckInterval: number | null = null;

  private onErrorCallback?: (err: EngineError) => void;
  private onQualityLevelsCallback?: (levels: QualityLevel[], currentId: number | string) => void;
  private onAudioTracksCallback?: (tracks: AudioTrackInfo[], currentId: number | string) => void;

  public get isSupported(): boolean {
    return typeof window !== 'undefined' && typeof window.MediaSource !== 'undefined';
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
      throw new Error('[DashPipeline] Video element not attached');
    }

    if (!this.isSupported) {
      throw new Error('[DashPipeline] MediaSource is not supported in this browser');
    }

    try {
      this.abortController = new AbortController();
      // 1. Fetch & Parse MPD Manifest
      const manifestXml = await this.fetchManifest(source.url, this.abortController.signal);
      this.parseMpd(manifestXml, source.url);

      if (this.videoAdaptationSets.length === 0 && this.audioAdaptationSets.length === 0) {
        throw new Error('No valid video or audio streams found in MPD manifest');
      }

      // 2. Setup MediaSource
      this.mediaSource = new MediaSource();
      this.objectUrl = URL.createObjectURL(this.mediaSource);
      this.videoElement.src = this.objectUrl;

      await new Promise<void>((resolve, reject) => {
        if (!this.mediaSource) return reject(new Error('MediaSource is null'));
        
        const onSourceOpen = async () => {
          this.mediaSource?.removeEventListener('sourceopen', onSourceOpen);
          try {
            await this.setupSourceBuffers();
            resolve();
          } catch (e) {
            reject(e);
          }
        };

        this.mediaSource.addEventListener('sourceopen', onSourceOpen);
      });

      // 3. Start segment scheduler
      this.startSegmentScheduler();
      this.emitQualityLevels();
      this.emitAudioTracks();

      if (source.initialTime && source.initialTime > 0) {
        this.seek(source.initialTime);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.reportFatalError('DASH_LOAD_ERROR', errorMsg, err);
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
    
    // Reset segment pointers to match new seek position
    if (this.activeVideoRep && this.activeVideoRep.duration > 0) {
      const segDurationSec = this.activeVideoRep.duration / (this.activeVideoRep.timescale || 1);
      this.lastFetchedVideoSegment = Math.max(0, Math.floor(time / segDurationSec) - 1);
    }
    if (this.activeAudioRep && this.activeAudioRep.duration > 0) {
      const segDurationSec = this.activeAudioRep.duration / (this.activeAudioRep.timescale || 1);
      this.lastFetchedAudioSegment = Math.max(0, Math.floor(time / segDurationSec) - 1);
    }

    // Trigger immediate segment fetch for target time
    this.checkAndFetchSegments();
  }

  public setQuality(qualityId: number | string): void {
    const videoSet = this.videoAdaptationSets[0];
    if (!videoSet) return;

    let targetRep: DashRepresentation | undefined;
    if (qualityId === 'auto' || qualityId === -1) {
      // Pick highest representation by default for auto or first
      targetRep = videoSet.representations[0];
    } else {
      targetRep = videoSet.representations.find((r) => r.id === String(qualityId));
    }

    if (targetRep && targetRep !== this.activeVideoRep) {
      this.activeVideoRep = targetRep;
      this.initVideoRepresentation(targetRep);
      this.emitQualityLevels();
    }
  }

  public getQualityLevels(): QualityLevel[] {
    const videoSet = this.videoAdaptationSets[0];
    if (!videoSet) return [];
    return videoSet.representations.map((rep) => ({
      id: rep.id,
      name: rep.height ? `${rep.height}p` : `${Math.round(rep.bandwidth / 1000)}k`,
      bitrate: rep.bandwidth,
      width: rep.width,
      height: rep.height,
      codec: rep.codecs,
      fps: rep.frameRate,
    }));
  }

  public getCurrentQuality(): QualityLevel | null {
    if (!this.activeVideoRep) return null;
    const rep = this.activeVideoRep;
    return {
      id: rep.id,
      name: rep.height ? `${rep.height}p` : `${Math.round(rep.bandwidth / 1000)}k`,
      bitrate: rep.bandwidth,
      width: rep.width,
      height: rep.height,
      codec: rep.codecs,
      fps: rep.frameRate,
    };
  }

  public setAudioTrack(trackId: number | string): void {
    const trackIdx = typeof trackId === 'string' ? parseInt(trackId, 10) : trackId;
    const audioSet = this.audioAdaptationSets[trackIdx];
    if (audioSet && audioSet.representations.length > 0) {
      this.activeAudioRep = audioSet.representations[0];
      this.initAudioRepresentation(this.activeAudioRep);
      this.emitAudioTracks();
    }
  }

  public getAudioTracks(): AudioTrackInfo[] {
    return this.audioAdaptationSets.map((set, idx) => ({
      id: idx,
      name: set.lang ? `Audio (${set.lang.toUpperCase()})` : `Audio Track ${idx + 1}`,
      lang: set.lang || 'und',
      codec: set.codecs,
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
    this.cleanup();
    this.videoElement = null;
    this.currentSource = null;
  }

  private cleanup(): void {
    if (this.segmentCheckInterval !== null) {
      clearInterval(this.segmentCheckInterval);
      this.segmentCheckInterval = null;
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
    this.videoAppendQueue = [];
    this.audioAppendQueue = [];
    this.videoAdaptationSets = [];
    this.audioAdaptationSets = [];
    this.activeVideoRep = null;
    this.activeAudioRep = null;
    this.isSegmentFetching = false;
  }

  private async fetchManifest(url: string, signal?: AbortSignal): Promise<string> {
    const res = await fetch(url, {
      signal,
      headers: this.config.headers || {},
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch MPD manifest: HTTP ${res.status}`);
    }
    return res.text();
  }

  private parseMpd(xmlText: string, baseUrl: string): void {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
    
    // Check XML parser errors
    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) {
      throw new Error(`MPD XML Parse Error: ${parseError.textContent}`);
    }

    const mpdBase = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);

    const adaptationSets = Array.from(xmlDoc.querySelectorAll('AdaptationSet'));
    this.videoAdaptationSets = [];
    this.audioAdaptationSets = [];

    for (const setEl of adaptationSets) {
      const mimeType = setEl.getAttribute('mimeType') || '';
      const contentType = (setEl.getAttribute('contentType') || (mimeType.includes('video') ? 'video' : 'audio')) as 'video' | 'audio';
      const lang = setEl.getAttribute('lang') || undefined;
      const setCodecs = setEl.getAttribute('codecs') || undefined;

      const templateEl = setEl.querySelector('SegmentTemplate');
      const setTimescale = parseInt(templateEl?.getAttribute('timescale') || '1', 10);
      const setDuration = parseInt(templateEl?.getAttribute('duration') || '0', 10);
      const setStartNumber = parseInt(templateEl?.getAttribute('startNumber') || '1', 10);
      const setInitTemplate = templateEl?.getAttribute('initialization') || undefined;
      const setMediaTemplate = templateEl?.getAttribute('media') || undefined;

      const repEls = Array.from(setEl.querySelectorAll('Representation'));
      const reps: DashRepresentation[] = [];

      for (const repEl of repEls) {
        const id = repEl.getAttribute('id') || `rep-${Math.random()}`;
        const bandwidth = parseInt(repEl.getAttribute('bandwidth') || '0', 10);
        const width = parseInt(repEl.getAttribute('width') || '0', 10) || undefined;
        const height = parseInt(repEl.getAttribute('height') || '0', 10) || undefined;
        const codecs = repEl.getAttribute('codecs') || setCodecs;
        const repMimeType = repEl.getAttribute('mimeType') || mimeType;
        const frameRate = parseFloat(repEl.getAttribute('frameRate') || '0') || undefined;

        const repTemplate = repEl.querySelector('SegmentTemplate');
        const timescale = parseInt(repTemplate?.getAttribute('timescale') || String(setTimescale), 10);
        const duration = parseInt(repTemplate?.getAttribute('duration') || String(setDuration), 10);
        const startNumber = parseInt(repTemplate?.getAttribute('startNumber') || String(setStartNumber), 10);
        const initTemplate = repTemplate?.getAttribute('initialization') || setInitTemplate;
        const mediaTemplate = repTemplate?.getAttribute('media') || setMediaTemplate;

        reps.push({
          id,
          bandwidth,
          width,
          height,
          codecs,
          mimeType: repMimeType,
          frameRate,
          initializationTemplate: initTemplate,
          mediaTemplate,
          timescale,
          duration,
          startNumber,
          baseURL: mpdBase,
        });
      }

      // Sort video reps by bitrate descending
      if (contentType === 'video') {
        reps.sort((a, b) => b.bandwidth - a.bandwidth);
        this.videoAdaptationSets.push({
          id: setEl.getAttribute('id') || `video-${this.videoAdaptationSets.length}`,
          contentType: 'video',
          mimeType: mimeType || 'video/mp4',
          codecs: setCodecs,
          representations: reps,
          lang,
        });
      } else {
        this.audioAdaptationSets.push({
          id: setEl.getAttribute('id') || `audio-${this.audioAdaptationSets.length}`,
          contentType: 'audio',
          mimeType: mimeType || 'audio/mp4',
          codecs: setCodecs,
          representations: reps,
          lang,
        });
      }
    }

    if (this.videoAdaptationSets.length > 0 && this.videoAdaptationSets[0].representations.length > 0) {
      this.activeVideoRep = this.videoAdaptationSets[0].representations[0];
    }
    if (this.audioAdaptationSets.length > 0 && this.audioAdaptationSets[0].representations.length > 0) {
      this.activeAudioRep = this.audioAdaptationSets[0].representations[0];
    }
  }

  private async setupSourceBuffers(): Promise<void> {
    if (!this.mediaSource) return;

    if (this.activeVideoRep) {
      const mime = `${this.activeVideoRep.mimeType}${this.activeVideoRep.codecs ? `; codecs="${this.activeVideoRep.codecs}"` : ''}`;
      if (MediaSource.isTypeSupported(mime)) {
        this.videoSourceBuffer = this.mediaSource.addSourceBuffer(mime);
        this.videoSourceBuffer.addEventListener('updateend', () => this.processVideoAppendQueue());
        await this.initVideoRepresentation(this.activeVideoRep);
      }
    }

    if (this.activeAudioRep) {
      const mime = `${this.activeAudioRep.mimeType}${this.activeAudioRep.codecs ? `; codecs="${this.activeAudioRep.codecs}"` : ''}`;
      if (MediaSource.isTypeSupported(mime)) {
        this.audioSourceBuffer = this.mediaSource.addSourceBuffer(mime);
        this.audioSourceBuffer.addEventListener('updateend', () => this.processAudioAppendQueue());
        await this.initAudioRepresentation(this.activeAudioRep);
      }
    }
  }

  private async initVideoRepresentation(rep: DashRepresentation): Promise<void> {
    if (!rep.initializationTemplate || !this.videoSourceBuffer) return;
    const initUrl = this.resolveTemplateUrl(rep.initializationTemplate, rep.id, 0, rep.baseURL);
    try {
      const chunk = await this.fetchSegmentChunk(initUrl);
      this.queueVideoAppend(chunk);
    } catch (e) {
      console.warn('[DashPipeline] Failed to load video init segment:', e);
    }
  }

  private async initAudioRepresentation(rep: DashRepresentation): Promise<void> {
    if (!rep.initializationTemplate || !this.audioSourceBuffer) return;
    const initUrl = this.resolveTemplateUrl(rep.initializationTemplate, rep.id, 0, rep.baseURL);
    try {
      const chunk = await this.fetchSegmentChunk(initUrl);
      this.queueAudioAppend(chunk);
    } catch (e) {
      console.warn('[DashPipeline] Failed to load audio init segment:', e);
    }
  }

  private resolveTemplateUrl(template: string, repId: string, segmentNum: number, baseUrl: string): string {
    let resolved = template
      .replace('$RepresentationID$', repId)
      .replace('$Number$', String(segmentNum))
      .replace('$Number%05d$', String(segmentNum).padStart(5, '0'))
      .replace('$Number%06d$', String(segmentNum).padStart(6, '0'));

    if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
      return resolved;
    }
    return `${baseUrl}${resolved}`;
  }

  private async fetchSegmentChunk(url: string): Promise<Uint8Array> {
    const res = await fetch(url, {
      signal: this.abortController?.signal,
      headers: this.config.headers || {},
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch segment: HTTP ${res.status}`);
    }
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  }

  private queueVideoAppend(data: Uint8Array): void {
    this.videoAppendQueue.push(data);
    this.processVideoAppendQueue();
  }

  private queueAudioAppend(data: Uint8Array): void {
    this.audioAppendQueue.push(data);
    this.processAudioAppendQueue();
  }

  private processVideoAppendQueue(): void {
    if (!this.videoSourceBuffer || this.videoSourceBuffer.updating || this.videoAppendQueue.length === 0) {
      return;
    }
    const chunk = this.videoAppendQueue.shift();
    if (chunk) {
      try {
        this.videoSourceBuffer.appendBuffer(chunk.buffer as ArrayBuffer);
      } catch (err) {
        console.error('[DashPipeline] Video append error:', err);
      }
    }
  }

  private processAudioAppendQueue(): void {
    if (!this.audioSourceBuffer || this.audioSourceBuffer.updating || this.audioAppendQueue.length === 0) {
      return;
    }
    const chunk = this.audioAppendQueue.shift();
    if (chunk) {
      try {
        this.audioSourceBuffer.appendBuffer(chunk.buffer as ArrayBuffer);
      } catch (err) {
        console.error('[DashPipeline] Audio append error:', err);
      }
    }
  }

  private startSegmentScheduler(): void {
    if (this.segmentCheckInterval !== null) {
      clearInterval(this.segmentCheckInterval);
    }
    this.segmentCheckInterval = window.setInterval(() => {
      this.checkAndFetchSegments();
    }, 1000);
    this.checkAndFetchSegments();
  }

  private async checkAndFetchSegments(): Promise<void> {
    if (this.isSegmentFetching || !this.videoElement) return;

    const bufferHealth = this.getBufferHealth();
    const maxBuffer = this.config.maxBufferLength || 30;

    // Buffer is healthy, no need to fetch more segments
    if (bufferHealth >= maxBuffer) return;

    this.isSegmentFetching = true;
    try {
      const curTime = this.videoElement.currentTime;

      // Video segment fetch
      if (this.activeVideoRep && this.activeVideoRep.mediaTemplate && this.activeVideoRep.duration > 0) {
        const segDurationSec = this.activeVideoRep.duration / (this.activeVideoRep.timescale || 1);
        const currentSegmentIndex = Math.floor(curTime / segDurationSec) + this.activeVideoRep.startNumber;
        const nextSegment = Math.max(currentSegmentIndex, this.lastFetchedVideoSegment + 1);

        if (nextSegment > this.lastFetchedVideoSegment) {
          const segUrl = this.resolveTemplateUrl(
            this.activeVideoRep.mediaTemplate,
            this.activeVideoRep.id,
            nextSegment,
            this.activeVideoRep.baseURL
          );
          const chunk = await this.fetchSegmentChunk(segUrl);
          this.queueVideoAppend(chunk);
          this.lastFetchedVideoSegment = nextSegment;
        }
      }

      // Audio segment fetch
      if (this.activeAudioRep && this.activeAudioRep.mediaTemplate && this.activeAudioRep.duration > 0) {
        const segDurationSec = this.activeAudioRep.duration / (this.activeAudioRep.timescale || 1);
        const currentSegmentIndex = Math.floor(curTime / segDurationSec) + this.activeAudioRep.startNumber;
        const nextSegment = Math.max(currentSegmentIndex, this.lastFetchedAudioSegment + 1);

        if (nextSegment > this.lastFetchedAudioSegment) {
          const segUrl = this.resolveTemplateUrl(
            this.activeAudioRep.mediaTemplate,
            this.activeAudioRep.id,
            nextSegment,
            this.activeAudioRep.baseURL
          );
          const chunk = await this.fetchSegmentChunk(segUrl);
          this.queueAudioAppend(chunk);
          this.lastFetchedAudioSegment = nextSegment;
        }
      }
    } catch (e) {
      console.warn('[DashPipeline] Error fetching DASH segment:', e);
    } finally {
      this.isSegmentFetching = false;
    }
  }

  private reportFatalError(code: string, message: string, details?: unknown): void {
    if (this.onErrorCallback) {
      this.onErrorCallback({
        code,
        message,
        fatal: true,
        pipeline: 'dash',
        details,
      });
    }
  }

  private emitQualityLevels(): void {
    if (!this.onQualityLevelsCallback) return;
    const levels = this.getQualityLevels();
    const currentId = this.activeVideoRep?.id || 'auto';
    this.onQualityLevelsCallback(levels, currentId);
  }

  private emitAudioTracks(): void {
    if (!this.onAudioTracksCallback) return;
    const tracks = this.getAudioTracks();
    const currentId = 0;
    this.onAudioTracksCallback(tracks, currentId);
  }
}
