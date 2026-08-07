import { fetchWithProxy } from '../utils/cors-proxy';

export interface AddonManifest {
  id: string;
  version: string;
  name: string;
  description: string;
  types: string[];
  resources: (string | { name: string; types: string[]; idPrefixes?: string[] })[];
  catalogs: CatalogDefinition[];
  idPrefixes?: string[];
  logo?: string;
  background?: string;
  behaviorHints?: Record<string, any>;
}

export interface CatalogDefinition {
  type: string;
  id: string;
  name?: string;
  extra?: { name: string; isRequired?: boolean; options?: string[] }[];
}

export interface MetaPreview {
  id: string;
  type: string;
  name: string;
  poster?: string;
  posterShape?: string;
  background?: string;
  logo?: string;
  description?: string;
  releaseInfo?: string;
  imdbRating?: string;
  year?: number;
  genres?: string[];
}

export interface Meta extends MetaPreview {
  cast?: string[];
  director?: string[];
  runtime?: string;
  trailers?: { source: string; type: string }[];
  links?: { name: string; category: string; url: string }[];
  videos?: Video[];
}

export interface Video {
  id: string;
  title: string;
  season?: number;
  episode?: number;
  released?: string;
  thumbnail?: string;
  overview?: string;
}

export interface Stream {
  url?: string;
  ytId?: string;
  infoHash?: string;
  fileIdx?: number;
  externalUrl?: string;
  name?: string;
  title?: string;
  behaviorHints?: {
    bingeGroup?: string;
    countryWhitelist?: string[];
    notWebReady?: boolean;
    proxyHeaders?: { request?: Record<string, string> };
    filename?: string;
  };
}

export interface Subtitle {
  id: string;
  url: string;
  lang: string;
}

export class AddonClient {
  private baseUrl: string;
  public manifest: AddonManifest | null = null;

  constructor(manifestUrl: string) {
    this.baseUrl = manifestUrl.replace(/\/manifest\.json$/, '');
  }

  async loadManifest(): Promise<AddonManifest> {
    const res = await fetchWithProxy(`${this.baseUrl}/manifest.json`);
    this.manifest = await res.json();
    return this.manifest!;
  }

  async getCatalog(type: string, id: string, extra?: Record<string, string>): Promise<{ metas: MetaPreview[] }> {
    let url = `${this.baseUrl}/catalog/${type}/${id}`
    if (extra && Object.keys(extra).length > 0) {
      // Stremio protocol: extras go in path as key=value pairs separated by & (not a query string)
      const extraStr = Object.entries(extra)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&')
      url += `/${extraStr}.json`
    } else {
      url += '.json'
    }
    const res = await fetchWithProxy(url)
    if (!res.ok) throw new Error(`Catalog fetch failed: ${res.status}`)
    return res.json()
  }

  async getMeta(type: string, id: string): Promise<{ meta: Meta }> {
    const res = await fetchWithProxy(`${this.baseUrl}/meta/${type}/${id}.json`);
    return res.json();
  }

  async getStreams(type: string, videoId: string): Promise<{ streams: Stream[] }> {
    const res = await fetchWithProxy(`${this.baseUrl}/stream/${type}/${videoId}.json`);
    return res.json();
  }

  async getSubtitles(type: string, id: string): Promise<{ subtitles: Subtitle[] }> {
    const res = await fetchWithProxy(`${this.baseUrl}/subtitles/${type}/${id}.json`);
    return res.json();
  }

  supportsResource(resource: string): boolean {
    if (!this.manifest) return false;
    return this.manifest.resources.some(r =>
      typeof r === 'string' ? r === resource : r.name === resource
    );
  }

  supportsCatalog(type: string): boolean {
    if (!this.manifest) return false;
    return this.manifest.catalogs.some(c => c.type === type);
  }

  supportsSearch(): boolean {
    if (!this.manifest) return false;
    return this.manifest.catalogs.some(c =>
      c.extra?.some(e => e.name === 'search')
    );
  }
}
