import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createServer } from "vite-plus";

const gui = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(new URL("../app/package.json", import.meta.url));
const { chromium } = require("playwright-core");
const source = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { observeResize } from '/@fs/${gui}packages/ui/src/lib/observe-resize.ts';
window.runResizeProbe = (mode) => new Promise(resolve => {
  const rootNode = document.createElement('div');
  const target = document.createElement('div');
  target.style.width = '100px';
  document.body.append(rootNode, target);
  const root = createRoot(rootNode);
  const samples = [];
  let deliveries = 0;
  function Probe() {
    const [width, setWidth] = React.useState(0);
    React.useLayoutEffect(() => {
      const onResize = entries => {
        deliveries++;
        const expected = entries[0].contentRect.width;
        setWidth(expected);
        queueMicrotask(() => samples.push({phase:'beforePaint', expected, actual:Number(rootNode.textContent)}));
        requestAnimationFrame(() => {
          samples.push({phase:'nextFrame', expected, actual:Number(rootNode.textContent)});
          if (expected === 100) { target.style.width = '200px'; return; }
          flushSync(() => root.unmount());
          target.style.width = '300px';
          requestAnimationFrame(() => requestAnimationFrame(() => {
            resolve({mode, samples, deliveries});
            rootNode.remove(); target.remove();
          }));
        });
      };
      if (mode === 'shared') return observeResize(target, onResize);
      const observer = new ResizeObserver(onResize);
      observer.observe(target);
      return () => observer.disconnect();
    }, []);
    return React.createElement('output', null, width);
  }
  flushSync(() => root.render(React.createElement(Probe)));
});
`;
const server = await createServer({
  configFile: false,
  root: `${gui}renderer`,
  optimizeDeps: { entries: [], include: ["react", "react-dom", "react-dom/client"] },
  server: { host: "127.0.0.1", port: 0, fs: { allow: [gui] } },
  plugins: [
    {
      name: "resize-observer-probe",
      resolveId(id) {
        if (id === "/resize-probe.js") return "\0resize-probe";
      },
      load(id) {
        if (id === "\0resize-probe") return source;
      },
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url !== "/resize-probe") return next();
          response.setHeader("Content-Type", "text/html");
          response.end('<script type="module" src="/resize-probe.js"></script>');
        });
      },
    },
  ],
});
await server.listen();
const browser = await chromium.launch({
  ...(process.env.AREAL_GUI_TEST_BROWSER
    ? { executablePath: process.env.AREAL_GUI_TEST_BROWSER }
    : { channel: "chrome" }),
  headless: true,
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${server.resolvedUrls.local[0]}resize-probe`);
  await page.waitForFunction(() => typeof window.runResizeProbe === "function");
  const raw = await page.evaluate(() => window.runResizeProbe("raw"));
  const shared = await page.evaluate(() => window.runResizeProbe("shared"));
  assert.ok(
    raw.samples.some(
      (sample) => sample.phase === "beforePaint" && sample.actual !== sample.expected,
    ),
    "native observer must reproduce a deferred React commit",
  );
  assert.ok(shared.samples.length > 0);
  assert.ok(
    shared.samples.every((sample) => sample.actual === sample.expected),
    "shared delivery commits before the following pre-paint microtask",
  );
  assert.equal(shared.deliveries, 2, "unmount disconnects; the third resize cannot deliver");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ raw, shared, browser: await browser.version() }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
