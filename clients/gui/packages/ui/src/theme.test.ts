import { expect, test } from "vite-plus/test";
import { paletteVariables, readableForeground } from "./theme.js";

test("primary controls choose a readable foreground at both luminance extremes", () => {
  expect(readableForeground("#ffffff")).toBe("#000000");
  expect(readableForeground("#000000")).toBe("#ffffff");
  expect(readableForeground("#808080")).toBe("#000000");
});

test("default and custom palettes retain input roles and component aliases", () => {
  for (const dark of [false, true]) {
    for (const contrast of [0, 45, 100]) {
      const palette = {
        background: dark ? "#181818" : "#ffffff",
        foreground: dark ? "#ffffff" : "#111111",
        accent: "#3a83f7",
        contrast,
        translucentSidebar: true,
      };
      const variables = paletteVariables(palette, dark);
      expect(variables["--color-background"]).toBe(palette.background);
      expect(variables["--color-foreground"]).toBe(palette.foreground);
      expect(variables["--color-brand"]).toBe(palette.accent);
      expect(variables["--color-composer-action"]).toBe("var(--color-primary)");
      expect(variables["--color-input-border"]).toBe("var(--color-border)");
      expect(variables["--color-user-message"]).toBe(dark ? "#173e76" : "#e8f3fe");
    }
  }
  const custom = paletteVariables(
    {
      background: "#223344",
      foreground: "#eeffff",
      accent: "#88bbff",
      contrast: 60,
      translucentSidebar: false,
    },
    true,
  );
  expect(custom["--color-user-message-text"]).toBe("#eeffff");
  expect(custom["--color-file-reference"]).toBe("color-mix(in srgb, #88bbff 80%, #eeffff)");
});
