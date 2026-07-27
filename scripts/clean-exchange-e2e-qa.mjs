import fs from "node:fs/promises";
import path from "node:path";
import WebSocket from "ws";

const baseUrl = process.env.QA_BASE_URL || "http://127.0.0.1:3090";
const debugUrl = process.env.QA_DEBUG_URL || "http://127.0.0.1:9229";
const outputDir = path.resolve("artifacts", "clean-e2e-qa");
const viewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];
const sections = ["home", "markets", "ai-trade", "futures", "wallet"];
const results = [];

await fs.mkdir(outputDir, { recursive: true });

function record(area, test, passed, details = "") {
  results.push({ area, test, passed, details });
}

async function newPage() {
  const target = await fetch(`${debugUrl}/json/new?${encodeURIComponent("about:blank")}`, { method: "PUT" }).then(response => response.json());
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  socket.on("message", raw => {
    const message = JSON.parse(String(raw));
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
      return;
    }
    for (const listener of listeners.get(message.method) || []) listener(message.params);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const callId = ++id;
    pending.set(callId, { resolve, reject });
    socket.send(JSON.stringify({ id: callId, method, params }));
  });
  const once = method => new Promise(resolve => {
    const handler = params => {
      listeners.set(method, (listeners.get(method) || []).filter(item => item !== handler));
      resolve(params);
    };
    listeners.set(method, [...(listeners.get(method) || []), handler]);
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  return {
    send,
    once,
    close: async () => {
      socket.close();
      await fetch(`${debugUrl}/json/close/${target.id}`).catch(() => {});
    },
  };
}

async function setViewport(page, viewport) {
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: viewport.width,
    screenHeight: viewport.height,
  });
  await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
}

async function navigate(page, pathname) {
  const loaded = page.once("Page.loadEventFired");
  await page.send("Page.navigate", { url: `${baseUrl}${pathname}` });
  await Promise.race([loaded, new Promise(resolve => setTimeout(resolve, 12000))]);
  await new Promise(resolve => setTimeout(resolve, 1200));
}

async function evaluate(page, expression) {
  const result = await page.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browser evaluation failed");
  return result.result.value;
}

async function screenshot(page, name) {
  const capture = await page.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  const target = path.join(outputDir, name);
  await fs.writeFile(target, Buffer.from(capture.data, "base64"));
  return target;
}

