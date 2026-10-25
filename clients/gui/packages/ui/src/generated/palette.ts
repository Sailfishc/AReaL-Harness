// Generated from tokens.json by scripts/palette.mjs. Do not edit.
import type { Palette } from "../theme.js";

export const PALETTE_REFERENCES = {
  "black": "#000000",
  "white": "#ffffff",
  "transparent": "transparent",
  "default-background-light": "#ffffff",
  "default-background-dark": "#181818",
  "default-foreground-dark": "#ffffff",
  "default-accent": "#3a83f7",
  "file-link-default": "#2c67c5",
  "primary-text-default-dark": "#2d2d2d",
  "user-message-default-dark": "#173e76",
  "user-message-default-light": "#e8f3fe",
  "user-text-default-dark": "#f6fafe",
  "user-text-default-light": "#0c274a",
  "settings-sidebar-default-solid": "rgb(40 40 40 / 1)",
  "settings-sidebar-default-translucent": "rgb(40 40 40 / 0.7)",
  "settings-row-default-dark": "rgba(255, 255, 255, 0.08)",
  "page-shadow-ambient": "#0000000d",
  "composer-shadow-light": "var(--composer-shadow-light)",
  "composer-shadow-dark": "var(--composer-shadow-dark)",
  "success": "var(--color-success)",
  "warning": "var(--color-warning)",
  "error": "var(--color-destructive)",
  "result-shadow-near": "#0000000a",
  "result-shadow-ambient": "#0000000d",
  "settings-attention": "#f59e0b",
} as const;

