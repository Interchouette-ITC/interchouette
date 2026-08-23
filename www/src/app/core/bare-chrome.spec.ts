import { isBareChromePath, pathFromRouterUrl } from './bare-chrome';

describe('bare-chrome', () => {
  it('strips query and hash from router urls', () => {
    expect(pathFromRouterUrl('/CV?lang=nl#summary')).toBe('/CV');
  });

  it('uses bare chrome on GIS callback and CV routes', () => {
    expect(isBareChromePath('/gis-signin#id_token=x')).toBe(true);
    expect(isBareChromePath('/CV')).toBe(true);
    expect(isBareChromePath('/CV/')).toBe(true);
    expect(isBareChromePath('/CV?lang=nl')).toBe(true);
    expect(isBareChromePath('/')).toBe(false);
    expect(isBareChromePath('/about')).toBe(false);
  });
});
