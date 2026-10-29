import type { ComponentProps, ReactNode } from "react";
import { ChatPromptEditor } from "./prompt-editor/ChatPromptEditor.js";
import { ComposerModelMenu, composerModelOption } from "./ComposerModelMenu.js";
import { resolveModelEffort } from "@areal/workbench/model-selection";
import { toast } from "./components/ui/toast.js";
import { useI18n } from "./i18n/IntlProvider.js";
import type { Data } from "./services.js";

type ConversationComposerProps = Omit<
  ComponentProps<typeof ChatPromptEditor>,
  "betweenCancelAndSubmitAction"
> & {
  project: Data;
  contextControl?: ReactNode;
  modelControl?: ReactNode;
  modelConfig?: Data;
  fallbackModelConfig?: Data;
  modelDisabled?: boolean;
  modelPending?: boolean;
  onConfigureModel: (values: Data) => void | Promise<void>;
};

/** Main and Side share the editor, toolbar and Core model catalog; callers own submission and drafts. */
export function ConversationComposer({
  project,
  modelConfig,
  fallbackModelConfig,
  modelDisabled,
  modelPending,
  onConfigureModel,
  contextControl,
  modelControl,
  ...editor
}: ConversationComposerProps) {
  const { t } = useI18n();
  // 展示回退不改变草稿意图；显式点选当前展示模型仍可覆盖历史锚点模型。
  const config =
    modelConfig?.model === undefined && fallbackModelConfig
      ? {
          ...fallbackModelConfig,
          parameters: { ...fallbackModelConfig.parameters, ...modelConfig?.parameters },
          resolvedParameters: {
            ...fallbackModelConfig.resolvedParameters,
            ...modelConfig?.parameters,
          },
        }
      : modelConfig;
  const value = config?.model ? `${config.model.providerId}/${config.model.modelId}` : "";
  const options = project.models
    .filter(
      (item: Data) =>
        item.providerId ||
        !project.models.some((candidate: Data) => candidate.providerId && candidate.isDefault),
    )
    .map(composerModelOption);
  if (config?.model && !options.some((option: { value: string }) => option.value === value)) {
    options.push({
      value,
      label: config.model.modelId,
      providerId: config.model.providerId,
      historical: true,
      unavailableReason: project.state?.connected ? "模型不可用" : undefined,
    });
  } else if (config?.model === null) {
    const implicit = options.find((option: { value: string }) => option.value === "");
    const implicitModel = project.models.find((item: Data) => !item.providerId);
    const currentImplicit = !!implicitModel && implicitModel.modelId === config.modelName;
    const historical = {
      ...(currentImplicit
        ? composerModelOption(implicitModel)
        : { efforts: implicitModel?.reasoningEffortOptions }),
      value: "",
      label: config.modelName || "历史默认模型未知",
      historical: !implicit || !currentImplicit,
    };
    if (implicit) options.splice(options.indexOf(implicit), 1, historical);
    else options.unshift(historical);
  }
  const currentModel = project.models.find((item: Data) =>
    config?.model
      ? item.providerId === config.model.providerId && item.modelId === config.model.modelId
      : !item.providerId,
  );
  const effort = config?.resolvedParameters?.reasoningEffort ?? config?.parameters?.reasoningEffort;
  const supported =
    currentModel?.capabilities?.reasoningEffortOptions ??
    (currentModel?.reasoningEffortOptions?.length
      ? currentModel.reasoningEffortOptions
      : undefined);
  const unsupported =
    effort != null &&
    effort !== "default" &&
    currentModel?.capabilities?.reasoning !== false &&
    supported !== undefined &&
    !supported.includes(effort);
  const effortError = unsupported
    ? t("chat.composer.unsupportedEffort", {
        model: currentModel.modelId,
        effort,
      })
    : undefined;
  return (
    <ChatPromptEditor
      {...editor}
      onSubmit={(value) => {
        if (!effortError) return editor.onSubmit(value);
        toast(effortError, "error");
        return false;
      }}
      betweenCancelAndSubmitAction={
        <>
          {contextControl}
          {modelControl ?? (
            <ComposerModelMenu
              disabled={modelDisabled}
              pending={modelPending}
              effort={effort}
              value={value}
              options={options}
              onEffortChange={(value) =>
                onConfigureModel({
                  parameters: { ...modelConfig?.parameters, reasoningEffort: value },
                })
              }
              onChange={(nextValue) => {
                if (
                  nextValue === value &&
                  (!fallbackModelConfig || modelConfig?.model !== undefined)
                )
                  return;
                const model = project.models.find((item: Data) =>
                  nextValue ? `${item.providerId}/${item.modelId}` === nextValue : !item.providerId,
                );
                if (model)
                  onConfigureModel({
                    model: model.providerId
                      ? { providerId: model.providerId, modelId: model.modelId }
                      : null,
                    parameters: { reasoningEffort: resolveModelEffort(model) ?? null },
                  });
              }}
              onClose={() => editor.inputApiRef?.current?.focus()}
            />
          )}
        </>
      }
    />
  );
}
