import { TRAKT_API_BASE, TRAKT_AUTH_BASE } from '../utils/constants';
import { fetchWithProxy } from '../utils/cors-proxy';

export interface TraktUser {
  username?: string;
  name?: string;
  avatar?: string;
  joined_at?: string;
}

export interface TraktWatchedPayload {
  movies?: { title?: string; year?: number; ids: { trakt?: number; imdb?: string }; watched_at?: string }[];
  shows?: {
    title?: string;
    year?: number;
    ids: { trakt?: number; imdb?: string };
    seasons?: {
      number: number;
      episodes?: { number: number; watched_at?: string }[];
    }[];
  }[];
}

function traktHeaders(clientId: string, accessToken?: string): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'trakt-api-version': '2',
    'trakt-api-key': clientId,
  };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  return headers;
}

export function getTraktAuthUrl(clientId: string, redirectUri: string): string {
  return `${TRAKT_AUTH_BASE}/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;
}

export async function exchangeTraktCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string
): Promise<string> {
  const res = await fetchWithProxy(`${TRAKT_API_BASE}/oauth/token`, {
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

export async function getTraktUser(clientId: string, accessToken: string): Promise<TraktUser> {
  const res = await fetchWithProxy(`${TRAKT_API_BASE}/users/settings`, {
    headers: traktHeaders(clientId, accessToken),
  });
  const data = await res.json();
  return data.user || data;
}

export async function markTraktWatched(
  clientId: string,
  accessToken: string,
  items: TraktWatchedPayload
): Promise<void> {
  await fetchWithProxy(`${TRAKT_API_BASE}/sync/history`, {
    method: 'POST',
    headers: traktHeaders(clientId, accessToken),
    body: JSON.stringify(items),
  });
}