const page = await newPage();
try {
  for (const viewport of viewports) {
    await setViewport(page, viewport);
    for (const section of sections) {
      await navigate(page, `/clean-capture/${section}`);
      const geometry = await evaluate(page, `(() => {
        const nav = document.querySelector('nav[class*="bottomNav"]');
        const interactive = [...document.querySelectorAll('a,button')].filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
        });
        return {
          url: location.pathname,
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          nav: nav ? nav.getBoundingClientRect().toJSON() : null,
          clipped: interactive.filter(el => {
            const r = el.getBoundingClientRect();
            const intentionallyScrollable = [...el.parentElement?.closest('*')?.parentElement?.querySelectorAll(':scope > *') || []].length > 0
              && ['auto', 'scroll'].includes(getComputedStyle(el.parentElement).overflowX);
            return !intentionallyScrollable && (r.left < -1 || r.right > innerWidth + 1);
          }).map(el => el.getAttribute('aria-label') || el.textContent.trim().slice(0, 40)),
          dialogs: document.querySelectorAll('[role="dialog"]').length,
          apiCounts: performance.getEntriesByType('resource')
            .map(entry => new URL(entry.name).pathname)
            .filter(name => name.startsWith('/api/'))
            .reduce((all, name) => ({...all, [name]:(all[name] || 0) + 1}), {}),
        };
      })()`);
      record("Mobile", `${section} ${viewport.width}x${viewport.height} has no horizontal overflow`, geometry.scrollWidth <= geometry.width, `${geometry.scrollWidth}/${geometry.width}`);
      record("Mobile", `${section} ${viewport.width}x${viewport.height} bottom navigation visible`, Boolean(geometry.nav && geometry.nav.bottom <= viewport.height + 1 && geometry.nav.top >= 0), JSON.stringify(geometry.nav));
      record("Mobile", `${section} ${viewport.width}x${viewport.height} controls are not horizontally clipped`, geometry.clipped.length === 0, geometry.clipped.join(", "));
      record("Mobile", `${section} ${viewport.width}x${viewport.height} has no duplicate modal`, geometry.dialogs <= 1, String(geometry.dialogs));
      const duplicateRequests = Object.entries(geometry.apiCounts).filter(([name, count]) => count > 1 && !["/api/prices/stream"].includes(name));
      record("Network", `${section} ${viewport.width}x${viewport.height} has no duplicate initial API request`, duplicateRequests.length === 0, JSON.stringify(duplicateRequests));
      if (["home", "markets", "ai-trade", "wallet"].includes(section)) {
        await screenshot(page, `${section}-${viewport.width}x${viewport.height}.png`);
      }
    }
  }

  await setViewport(page, viewports[1]);
  await navigate(page, "/clean-capture/home");
  const balanceBefore = await evaluate(page, `document.querySelector('section[class*="balanceHero"] strong')?.textContent`);
  await evaluate(page, `document.querySelector('section[class*="balanceHero"] button')?.click()`);
  const balanceAfter = await evaluate(page, `document.querySelector('section[class*="balanceHero"] strong')?.textContent`);
  record("Dashboard", "Balance visibility toggle masks the balance", balanceBefore !== balanceAfter && /[•]/.test(balanceAfter || ""), `${balanceBefore} -> ${balanceAfter}`);

  const homeContracts = await evaluate(page, `Object.fromEntries([...document.querySelectorAll('a')].map(a => [a.textContent.trim().replace(/\\s+/g,' '), a.getAttribute('href')]))`);
  for (const [label, expected] of [
    ["Deposit", "/wallet/deposit"],
    ["Withdraw", "/wallet/withdraw"],
    ["Transfer", "/dashboard?view=wallet&action=transfer&workflow=current"],
    ["More", "/profile"],
    ["AI Copy Trading", "/clean-preview/ai-trade"],
  ]) {
    const match = Object.entries(homeContracts).find(([text]) => text.includes(label));
    record("Dashboard", `${label} action is wired`, Boolean(match && match[1] === expected), match ? match[1] : "missing");
  }

  await navigate(page, "/clean-capture/markets");
  const marketLoading = await evaluate(page, `document.querySelector('[aria-busy]')?.getAttribute('aria-busy')`);
  const pillRect = await evaluate(page, `(() => { const target=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Top Gainers'); const r=target?.getBoundingClientRect(); return r ? {x:r.x+r.width/2,y:r.y+r.height/2} : null; })()`);
  if (pillRect) {
    await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: pillRect.x, y: pillRect.y, button: "left", clickCount: 1 });
    await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: pillRect.x, y: pillRect.y, button: "left", clickCount: 1 });
  }
  await new Promise(resolve => setTimeout(resolve, 250));
  const pillResult = await evaluate(page, `[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Top Gainers')?.className || ''`);
  record("Markets", "Initial loading resolves", marketLoading === "false", String(marketLoading));
  record("Markets", "Top Gainers filter activates", /active/i.test(pillResult), pillResult);
  const marketHref = await evaluate(page, `document.querySelector('a[class*="marketRow"]')?.getAttribute('href') || null`);
  record("Markets", "Market rows deep-link to coin details when data exists", marketHref === null || /^\/markets\/[A-Z0-9]+$/.test(marketHref), String(marketHref));

  await navigate(page, "/clean-capture/ai-trade");
  const aiLinks = await evaluate(page, `[...document.querySelectorAll('div[class*="aiActions"] a')].map(a => a.getAttribute('href'))`);
  record("AI Trade", "All AI summary controls enter the production workflow", aiLinks.length === 4 && aiLinks.every(href => href === "/dashboard?view=aiTrade&workflow=current"), JSON.stringify(aiLinks));
  const activeTradeHref = await evaluate(page, `document.querySelector('article[class*="tradeCard"] a')?.getAttribute('href')`);
  record("AI Trade", "Trade details remain actionable in empty state", activeTradeHref === "/dashboard?view=aiTrade&workflow=current", String(activeTradeHref));

  await navigate(page, "/clean-capture/wallet");
  const walletLinks = await evaluate(page, `({
    actions:[...document.querySelectorAll('nav[class*="walletActions"] a')].map(a=>[a.textContent.trim(),a.getAttribute('href')]),
    wallets:[...document.querySelectorAll('div[class*="walletList"] a')].map(a=>[a.textContent.trim().replace(/\\s+/g,' '),a.getAttribute('href')])
  })`);
  record("Wallet", "Wallet quick actions are all wired", walletLinks.actions.length === 5 && walletLinks.actions.every(([, href]) => href && href !== "#"), JSON.stringify(walletLinks.actions));
  record("Wallet", "All wallet cards open a production detail workflow", walletLinks.wallets.length === 5 && walletLinks.wallets.every(([, href]) => href && href !== "#"), JSON.stringify(walletLinks.wallets));

  await page.send("Network.setBlockedURLs", { urls: ["*/api/assets", "*/api/dashboard", "*/api/coins", "*/api/copy-trade/status", "*/api/wallet/history", "*/api/ai-trading/overview*", "*/api/ai/subscription", "*/api/notifications"] });
  await navigate(page, "/clean-capture/home");
  const blockedState = await evaluate(page, `({busy:document.querySelector('[aria-busy]')?.getAttribute('aria-busy'),empty:document.body.innerText.includes('Live markets unavailable')})`);
  record("Error handling", "Failed APIs resolve loading state", blockedState.busy === "false", JSON.stringify(blockedState));
  record("Error handling", "Failed market data produces an empty state", blockedState.empty === true, JSON.stringify(blockedState));
  await page.send("Network.setBlockedURLs", { urls: [] });

  await evaluate(page, `localStorage.setItem('voltix-interface','corrupt'); document.cookie='voltix_interface=corrupt; Path=/'`);
  await navigate(page, "/profile/settings");
  const sanitized = await evaluate(page, `({stored:localStorage.getItem('voltix-interface'),cookie:document.cookie})`);
  record("Navigation", "Invalid interface preference is sanitized", sanitized.stored === "current" && /voltix_interface=current/.test(sanitized.cookie), JSON.stringify(sanitized));

  await navigate(page, "/dashboard?view=not-real");
  const unauthorized = await evaluate(page, `({path:location.pathname,search:location.search})`);
  record("Authentication", "Unauthorized dashboard access redirects away", unauthorized.path === "/", JSON.stringify(unauthorized));

  await navigate(page, "/auth?mode=login&returnTo=%2Fdashboard");
  const authForm = await evaluate(page, `({email:!!document.querySelector('input[autocomplete="email"],input[name="email"],input[placeholder*="email" i]'),password:!!document.querySelector('input[type="password"]'),button:[...document.querySelectorAll('button')].some(b=>/login/i.test(b.textContent))})`);
  record("Authentication", "Login form exposes required controls", authForm.email && authForm.password && authForm.button, JSON.stringify(authForm));
  await screenshot(page, "authentication-login-390x844.png");
} finally {
  await page.close();
}

const summary = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  totals: {
    passed: results.filter(result => result.passed).length,
    failed: results.filter(result => !result.passed).length,
    total: results.length,
  },
  results,
};
await fs.writeFile(path.join(outputDir, "results.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
process.exitCode = summary.totals.failed ? 1 : 0;
