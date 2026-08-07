const NUVIO_SUPABASE_URL = 'https://api.nuvio.tv';
const NUVIO_SUPABASE_ANON_KEY = 'sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN';

export interface NuvioLoginResult {
  accessToken: string;
  refreshToken: string;
  email?: string;
  userId: string;
}

export async function login(email: string, password: string): Promise<NuvioLoginResult> {
  const res = await fetch(`${NUVIO_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'apikey': NUVIO_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error_description || errorData.message || errorData.error || 'Nuvio login failed');
  }

  const data = await res.json();
  if (!data.access_token) {
    throw new Error('No access token returned from Nuvio');
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || '',
    email: data.user?.email || email,
    userId: data.user?.id || '',
  };
}

export async function getAddonCollection(accessToken: string, userId: string, profileId: number = 1): Promise<string[]> {
  const res = await fetch(
    `${NUVIO_SUPABASE_URL}/rest/v1/addons?user_id=eq.${encodeURIComponent(userId)}&profile_id=eq.${profileId}`,
    {
      method: 'GET',
      headers: {
        'apikey': NUVIO_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to fetch Nuvio addons');
  }

  const data = await res.json();
  if (!Array.isArray(data)) {
    return [];
  }

  // Nuvio addons can be Stremio addon manifest URLs
  return data
    .filter((a: any) => a.enabled)
    .map((a: any) => a.url)
    .filter(Boolean);
}

export async function validateToken(accessToken: string): Promise<boolean> {
  const res = await fetch(`${NUVIO_SUPABASE_URL}/auth/v1/user`, {
    method: 'GET',
    headers: {
      'apikey': NUVIO_SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${accessToken}`,
    },
  });
  return res.ok;
}

export interface NuvioAddonPushItem {
  url: string;
  name?: string;
  enabled: boolean;
  sort_order: number;
}

export async function pushAddonsToNuvio(
  accessToken: string,
  addons: NuvioAddonPushItem[],
  profileId: number = 1
): Promise<void> {
  const res = await fetch(`${NUVIO_SUPABASE_URL}/rest/v1/rpc/sync_push_addons`, {
    method: 'POST',
    headers: {
      'apikey': NUVIO_SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_profile_id: profileId,
      p_addons: addons.map((a, i) => ({
        url: a.url,
        name: a.name || '',
        enabled: a.enabled,
        sort_order: i,
      })),
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    console.warn('Failed to push addon reorder to Nuvio:', errorData);
  }
}

export async function pullCollectionsFromNuvio(
  accessToken: string,
  profileId: number = 1
): Promise<any[]> {
  const res = await fetch(`${NUVIO_SUPABASE_URL}/rest/v1/rpc/sync_pull_collections`, {
    method: 'POST',
    headers: {
      'apikey': NUVIO_SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_profile_id: profileId,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    console.warn('Failed to pull collections from Nuvio:', errorData);
    return [];
  }

  const data = await res.json();
  if (Array.isArray(data) && data.length > 0) {
    const blob = data[0];
    if (blob && blob.collections_json) {
      return Array.isArray(blob.collections_json) ? blob.collections_json : [];
    }
  }
  return [];
}

export async function pushCollectionsToNuvio(
  accessToken: string,
  collections: any[],
  profileId: number = 1
): Promise<void> {
  const res = await fetch(`${NUVIO_SUPABASE_URL}/rest/v1/rpc/sync_push_collections`, {
    method: 'POST',
    headers: {
      'apikey': NUVIO_SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_profile_id: profileId,
      p_collections_json: collections,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    console.warn('Failed to push collections to Nuvio:', errorData);
  }
}
