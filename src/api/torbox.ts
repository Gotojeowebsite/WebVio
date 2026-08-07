import { TORBOX_API_BASE } from '../utils/constants';
import { fetchWithProxy } from '../utils/cors-proxy';

export interface TorBoxUser {
  id?: number;
  email?: string;
  plan?: string;
  premium?: boolean;
  base_email?: string;
  total_downloaded?: number;
}

export interface TorBoxTorrent {
  id: number;
  hash: string;
  name: string;
  size: number;
  download_state: string;
  download_finished: boolean;
  files: TorBoxFile[];
  progress: number;
}

export interface TorBoxFile {
  id: number;
  name: string;
  size: number;
  short_name?: string;
  mimetype?: string;
}

export async function validateApiKey(apiKey: string): Promise<TorBoxUser> {
  const res = await fetchWithProxy(`${TORBOX_API_BASE}/v1/api/user/me?settings=false`, {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.detail || 'Invalid API key');
  return data.data;
}

export async function checkCached(apiKey: string, hashes: string[]): Promise<Record<string, any>> {
  const hashParam = hashes.join(',');
  const res = await fetchWithProxy(`${TORBOX_API_BASE}/v1/api/torrents/checkcached?hash=${hashParam}&format=object`, {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.detail || 'Cache check failed');
  return data.data || {};
}

export async function createTorrent(apiKey: string, magnet: string): Promise<{ torrent_id: number; hash: string }> {
  const formData = new FormData();
  formData.append('magnet', magnet);
  formData.append('seed', '1');
  formData.append('allow_zip', 'false');

  const res = await fetchWithProxy(`${TORBOX_API_BASE}/v1/api/torrents/createtorrent`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: formData
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.detail || 'Failed to create torrent');
  return data.data;
}

export async function getTorrentList(apiKey: string, id?: number): Promise<TorBoxTorrent[]> {
  const url = id
    ? `${TORBOX_API_BASE}/v1/api/torrents/mylist?id=${id}`
    : `${TORBOX_API_BASE}/v1/api/torrents/mylist`;
  const res = await fetchWithProxy(url, {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.detail || 'Failed to get list');
  return Array.isArray(data.data) ? data.data : [data.data];
}

export async function requestDownloadLink(
  apiKey: string,
  torrentId: number,
  fileId: number = 0
): Promise<string> {
  const res = await fetchWithProxy(
    `${TORBOX_API_BASE}/v1/api/torrents/requestdl?token=${apiKey}&torrent_id=${torrentId}&file_id=${fileId}`, {}
  );
  const data = await res.json();
  if (!data.success) throw new Error(data.detail || 'Failed to get download link');
  return data.data;
}
