import { isGisCallbackPath } from './gis-oauth';

export function pathFromRouterUrl(url: string): string {
  return url.split('?')[0]?.split('#')[0] ?? '';
}

export function isBareChromePath(url: string): boolean {
  if (isGisCallbackPath(url)) {
    return true;
  }
  const path = pathFromRouterUrl(url);
  return path === '/CV' || path === '/CV/';
}
