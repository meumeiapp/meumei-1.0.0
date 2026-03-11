import { test } from '@playwright/test';
import fs from 'node:fs';

const url = 'http://127.0.0.1:4173/app?debugLayout=1';
const resolutions = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '2560x1080', width: 2560, height: 1080 }
];

test('collect layout metrics', async ({ browser }) => {
  const results = [];
  for (const res of resolutions) {
    const context = await browser.newContext({
      viewport: { width: res.width, height: res.height }
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    const metrics = await page.evaluate(() => {
      const root = document.querySelector('.mm-app-root');
      const main = document.querySelector('.mm-content.mm-content--desktop');
      const header = document.querySelector('[data-mm-global-header="true"]');
      const dock = document.querySelector('[data-mm-desktop-dock-shell="true"]');
      const subheader = document.querySelector('.mm-subheader');
      const hud = Array.from(document.querySelectorAll('p,li'))
        .map((node) => node.textContent || '')
        .filter((text) => text.includes('Layout Debug HUD') || text.includes('viewport:') || text.includes('offenders:'))
        .slice(0, 12);
      const rootStyle = root ? getComputedStyle(root) : null;
      const bodyStyle = getComputedStyle(document.body);
      const mainStyle = main ? getComputedStyle(main) : null;
      const dockRect = dock?.getBoundingClientRect();
      const allNodes = Array.from(document.querySelectorAll('*'));
      const scrollables = allNodes
        .filter((node) => node instanceof HTMLElement)
        .map((node) => node)
        .filter((el) => {
          const style = getComputedStyle(el);
          const oy = style.overflowY;
          return (oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 2;
        })
        .slice(0, 20)
        .map((el) => {
          const id = el.id ? `#${el.id}` : '';
          const cls = (el.className && typeof el.className === 'string')
            ? '.' + el.className.split(/\s+/).filter(Boolean).slice(0, 3).join('.')
            : '';
          return `${el.tagName.toLowerCase()}${id}${cls}(${el.clientHeight}/${el.scrollHeight})`;
        });
      const desktopScrollContextOk = Boolean(main && mainStyle?.overflowY === 'auto' && bodyStyle.overflowY === 'hidden');
      const mainPaddingBottom = mainStyle ? parseFloat(mainStyle.paddingBottom || '0') : 0;
      const dockHeight = dockRect ? dockRect.height : 0;
      const contentRespectsDock = dockHeight > 0 ? mainPaddingBottom >= (dockHeight - 2) : false;
      return {
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        bodyOverflowY: bodyStyle.overflowY,
        rootOverflowY: rootStyle?.overflowY || null,
        headerHeight: header ? Math.round(header.getBoundingClientRect().height) : 0,
        dockHeight: dock ? Math.round(dock.getBoundingClientRect().height) : 0,
        subheaderHeight: subheader ? Math.round(subheader.getBoundingClientRect().height) : 0,
        mainClientHeight: main ? main.clientHeight : 0,
        mainScrollHeight: main ? main.scrollHeight : 0,
        mainOverflowY: mainStyle?.overflowY || null,
        mainPaddingBottom: Math.round(mainPaddingBottom),
        contentAvailVar: getComputedStyle(document.documentElement).getPropertyValue('--mm-content-available-height').trim(),
        desktopScrollContextOk,
        contentRespectsDock,
        scrollables,
        hud,
        hasShell: Boolean(root),
        hasDesktopContent: Boolean(main),
        path: window.location.pathname + window.location.search
      };
    });
    await page.screenshot({ path: `/tmp/meumei-layout-${res.name}.png`, fullPage: true });
    results.push({ resolution: res.name, ...metrics });
    await context.close();
    await page.close();
  }
  fs.writeFileSync('/tmp/meumei-layout-results.json', JSON.stringify(results, null, 2), 'utf8');
});
