import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { ComponentProps } from "react";
import type { ChatPromptEditor } from "./prompt-editor/ChatPromptEditor.js";
import { toast } from "./components/ui/toast.js";
import { ConversationComposer } from "./ConversationComposer.js";

type EditorProps = ComponentProps<typeof ChatPromptEditor>;
const observed = vi.hoisted(() => ({ editor: undefined as EditorProps | undefined }));
vi.mock("./prompt-editor/ChatPromptEditor.js", () => ({
  ChatPromptEditor: (props: EditorProps) => {
    observed.editor = props;
    return createElement("div", {}, props.topContent);
  },
}));
vi.mock("./components/ui/toast.js", () => ({ toast: vi.fn() }));
vi.mock("./i18n/IntlProvider.js", () => ({
  useI18n: () => ({
    t: (_id: string, values: Record<string, string>) => `${values.model} ${values.effort}`,
  }),
}));

function render(effort: string, options: string[] | undefined, fallback = false) {
  vi.mocked(toast).mockClear();
  const submit = vi.fn();
  const markup = renderToStaticMarkup(
    createElement(ConversationComposer, {
      project: {
        models: [
          {
            providerId: "fixture",
            modelId: "gpt-6.1-sol",
            reasoningEffortOptions: options ?? [],
            capabilities: {
              reasoning: true,
              ...(options === undefined ? {} : { reasoningEffortOptions: options }),
            },
          },
        ],
      },
      modelConfig: fallback
        ? { parameters: { reasoningEffort: effort } }
        : {
            model: { providerId: "fixture", modelId: "gpt-6.1-sol" },
            resolvedParameters: { reasoningEffort: effort },
          },
      fallbackModelConfig: fallback
        ? {
            model: { providerId: "fixture", modelId: "gpt-6.1-sol" },
            resolvedParameters: { reasoningEffort: "low" },
          }
        : undefined,
      workspacePath: "/workspace",
      taskId: "thread",
      submitLabel: "Send",
      onConfigureModel: vi.fn(),
      onSubmit: submit,
    }),
  );
  return { submit, markup, editor: observed.editor! };
}

describe("conversation effort compatibility", () => {
  it.each([{ options: ["low", "max"] }, { options: [] }])(
    "retains an incompatible historical effort and blocks every submit callback for $options",
    ({ options }) => {
      const result = render("minimal", options);
      expect(result.markup).not.toContain('role="alert"');
      expect(toast).not.toHaveBeenCalled();
      expect(result.editor.onSubmit("retained draft")).toBe(false);
      expect(toast).toHaveBeenCalledWith("gpt-6.1-sol minimal", "error");
      expect(result.submit).not.toHaveBeenCalled();
    },
  );
  it("allows explicit service default to repair an empty capability list", () => {
    const result = render("default", []);
    expect(result.editor.submitDisabled).not.toBe(true);
    result.editor.onSubmit("retained draft");
    expect(result.submit).toHaveBeenCalledWith("retained draft");
  });
  it("validates a conversation override against the displayed profile fallback model", () => {
    const result = render("minimal", ["low", "max"], true);
    expect(result.markup).not.toContain('role="alert"');
    expect(result.editor.onSubmit("retained draft")).toBe(false);
    expect(toast).toHaveBeenCalledWith("gpt-6.1-sol minimal", "error");
    expect(result.submit).not.toHaveBeenCalled();
  });
  it("does not falsely reject a custom explicit effort when capabilities are unknown", () => {
    const result = render("minimal", undefined);
    expect(result.editor.submitDisabled).not.toBe(true);
    expect(result.markup).not.toContain('role="alert"');
  });
});
