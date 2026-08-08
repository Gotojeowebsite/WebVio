import { SIMKL_API_BASE, SIMKL_AUTH_BASE } from '../utils/constants';
import { fetchWithProxy } from '../utils/cors-proxy';

export interface SimklUser {
  username?: string;
  name?: string;
  avatar?: string;
  joined_at?: string;
}

export interface WatchedPayload {
  movies?: { ids: { imdb?: string; simkl?: number; tmdb?: number }; watched_at?: string }[];
  shows?: {
    ids: { imdb?: string; simkl?: number; tmdb?: number };
    seasons?: {
      number: number;
      episodes?: { number: number; watched_at?: string }[];
    }[];
  }[];
  anime?: {
    ids: { imdb?: string; simkl?: number; kitsu?: number };
    episodes?: { number: number; watched_at?: string }[];
  }[];
}

function simklHeaders(clientId: string, accessToken?: string): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'simkl-api-key': clientId,
  };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  return headers;
}

export function getAuthUrl(clientId: string, redirectUri: string): string {
  return `${SIMKL_AUTH_BASE}/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;
}

export async function exchangeCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string
): Promise<string> {
  const res = await fetchWithProxy(`${SIMKL_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });
  const data = await res.json();
  return data.access_token;
}

export async function getUser(clientId: string, accessToken: string): Promise<SimklUser> {
  const res = await fetchWithProxy(`${SIMKL_API_BASE}/users/settings`, {
    headers: simklHeaders(clientId, accessToken),
  });
  const data = await res.json();
  return data.user || data;
}

export async function markWatched(
  clientId: string,
  accessToken: string,
  items: WatchedPayload
): Promise<void> {
  await fetchWithProxy(`${SIMKL_API_BASE}/sync/history`, {
    method: 'POST',
    headers: simklHeaders(clientId, accessToken),
    body: JSON.stringify(items),
  });
}

export async function getAllItems(
  clientId: string,
  accessToken: string,
  type: string,
  dateFrom?: string
): Promise<any[]> {
  let url = `${SIMKL_API_BASE}/sync/all-items/${type}`;
  if (dateFrom) url += `?date_from=${dateFrom}`;
  const res = await fetchWithProxy(url, {
    headers: simklHeaders(clientId, accessToken),
  });
  const data = await res.json();
  return Array.isArray(data) ? data : data[type] || [];
}