export function derivePaletteVariables(p: Palette, dark: boolean, readableForeground: (background: string) => string): Record<string, string> {
  const contrastDelta = p.contrast - (dark ? 60 : 45);
  const surfaceBase = p.background;
  const textDefault = p.foreground;
  const interactionFocus = p.accent;
  const textFileLink = (p.accent === PALETTE_REFERENCES["default-accent"]) ? PALETTE_REFERENCES["file-link-default"] : p.accent;
  const textFileLinkOnSurface = (dark ? `color-mix(in srgb, ${textFileLink} ${80}%, ${textDefault})` : textFileLink);
  const textSubtle = `color-mix(in srgb, ${p.foreground} ${((dark ? 69.5 : 75) + contrastDelta * 0.15)}%, ${p.background})`;
  const statusSettled = (dark ? `color-mix(in srgb, ${p.foreground} ${(55 + contrastDelta * 0.15)}%, ${PALETTE_REFERENCES["transparent"]})` : textSubtle);
  const surfaceRaised = `color-mix(in srgb, ${p.foreground} ${(2100 / 231)}%, ${p.background})`;
  const surfaceMuted = `color-mix(in srgb, ${p.foreground} ${(3 + contrastDelta * 0.03)}%, ${PALETTE_REFERENCES["transparent"]})`;
  const surfaceRaisedTranslucent = (dark ? `color-mix(in srgb, ${surfaceRaised} ${50}%, ${PALETTE_REFERENCES["transparent"]})` : surfaceMuted);
  const borderResult = `color-mix(in srgb, ${p.foreground} ${((dark ? 15.6 : 8) + contrastDelta * 0.08)}%, ${PALETTE_REFERENCES["transparent"]})`;
  const shadowResult = `0 0 0 .5px ${borderResult}`;
  const surfaceSunken = (dark ? `color-mix(in srgb, ${surfaceBase} ${83.333333}%, ${PALETTE_REFERENCES["black"]})` : surfaceBase);
  const surfaceHistory = (dark ? surfaceRaised : surfaceBase);
  const surfaceControl = (dark ? surfaceRaised : `color-mix(in srgb, ${p.foreground} ${3}%, ${PALETTE_REFERENCES["transparent"]})`);
  const surfaceOverlay = `color-mix(in srgb, ${p.foreground} ${(3000 / 231)}%, ${p.background})`;
  const surfaceHistoryHover = (dark ? `color-mix(in srgb, ${surfaceOverlay} ${96}%, ${PALETTE_REFERENCES["transparent"]})` : surfaceBase);
  const textPrimaryInverse = (dark && p.foreground === PALETTE_REFERENCES["default-foreground-dark"]) ? PALETTE_REFERENCES["primary-text-default-dark"] : readableForeground(textDefault);
  const surfaceAccent = `color-mix(in srgb, ${p.foreground} ${6}%, ${p.background})`;
  const surfaceSecondary = `color-mix(in srgb, ${p.foreground} ${5}%, ${PALETTE_REFERENCES["transparent"]})`;
  const surfaceUserMessage = (dark && p.background === PALETTE_REFERENCES["default-background-dark"]) ? PALETTE_REFERENCES["user-message-default-dark"] : (!dark && p.background === PALETTE_REFERENCES["default-background-light"]) ? PALETTE_REFERENCES["user-message-default-light"] : surfaceAccent;
  const textUserMessage = (dark && p.background === PALETTE_REFERENCES["default-background-dark"]) ? PALETTE_REFERENCES["user-text-default-dark"] : (!dark && p.background === PALETTE_REFERENCES["default-background-light"]) ? PALETTE_REFERENCES["user-text-default-light"] : textDefault;
  const surfaceWindowAlt = `color-mix(in srgb, ${p.foreground} ${4}%, ${p.background})`;
  const surfaceShell = (dark ? `color-mix(in srgb, ${p.foreground} ${(1200 / 231)}%, ${p.background})` : surfaceWindowAlt);
  const surfaceNavigation = (dark ? `color-mix(in srgb, ${p.foreground} ${(600 / 231)}%, ${p.background})` : (p.translucentSidebar ? `color-mix(in oklab, ${surfaceBase} ${70}%, ${PALETTE_REFERENCES["transparent"]})` : surfaceBase));
  const interactionSelected = `color-mix(in srgb, ${p.foreground} ${(5.5 + contrastDelta * 0.04)}%, ${PALETTE_REFERENCES["transparent"]})`;
  const interactionNavigationSelected = (dark ? `color-mix(in srgb, ${p.foreground} ${(2400 / 231)}%, ${p.background})` : interactionSelected);
  const shadowPage = `0 0 0 .5px ${`color-mix(in srgb, ${p.foreground} ${(dark ? 6 : 8)}%, ${PALETTE_REFERENCES["transparent"]})`}, 0 4px 16px ${PALETTE_REFERENCES["page-shadow-ambient"]}`;
  const surfaceSettingsSidebar = (dark && p.background === PALETTE_REFERENCES["default-background-dark"]) ? (p.translucentSidebar ? PALETTE_REFERENCES["settings-sidebar-default-translucent"] : PALETTE_REFERENCES["settings-sidebar-default-solid"]) : (dark ? (p.translucentSidebar ? `color-mix(in srgb, ${`color-mix(in srgb, ${p.foreground} ${(3800 / 231)}%, ${p.background})`} ${70}%, ${PALETTE_REFERENCES["transparent"]})` : `color-mix(in srgb, ${p.foreground} ${(3800 / 231)}%, ${p.background})`) : (p.translucentSidebar ? `color-mix(in srgb, ${surfaceBase} ${70}%, ${PALETTE_REFERENCES["transparent"]})` : surfaceBase));
  const interactionSettingsRow = (dark && p.background === PALETTE_REFERENCES["default-background-dark"]) ? PALETTE_REFERENCES["settings-row-default-dark"] : interactionSelected;
  const surfaceComposer = `color-mix(in srgb, ${(dark ? surfaceOverlay : surfaceBase)} ${(dark ? 96 : 86.4706)}%, ${PALETTE_REFERENCES["transparent"]})`;
  const shadowComposer = (dark && p.background === PALETTE_REFERENCES["default-background-dark"] && p.foreground === PALETTE_REFERENCES["default-foreground-dark"]) ? PALETTE_REFERENCES["composer-shadow-dark"] : (dark ? `inset 0 0 1px 0 ${`color-mix(in srgb, ${p.foreground} ${20}%, ${PALETTE_REFERENCES["transparent"]})`}` : PALETTE_REFERENCES["composer-shadow-light"]);
  const surfaceAlt = `color-mix(in srgb, ${p.foreground} ${3}%, ${p.background})`;
  const surfaceSettingsGroup = (dark ? `color-mix(in srgb, ${p.foreground} ${(1100 / 231)}%, ${p.background})` : surfaceBase);
  const surfaceMenu = `color-mix(in srgb, ${(dark ? surfaceRaised : surfaceBase)} ${90}%, ${PALETTE_REFERENCES["transparent"]})`;
  const borderMenu = `color-mix(in srgb, ${p.foreground} ${((dark ? 8.2 : 8) + contrastDelta * 0.08)}%, ${PALETTE_REFERENCES["transparent"]})`;
  const interactionMenuHover = `color-mix(in srgb, ${p.foreground} ${5.5}%, ${PALETTE_REFERENCES["transparent"]})`;
  const surfaceCatalog = (dark ? `color-mix(in srgb, ${p.foreground} ${(2000 / 231)}%, ${p.background})` : surfaceBase);
  const borderDefault = `color-mix(in srgb, ${p.foreground} ${((dark ? 8.4 : 7.8) + contrastDelta * 0.08)}%, ${PALETTE_REFERENCES["transparent"]})`;
  const borderHover = `color-mix(in srgb, ${p.foreground} ${(11.7 + contrastDelta * 0.1)}%, ${PALETTE_REFERENCES["transparent"]})`;
  const textSubtlest = `color-mix(in srgb, ${p.foreground} ${((dark ? 55 : 70) + contrastDelta * 0.05)}%, ${p.background})`;
  const textSettingsSecondary = (dark ? `color-mix(in srgb, ${p.foreground} ${(65 + contrastDelta * 0.15)}%, ${PALETTE_REFERENCES["transparent"]})` : textSubtle);
  const statusRunning = textSubtle;
  const statusSuccess = PALETTE_REFERENCES["success"];
  const statusAttention = PALETTE_REFERENCES["warning"];
  const statusUnknown = PALETTE_REFERENCES["warning"];
  const statusError = PALETTE_REFERENCES["error"];
  const shadowResultRaised = `0 0 0 .5px ${borderResult}, 0 3px 7.5px ${PALETTE_REFERENCES["result-shadow-near"]}, 0 0 20px ${PALETTE_REFERENCES["result-shadow-ambient"]}`;
  const settingsAttentionIndicator = PALETTE_REFERENCES["settings-attention"];
  const interactionPressed = interactionSelected;
  return {
    "--color-background": surfaceBase,
    "--color-foreground": textDefault,
    "--color-brand": interactionFocus,
    "--color-file-reference": textFileLinkOnSurface,
    "--color-process-settled": statusSettled,
    "--color-result-card": surfaceRaisedTranslucent,
    "--shadow-result-card": shadowResult,
    "--color-result-icon": surfaceSunken,
    "--color-history-comment": surfaceHistory,
    "--color-viewer-control": surfaceControl,
    "--color-history-comment-hover": surfaceHistoryHover,
    "--color-primary": textDefault,
    "--color-primary-foreground": textPrimaryInverse,
    "--color-composer-action": "var(--color-primary)",
    "--color-composer-action-foreground": "var(--color-primary-foreground)",
    "--color-accent": surfaceAccent,
    "--color-secondary": surfaceSecondary,
    "--color-user-message": surfaceUserMessage,
    "--color-user-message-text": textUserMessage,
    "--color-background-win-alt": surfaceWindowAlt,
    "--color-shell": surfaceShell,
    "--color-navigation-background": surfaceNavigation,
    "--color-navigation-selected": interactionNavigationSelected,
    "--shadow-page-surface": shadowPage,
    "--color-sidebar": surfaceSettingsSidebar,
    "--color-sidebar-item": interactionSettingsRow,
    "--color-composer": surfaceComposer,
    "--shadow-composer": shadowComposer,
    "--color-background-alt": surfaceAlt,
    "--color-card": surfaceBase,
    "--color-settings-card": surfaceSettingsGroup,
    "--color-header": surfaceBase,
    "--color-panel": surfaceBase,
    "--color-popover": surfaceBase,
    "--color-menu": surfaceMenu,
    "--color-menu-border": borderMenu,
    "--color-menu-hover": interactionMenuHover,
    "--color-composer-catalog": surfaceCatalog,
    "--color-input": surfaceBase,
    "--color-input-focused": surfaceBase,
    "--color-input-border": "var(--color-border)",
    "--color-input-border-hover": "var(--color-border-hover)",
    "--color-foreground-subtle": textSubtle,
    "--color-foreground-subtlest": textSubtlest,
    "--color-settings-secondary": textSettingsSecondary,
    "--color-border": borderDefault,
    "--color-border-hover": borderHover,
    "--color-hover": interactionSelected,
    "--color-selected": interactionSelected,
    "--color-surface": surfaceMuted,
    "--color-surface-hover": interactionSelected,
    "--color-input-border-focused": interactionFocus,
    "--color-status-running": statusRunning,
    "--color-status-success": statusSuccess,
    "--color-status-attention": statusAttention,
    "--color-status-unknown": statusUnknown,
    "--color-status-error": statusError,
    "--color-status-settled": statusSettled,
    "--shadow-result-raised": shadowResultRaised,
    "--color-settings-attention-indicator": settingsAttentionIndicator,
  };
}
