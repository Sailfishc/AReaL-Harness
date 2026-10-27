export type ResponseSpace = { turnId: string; height: number; contentHeight: number };
export type ReadingAnchor = {
  turnId: string;
  itemId: string;
  blockIndex: number | null;
  offset: number;
};
export type ReadingView = {
  top: number;
  following: boolean;
  atTail: boolean;
  responseSpace?: ResponseSpace;
  anchor?: ReadingAnchor;
};
type ReadingCheckpoint = {
  owner: string;
  position: { kind: "latest" } | { kind: "reading"; anchor: ReadingAnchor };
};
const readingCheckpointKey = "areal-gui:reading-views:v1";
const readingCheckpointLimit = 64 * 1024;
export const readingViews = new Map<string, ReadingView>();
let readingViewsHydrated = false;
let savedReadingCheckpoint: string | null = null;
function checkpointRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function checkpointId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 1024;
}
export function hydrateReadingViews() {
  if (readingViewsHydrated) return;
  readingViewsHydrated = true;
  try {
    const raw = window.sessionStorage.getItem(readingCheckpointKey);
    if (!raw || raw.length > readingCheckpointLimit) return;
    const checkpoint: unknown = JSON.parse(raw);
    if (
      !checkpointRecord(checkpoint) ||
      checkpoint.version !== 1 ||
      !Array.isArray(checkpoint.views) ||
      checkpoint.views.length > 32
    )
      return;
    for (const entry of [...checkpoint.views].reverse()) {
      if (
        !checkpointRecord(entry) ||
        typeof entry.owner !== "string" ||
        entry.owner.length > 4096 ||
        !checkpointRecord(entry.position)
      )
        continue;
      const identity: unknown = JSON.parse(entry.owner);
      if (
        !Array.isArray(identity) ||
        identity.length !== 3 ||
        !checkpointId(identity[0]) ||
        !checkpointId(identity[1]) ||
        identity[2] !== false
      )
        continue;
      const owner = JSON.stringify(identity);
      const position = entry.position;
      if (position.kind === "latest")
        readingViews.set(owner, { top: 0, following: true, atTail: true });
      else if (position.kind === "reading" && checkpointRecord(position.anchor)) {
        const { turnId, itemId, blockIndex, offset } = position.anchor;
        if (
          !checkpointId(turnId) ||
          !checkpointId(itemId) ||
          typeof offset !== "number" ||
          !Number.isFinite(offset) ||
          Math.abs(offset) > 1_000_000 ||
          (blockIndex !== null &&
            (typeof blockIndex !== "number" ||
              !Number.isInteger(blockIndex) ||
              blockIndex < 0 ||
              blockIndex > 1_000_000))
        )
          continue;
        readingViews.set(owner, {
          top: 0,
          following: false,
          atTail: false,
          anchor: { turnId, itemId, blockIndex, offset },
        });
      }
    }
    savedReadingCheckpoint = raw;
  } catch {}
}
export function saveReadingViews() {
  try {
    const views: ReadingCheckpoint[] = [];
    for (const [owner, view] of [...readingViews].reverse()) {
      const position: ReadingCheckpoint["position"] | undefined = view.following
        ? { kind: "latest" }
        : view.anchor && { kind: "reading", anchor: view.anchor };
      if (!position) continue;
      const entry = { owner, position };
      if (JSON.stringify({ version: 1, views: [...views, entry] }).length > readingCheckpointLimit)
        continue;
      views.push(entry);
      if (views.length === 32) break;
    }
    const serialized = JSON.stringify({ version: 1, views });
    if (serialized === savedReadingCheckpoint) return;
    window.sessionStorage.setItem(readingCheckpointKey, serialized);
    savedReadingCheckpoint = serialized;
  } catch {}
}
