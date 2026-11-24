// Launches headless Chrome against a local server that serves both the
// pair2peer repo (at /repo/) and this lab folder (at /lab/), then runs a
// named test function defined in lab-tests.js inside the page.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const LAB = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(LAB, '../..');
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let file;
  if (url.pathname.startsWith('/repo/')) file = path.join(REPO, url.pathname.slice(6));
  else if (url.pathname.startsWith('/lab/')) file = path.join(LAB, url.pathname.slice(5));
  else if (url.pathname === '/') { res.end('<!doctype html><title>lab</title>'); return; }
  if (!file || !fs.existsSync(file)) { res.statusCode = 404; res.end(); return; }
  res.setHeader('Content-Type', file.endsWith('.js') || file.endsWith('.mjs') ? 'text/javascript' : 'text/html');
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

export async function runInChrome(testName, { hideMdns = false, args = {} } = {}) {
  const flags = ['--headless=new', '--no-sandbox', '--use-fake-ui-for-media-stream'];
  if (!hideMdns) flags.push('--disable-features=WebRtcHideLocalIpsWithMdns');
  const browser = await puppeteer.launch({ executablePath: CHROME, args: flags });
  try {
    const page = await browser.newPage();
    const logs = [];
    page.on('console', m => { if (m.type() === 'error') logs.push(m.text()); });
    await page.goto(`http://localhost:${port}/`);
    const result = await page.evaluate(async (name, a) => {
      const mod = await import('/lab/lab-tests.js');
      return await mod[name](a);
    }, testName, args);
    return { result, errors: logs.slice(0, 5) };
  } finally {
    await browser.close();
  }
}

export function close() { server.close(); }

if (process.argv[2]) {
  const hide = process.argv.includes('--mdns');
  const out = await runInChrome(process.argv[2], { hideMdns: hide });
  console.log(JSON.stringify(out, null, 2));
  close();
}
