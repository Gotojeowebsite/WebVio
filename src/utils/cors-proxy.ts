let corsProxyUrl = '';

export function setCorsProxy(url: string) {
  corsProxyUrl = url;
}

export function getCorsProxy(): string {
  return corsProxyUrl;
}

export function proxyUrl(url: string): string {
  if (!corsProxyUrl) return url;
  return `${corsProxyUrl}${encodeURIComponent(url)}`;
}

export async function fetchWithProxy(url: string, options?: RequestInit): Promise<Response> {
  try {
    const response = await fetch(proxyUrl(url), options);
    return response;
  } catch (err) {
    // If proxy fails, try direct
    if (corsProxyUrl) {
      return fetch(url, options);
    }
    throw err;
  }
}
