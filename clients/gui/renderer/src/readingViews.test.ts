import { afterEach, expect, test, vi } from "vite-plus/test";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function fixture(unavailable = false) {
  let raw: string | null = null;
  vi.stubGlobal("window", {
    sessionStorage: {
      getItem: () => raw,
      setItem: (_key: string, value: string) => {
        if (unavailable) throw new Error("Storage unavailable");
        raw = value;
      },
    },
  });
  const views = await import("./readingViews.js");
  const owner = (index: number) => JSON.stringify(["project", `thread-${index}`, false]);
  const remember = (index: number) => {
    const key = owner(index);
    views.readingViews.delete(key);
    views.readingViews.set(key, { top: index, following: true, atTail: true });
    views.saveReadingViews();
  };
  return { ...views, owner, remember, raw: () => raw };
}

test("reading checkpoints retain only the most recent 32 contexts in memory", async () => {
  const f = await fixture();
  for (let index = 0; index < 1024; index++) f.remember(index);
  expect(f.readingViews.size).toBe(32);
  expect([...f.readingViews.keys()]).toEqual(
    Array.from({ length: 32 }, (_, index) => f.owner(index + 992)),
  );
  expect(JSON.parse(f.raw() ?? "{}").views).toHaveLength(32);
});

test("revisiting a context protects its anchor from the next eviction and reload", async () => {
  const f = await fixture();
  for (let index = 0; index < 32; index++) f.remember(index);
  const anchor = { turnId: "turn", itemId: "message", blockIndex: 4, offset: -18.5 };
  f.readingViews.delete(f.owner(0));
  f.readingViews.set(f.owner(0), {
    top: 800,
    following: false,
    atTail: false,
    anchor,
    responseSpace: { turnId: "turn", height: 200, contentHeight: 300 },
  });
  f.saveReadingViews();
  f.remember(32);
  expect(f.readingViews.has(f.owner(1))).toBe(false);
  expect(f.readingViews.get(f.owner(0))?.anchor).toEqual(anchor);
  vi.resetModules();
  const restored = await import("./readingViews.js");
  restored.hydrateReadingViews();
  expect(restored.readingViews.size).toBe(32);
  expect(restored.readingViews.get(f.owner(0))).toEqual({
    top: 0,
    following: false,
    atTail: false,
    anchor,
  });
  expect(restored.readingViews.get(f.owner(32))?.following).toBe(true);
});

test("unavailable session storage still bounds the live reading cache", async () => {
  const f = await fixture(true);
  for (let index = 0; index < 64; index++) f.remember(index);
  expect(f.readingViews.size).toBe(32);
  expect(f.raw()).toBeNull();
  expect(f.readingViews.get(f.owner(63))?.following).toBe(true);
});

test("large semantic anchors respect the checkpoint character budget", async () => {
  const f = await fixture();
  for (let index = 0; index < 32; index++) {
    const owner = JSON.stringify(["project".repeat(140), `thread-${index}`, false]);
    f.readingViews.set(owner, {
      top: 500,
      following: false,
      atTail: false,
      anchor: {
        turnId: "turn".repeat(250),
        itemId: "message".repeat(140),
        blockIndex: 1,
        offset: 3.25,
      },
    });
    f.saveReadingViews();
  }
  const raw = f.raw() ?? "";
  expect(raw.length).toBeLessThanOrEqual(65536);
  expect(JSON.parse(raw).views.length).toBeLessThan(32);
  expect(JSON.parse(raw).views[0].position.anchor.offset).toBe(3.25);
  expect(f.readingViews.size).toBe(32);
});
