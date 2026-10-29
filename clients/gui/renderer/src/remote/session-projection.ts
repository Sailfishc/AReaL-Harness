import type { Data } from "../services.js";

export function projectedTurns(turns: Data[] = []) {
  return turns.map((turn) => ({
    ...turn,
    items: turn.items.map((item: Data) => {
      if (item.body) return { ...item, ...item.body };
      const body = item.preview ?? "";
      if (item.type === "userMessage") return { ...item, content: [{ type: "text", text: body }] };
      if (item.type === "agentMessage") return { ...item, text: body };
      if (item.type === "reasoning") return { ...item, summary: [body], content: [] };
      if (item.type === "dynamicToolCall")
        return {
          ...item,
          arguments: {},
          contentItems: [{ type: "inputText", text: body }],
          execution: { outcome: item.executionOutcome ?? "unknown" },
        };
      return { ...item, text: body };
    }),
  }));
}
