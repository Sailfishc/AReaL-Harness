// @ts-check
"use strict";
/** @param {import('@areal/workbench/core-model-contract').CoreThread} thread @param {Array<Pick<import('./history-contract.cjs').HistoryEntry,'sourceTurnId'|'sourceItemId'|'turn'|'item'> & {sourceTurnStatus?:string}>} entries */
function mergeHistory(thread, entries) {
  /** @type {Map<string,import('./history-contract.cjs').HistoryTurn>} */
  const turns = new Map();
  for (const entry of entries) {
    const turn = turns.get(entry.sourceTurnId) ?? {
      ...entry.turn,
      id: entry.sourceTurnId,
      status: entry.sourceTurnStatus,
      items: [],
    };
    if (!turn.items.some((item) => item.id === entry.sourceItemId)) turn.items.push(entry.item);
    turns.set(turn.id, turn);
  }
  // 只有页内新出现的轮次排在已显示轮次之前（向上分页）；已显示的轮次保持原顺序，
  // 补全最新一轮时它不会越过已显示的上一轮。
  const shown = new Set((thread.turns ?? []).map((turn) => turn.id));
  const merged = (thread.turns ?? []).map((current) => {
    const older = turns.get(current.id);
    const currentIds = new Set((current.items ?? []).map((item) => item.id));
    return older
      ? {
          ...older,
          ...current,
          items: [
            ...older.items.filter((item) => !currentIds.has(item.id)),
            ...(current.items ?? []),
          ],
        }
      : { ...current, items: current.items ?? [] };
  });
  return {
    ...thread,
    turns: [...[...turns.values()].filter((turn) => !shown.has(turn.id)), ...merged],
  };
}
/** Only cursors survive eviction; Core remains the authority for page bodies.
 * @param {import('./history-state.cjs').HistoryWindow} window */
function historyGaps(window) {
  const cached = new Map(window.pages.map((page) => [page.pageId, page]));
  const gaps = [];
  let beforeItemId = window.baselineFirstItemId;
  for (let index = 0; index < window.pageRecords.length; index++) {
    const record = window.pageRecords[index];
    const page = cached.get(record.id);
    if (page) {
      beforeItemId = page.data[0]?.sourceItemId ?? beforeItemId;
      continue;
    }
    // Consecutive unloaded pages share one entry point. From older content,
    // restore the adjacent newer page; at the top restore the adjacent older one.
    const start = index;
    while (index + 1 < window.pageRecords.length && !cached.has(window.pageRecords[index + 1].id))
      index++;
    gaps.push({
      id: window.pageRecords[index === window.pageRecords.length - 1 ? start : index].id,
      beforeItemId,
      atTop: index === window.pageRecords.length - 1,
    });
  }
  return gaps;
}

module.exports = { mergeHistory, historyGaps };
