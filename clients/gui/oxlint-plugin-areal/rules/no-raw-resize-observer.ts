// Adapted from T3 Code f41518f3 (MIT). Copyright (c) 2026 T3 Tools Inc.
import { defineRule, type ESTree } from "@oxlint/plugins";

const GLOBAL_OBJECTS = new Set(["globalThis", "window", "self"]);

function isResizeObserverConstructor(node: ESTree.Node): boolean {
  if (node.type === "Identifier") return node.name === "ResizeObserver";
  if (node.type !== "MemberExpression" || node.object.type !== "Identifier") return false;
  if (!GLOBAL_OBJECTS.has(node.object.name)) return false;
  const { property } = node;
  if (!node.computed && property.type === "Identifier") return property.name === "ResizeObserver";
  return property.type === "Literal" && property.value === "ResizeObserver";
}

export default defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow constructing ResizeObserver directly in web code; use observeResize.",
    },
  },
  create(context) {
    return {
      NewExpression(node) {
        if (!isResizeObserverConstructor(node.callee)) return;
        context.report({
          node: node.callee,
          message:
            "R-CHECK-017: Use observeResize from @areal/ui/observe-resize. React may defer size-derived DOM updates to a later frame; the shared helper flushes them during delivery.",
        });
      },
    };
  },
});
