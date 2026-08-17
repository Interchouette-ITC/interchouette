/**
 * Wake Render Free chat / MCP as soon as the page is parsed.
 * Same origin as the site, so hostname tells local vs production.
 */
const host = self.location.hostname;
const local = host === 'localhost' || host === '127.0.0.1';
const urls = local
  ? [`http://${host}:8080/health`]
  : ['https://chat.interchouette.net/health', 'https://mcp.interchouette.net/health'];

for (const url of urls) {
  void pingUntilWarm(url);
}

async function pingUntilWarm(url) {
  const gaps = [0, 1500, 3000, 5000, 8000, 13000];
  for (const gap of gaps) {
    if (gap > 0) {
      await new Promise((resolve) => {
        setTimeout(resolve, gap);
      });
    }
    try {
      const res = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit',
        mode: 'cors',
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) {
        return;
      }
    } catch {
      /* still sleeping or unreachable */
    }
  }
}
