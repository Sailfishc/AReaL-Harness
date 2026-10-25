import assert from "node:assert/strict";
import { makeTempDir } from "./support/temp.mjs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const gui = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(gui, "packages/ui/package.json"));
const ts = require("typescript");
const baselinePath = resolve(gui, "design-system/theme-baseline.json");

export async function collectThemeEvidence(browser) {
  const tokens = JSON.parse(await readFile(resolve(gui, "packages/ui/tokens.json"), "utf8"));
  const themeSource = await readFile(resolve(gui, "packages/ui/src/theme.ts"), "utf8");
  const js = ts.transpileModule(themeSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const { paletteVariables } = await import(
    `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`
  );
  const defaultPalette = (dark) =>
    Object.fromEntries(
      Object.entries(tokens.themes).map(([name, token]) => {
        const value = dark
          ? (token.$extensions?.["build.areal.ui"]?.dark ?? token.$value)
          : token.$value;
        return [
          name,
          token.$type === "color"
            ? "#" +
              value.components
                .map((channel) =>
                  Math.round(channel * 255)
                    .toString(16)
                    .padStart(2, "0"),
                )
                .join("")
            : value,
        ];
      }),
    );
  const palettes = [
    { id: "default-light", dark: false, ...defaultPalette(false) },
    { id: "default-dark", dark: true, ...defaultPalette(true) },
    {
      id: "custom-blue-dark",
      dark: true,
      background: "#142030",
      foreground: "#dae5f5",
      accent: "#88bbff",
      contrast: 60,
    },
    {
      id: "custom-cool-light",
      dark: false,
      background: "#f2f6fb",
      foreground: "#203040",
      accent: "#4355aa",
      contrast: 45,
    },
    {
      id: "custom-warm-light",
      dark: false,
      background: "#fff4df",
      foreground: "#442a19",
      accent: "#b65424",
      contrast: 45,
    },
  ];
  const context = await browser.newContext();
  const page = await context.newPage();
  const foundation = await readFile(
    resolve(gui, "packages/ui/src/generated/foundation.css"),
    "utf8",
  );
  await page.setContent(`<style>${foundation}</style>`);
  const samples = [];
  for (const palette of palettes) {
    for (const contrast of [0, palette.contrast, 100]) {
      for (const translucentSidebar of [true, false]) {
        const input = { ...palette, contrast, translucentSidebar };
        const variables = paletteVariables(input, palette.dark);
        const observed = await page.evaluate(
          ({ variables, dark }) => {
            document.documentElement.classList.toggle("dark", dark);
            document.documentElement.removeAttribute("style");
            Object.entries(variables).forEach(([name, value]) =>
              document.documentElement.style.setProperty(name, value),
            );
            const probe = document.createElement("span");
            document.body.append(probe);
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = 1;
            const context = canvas.getContext("2d", { willReadFrequently: true });
            const colors = Object.fromEntries(
              Object.keys(variables)
                .filter((name) => name.startsWith("--color-"))
                .map((name) => {
                  probe.style.color = `var(${name})`;
                  const color = getComputedStyle(probe).color;
                  context.clearRect(0, 0, 1, 1);
                  context.fillStyle = color;
                  context.fillRect(0, 0, 1, 1);
                  return [name, { color, rgba: [...context.getImageData(0, 0, 1, 1).data] }];
                }),
            );
            probe.remove();
            return colors;
          },
          { variables, dark: palette.dark },
        );
        samples.push({ input, colors: observed });
      }
    }
  }
  await context.close();
  return {
    schemaVersion: 1,
    sourceSha256: createHash("sha256").update(themeSource).digest("hex"),
    browser: browser.version(),
    scope:
      "Actual paletteVariables output, CSS variable resolution and browser sRGB canvas pixels; five palettes, three contrast levels, both sidebar materials.",
    samples,
  };
}

export async function verifyThemeEvidence(browser, scratch) {
  const observed = await collectThemeEvidence(browser);
  await writeFile(
    resolve(scratch, "theme-snapshot.json"),
    JSON.stringify(observed, null, 2) + "\n",
  );
  const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
  assert.deepEqual(
    observed.samples,
    baseline.samples,
    "browser-resolved palette colors changed from the pre-refactor baseline",
  );
  return {
    samples: observed.samples.length,
    variables: Object.keys(observed.samples[0].colors).length,
    browser: observed.browser,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { chromium } = createRequire(resolve(gui, "app/package.json"))("playwright-core");
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.AREAL_GUI_TEST_BROWSER
      ? { executablePath: process.env.AREAL_GUI_TEST_BROWSER }
      : { channel: "chrome" }),
  });
  try {
    if (process.argv.includes("--write-baseline")) {
      const result = await collectThemeEvidence(browser);
      await writeFile(baselinePath, JSON.stringify(result, null, 2) + "\n");
      console.log(
        JSON.stringify({
          baselinePath,
          samples: result.samples.length,
          variables: Object.keys(result.samples[0].colors).length,
          sourceSha256: result.sourceSha256,
        }),
      );
    } else {
      const scratch = await makeTempDir("areal-theme-evidence-");
      console.log(JSON.stringify({ scratch, ...(await verifyThemeEvidence(browser, scratch)) }));
    }
  } finally {
    await browser.close();
  }
}
