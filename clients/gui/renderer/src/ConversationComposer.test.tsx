import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { ComponentProps } from "react";
import type { ChatPromptEditor } from "./prompt-editor/ChatPromptEditor.js";
import type { ComposerModelMenu } from "./ComposerModelMenu.js";
import { ConversationComposer } from "./ConversationComposer.js";

type EditorProps = ComponentProps<typeof ChatPromptEditor>;
type MenuProps = ComponentProps<typeof ComposerModelMenu>;
const observed = vi.hoisted(() => ({
  editor: undefined as EditorProps | undefined,
  menu: undefined as MenuProps | undefined,
}));
vi.mock("./prompt-editor/ChatPromptEditor.js", () => ({
  ChatPromptEditor: (props: EditorProps) => {
    observed.editor = props;
    return createElement("div", {}, props.betweenCancelAndSubmitAction);
  },
}));
vi.mock("./ComposerModelMenu.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ComposerModelMenu.js")>()),
  ComposerModelMenu: (props: MenuProps) => {
    observed.menu = props;
    return createElement("button", {}, props.effort);
  },
}));
vi.mock("./i18n/IntlProvider.js", () => ({
  useI18n: () => ({
    t: (id: string) => id,
  }),
}));

function render(effort: string, options: string[] | undefined, fallback = false, reasoning = true) {
  const submit = vi.fn();
  const configure = vi.fn();
  const markup = renderToStaticMarkup(
    createElement(ConversationComposer, {
      project: {
        models: [
          {
            providerId: "fixture",
            modelId: "gpt-6.1-sol",
            reasoningEffortOptions: options ?? [],
            capabilities: {
              reasoning,
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
      onConfigureModel: configure,
      onSubmit: submit,
    }),
  );
  return { submit, configure, markup, editor: observed.editor!, menu: observed.menu! };
}

describe("conversation explicit effort", () => {
  it.each([
    { options: ["low", "max"], reasoning: true },
    { options: [], reasoning: true },
    { options: undefined, reasoning: true },
    { options: [], reasoning: false },
  ])(
    "submits unchanged explicit effort with $options and reasoning=$reasoning",
    ({ options, reasoning }) => {
      const result = render("minimal", options, false, reasoning);
      expect(result.menu.effort).toBe("minimal");
      result.editor.onSubmit("retained draft");
      expect(result.submit).toHaveBeenCalledWith("retained draft");
      result.menu.onEffortChange!("max");
      expect(result.configure).toHaveBeenCalledWith({ parameters: { reasoningEffort: "max" } });
    },
  );

  it("retains an explicit override on the displayed profile fallback model", () => {
    const result = render("custom-effort", ["low", "max"], true);
    expect(result.menu.effort).toBe("custom-effort");
    result.editor.onSubmit("retained draft");
    expect(result.submit).toHaveBeenCalledWith("retained draft");
  });

  it("submits and configures explicit service default", () => {
    const result = render("default", []);
    result.editor.onSubmit("retained draft");
    expect(result.submit).toHaveBeenCalledWith("retained draft");
    result.menu.onEffortChange!("default");
    expect(result.configure).toHaveBeenCalledWith({ parameters: { reasoningEffort: "default" } });
  });
});
