import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: {
    ignorePatterns: [
      "**/dist/**",
      "**/vendor/**",
      "**/generated/**",
      "packages/gen-ui/assets/**",
      "renderer/public/**",
    ],
  },
  fmt: {
    ignorePatterns: [
      "**/dist/**",
      "**/vendor/**",
      "**/generated/**",
      "packages/gen-ui/assets/**",
      "renderer/public/**",
      "pnpm-lock.yaml",
      "patches/**",
      "**/*.md",
    ],
    sortPackageJson: false,
    tabWidth: 2,
  },
  run: {
    cache: { scripts: false, tasks: true },
    tasks: {
      "ui-build": {
        command: "pnpm run build",
        cwd: "packages/ui",
        cache: {
          input: [
            { pattern: "packages/ui/src/**", base: "workspace" },
            { pattern: "packages/ui/scripts/**", base: "workspace" },
            { pattern: "packages/ui/*.json", base: "workspace" },
            { pattern: "packages/ui/agent-guide.md", base: "workspace" },
            { pattern: "pnpm-lock.yaml", base: "workspace" },
          ],
          output: [{ pattern: "packages/ui/dist/**", base: "workspace" }],
        },
      },
      "desktop-build": {
        command: "pnpm build:desktop",
        cache: false,
      },
      "verify-suite": {
        command: [
          "pnpm --filter @areal/ui check",
          "node scripts/verify-public.mjs",
          "node scripts/verify-i18n.mjs",
          "node scripts/design-system-audit.mjs",
          "node scripts/state-projection-smoke.mjs",
          "node --test scripts/conversation-content.test.mjs scripts/bundle.test.mjs scripts/provider-affinity.test.mjs scripts/provider-status.test.cjs scripts/side-restore.test.mjs scripts/operation-contract.test.cjs scripts/side-model-intent.test.mjs scripts/startup-recovery.test.mjs scripts/service-connection-recovery.test.mjs scripts/core-read-recovery.test.mjs scripts/bounded-history-client.test.mjs scripts/desktop-projection-transport.test.mjs scripts/lifecycle-bounded-history.test.mjs scripts/backend-status.test.mjs scripts/system-proxy.test.mjs scripts/history.test.mjs scripts/macos-service.test.mjs scripts/macos-signing-paths.test.mjs scripts/feedback.test.mjs",
          "pnpm test:worktree",
        ],
        dependsOn: ["ui-build", "desktop-build"],
        cache: false,
      },
      "design-suite": {
        command: [
          "pnpm --filter @areal/ui check",
          "node --test scripts/design-system-catalog.test.mjs scripts/design-system-changes.test.mjs",
          "node scripts/design-system-audit.mjs",
        ],
        dependsOn: ["ui-build"],
        cache: false,
      },
      "types-suite": {
        command: [
          "pnpm --filter @areal/gen-ui typecheck",
          "pnpm --filter @areal/gui-renderer typecheck",
          "pnpm --filter @areal/gui-renderer exec tsc --allowJs --checkJs --noEmit --skipLibCheck --target ES2022 --module NodeNext ../packages/workbench/client/desktop-contract.cjs",
        ],
        dependsOn: ["ui-build"],
        cache: false,
      },
    },
  },
});
