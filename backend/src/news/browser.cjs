const puppeteer = require(
  require.resolve('puppeteer-core', {
    paths: [process.env.NEWS_BROWSER_MODULE_DIR, process.cwd(), `${process.cwd()}/backend`].filter(Boolean),
  }),
);

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const { url, socksAddr, cookie } = JSON.parse(input);
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    headless: false,
    timeout: 30000,
    args: [
      `--proxy-server=socks5://${socksAddr}`,
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
      '--disable-background-networking',
    ],
  });
  try {
    const page = await browser.newPage();
    if (cookie) {
      await browser.setCookie({ name: 'li_at', value: cookie, domain: '.linkedin.com', path: '/', secure: true });
    }
    let status;
    page.on('response', (response) => {
      if (response.request().isNavigationRequest() && response.frame() === page.mainFrame()) {
        status = response.status();
      }
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    try {
      await page.waitForFunction(
        () =>
          document.querySelector('[data-urn^="urn:li:activity:"], .feed-shared-update-v2, article[data-activity-urn]') ||
          /urn:li:activity:\d+/.test(document.documentElement.innerHTML),
        { timeout: 20000 },
      );
    } catch (error) {
      if (!(error instanceof puppeteer.TimeoutError)) throw error;
      throw new Error(`LinkedIn page contains no posts (HTTP ${status ?? 'unknown'}, title: ${await page.title()})`);
    }
    process.stdout.write(await page.content());
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`LinkedIn browser fetch failed: ${error.message}`);
  process.exitCode = 1;
});
