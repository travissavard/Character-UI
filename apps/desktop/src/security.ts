import { extname, resolve, sep } from 'node:path';

export function isTrustedRendererUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'character-ui-app:' && url.hostname === 'app';
  } catch {
    return false;
  }
}

export function resolveWebAsset(root: string, requestUrl: string): string | null {
  const rawPathMatch = requestUrl.match(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*(\/[^?#]*)?/i);
  if (!rawPathMatch) return null;
  try {
    const decodedRawPath = decodeURIComponent(rawPathMatch[1] ?? '/');
    if (decodedRawPath.includes('\0') || decodedRawPath.split(/[\\/]+/).includes('..')) return null;
  } catch {
    return null;
  }
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'character-ui-app:' || url.hostname !== 'app') return null;
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  const relative = pathname.replace(/^\/+/, '') || 'index.html';
  const candidate = resolve(root, relative);
  const rootPrefix = root.endsWith(sep) ? root : `${root}${sep}`;
  return candidate.startsWith(rootPrefix) || candidate === root ? candidate : null;
}

export function isOpenableDocumentPath(path: string): boolean {
  return extname(path).toLowerCase() === '.charui';
}

export function parseProtocolActivation(value: string): 'open' | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'characterui:') return null;
    return url.hostname === 'open' || url.pathname === 'open' ? 'open' : null;
  } catch {
    return null;
  }
}
