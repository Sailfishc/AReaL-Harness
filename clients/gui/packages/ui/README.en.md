[中文](README.md) | **English**

# @areal/ui

A private workspace package for AReaL's CSS foundations, React controls, component contracts and agent entry points. It uses the existing AReaL visual language. Nothing is published to npm.

GUI consumers declare `"@areal/ui": "workspace:*"`. Build the package before the consumer. Workspace resolution uses the local package; the version does not download a similarly named npm package.

```tsx
import { Button } from "@areal/ui";
import { Disclosure } from "@areal/ui/wip";
```

The host uses React 19, Base UI and Tailwind 4. Import `@areal/ui/styles.css` after Tailwind. AReaL's renderer retains the remaining theme aliases and applies saved appearance preferences. `foundation.css` exposes the adopted CSS variables; optional `themes.css` exposes the generated default light/dark palette, using the same pure implementation as the renderer.

Run `pnpm --filter @areal/ui generate` after editing tokens, `build` for JavaScript/types/CSS/documentation outputs, and `check` for drift, boundaries, export metadata and generator regression checks. GUI scripts build this dependency before their consumers.

Source values live in tokens.json; generated foundation, Tailwind mappings and theme defaults live in src/generated. Theme derivation lives in src/theme.ts. Component descriptions sit next to their code; API text comes from TypeScript declaration output. The existing design site provides live examples and serves components.json, llms.txt and Markdown copies from the built package.

The initial package contains Button and experimental Disclosure. Other controls and domain compositions remain with their existing renderer owners. This is a working first slice, not full UI migration or a stable public package release. See [the agent entry](agent-guide.md) and the repository's design architecture for adoption and scope.
