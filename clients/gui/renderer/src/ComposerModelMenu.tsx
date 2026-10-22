import { useState } from "react";
import { useI18n } from "./i18n/IntlProvider.js";
import { MenuChevronIcon, MenuSelectedIcon } from "./interfaceIcons.js";
import { Button } from "./components/ui/button.js";
import { Popover, PopoverContent, PopoverTrigger } from "./components/ui/popover.js";

const labels: Record<string, string> = {
    none: "无",
    minimal: "最少",
    low: "低",
    medium: "中",
    high: "高",
    xhigh: "极高",
    max: "最高",
};
export interface ComposerModelOption {
    value: string;
    label: string;
    efforts?: readonly string[];
    reasoning?: boolean;
    unavailableReason?: string;
}
/** 可用性直接投影 Core 目录，不在 Renderer 重新判断凭据。 */
export function composerModelOption(model: {
    providerId?: string | null;
    modelId: string;
    displayName?: string;
    reasoningEffortOptions?: readonly string[];
    capabilities?: { reasoning: boolean };
    available?: boolean;
    credentialState?: string;
}): ComposerModelOption {
    return {
        value: model.providerId ? `${model.providerId}/${model.modelId}` : "",
        label: model.displayName ?? model.modelId,
        efforts: model.reasoningEffortOptions,
        reasoning: model.capabilities?.reasoning,
        unavailableReason: model.available === false
            ? model.credentialState === "unavailable" ? "缺少 API Key" : "模型不可用"
            : undefined,
    };
}
/** 模型/允许强度由目录和宿主提供，组件只负责两级选择。 */
export function ComposerModelMenu({
    options,
    value,
    disabled,
    effort,
    onEffortChange,
    onChange,
    onClose,
}: {
    options: ComposerModelOption[];
    value: string;
    disabled?: boolean;
    effort?: string;
    onEffortChange?: (value: string) => void;
    onChange: (value: string) => void;
    onClose: () => void;
}) {
    const { t } = useI18n();
    const unspecified = t("chat.composer.effortUnspecified");
    const [open, setOpen] = useState(false);
    const [page, setPage] = useState<"effort" | "models">("effort");
    const model = options.find((option) => option.value === value);
    const label = model?.label ?? "请选择模型";
    const reasoning = !!model && model.reasoning !== false;
    const efforts = model?.efforts ?? [];
    const selectedEffort = effort && (!model?.efforts || efforts.includes(effort)) ? effort : undefined;
    const index = selectedEffort ? efforts.indexOf(selectedEffort) : -1;
    // Native range thumbs travel between half-thumb insets, including both endpoints.
    const sliderPosition = (step: number) => {
        const fraction = Math.max(0, step) / Math.max(1, efforts.length - 1);
        return `calc(${fraction * 100}% + ${14 - fraction * 28}px)`;
    };
    if (!options.length) return (
        <span className="composer-model-trigger text-foreground-subtle text-ui-sm">
            {t("chat.composer.noModelsGuidance")}
        </span>
    );
    return (
        <Popover
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (next) setPage(model && !model.unavailableReason && model.reasoning !== false ? "effort" : "models");
            }}
        >
            <PopoverTrigger
                render={
                    <Button
                        type="button"
                        variant="ghost"
                        aria-label="模型"
                        title={label}
                        disabled={disabled}
                        className="composer-model-trigger"
                    />
                }
            >
                <span>
                    {label}
                    {reasoning && ` ${selectedEffort ? labels[selectedEffort] ?? selectedEffort : unspecified}`}
                </span>
                <MenuChevronIcon size={14} aria-hidden="true" />
            </PopoverTrigger>
            <PopoverContent
                aria-label={page === "effort" && reasoning ? "模型与思考强度" : "选择模型"}
                side="top"
                align="end"
                sideOffset={8}
                className={page === "effort" ? "composer-effort-menu" : "composer-model-menu"}
                finalFocus={() => {
                    onClose();
                    return false;
                }}
            >
                {page === "effort" ? (
                    <>
                        <div className="composer-effort-center">
                            {reasoning && <strong>
                                {selectedEffort ? (labels[selectedEffort] ?? selectedEffort) : unspecified}
                            </strong>}
                            <button
                                type="button"
                                aria-label="选择模型"
                                onClick={() => setPage("models")}
                            >
                                {label} ›
                            </button>
                        </div>
                        {reasoning && efforts.length > 0 && onEffortChange ? (
                            <>
                            {index >= 0 && <div className="composer-slider-shell">
                                <div className="composer-slider-track" aria-hidden="true">
                                    <div
                                        style={{
                                            width: sliderPosition(index),
                                        }}
                                    />
                                    {efforts.map((item, i) => (
                                        <i
                                            key={item}
                                            data-selected={index >= i}
                                            style={{
                                                left: sliderPosition(i),
                                            }}
                                        />
                                    ))}
                                </div>
                                <input
                                    type="range"
                                    aria-label="思考强度"
                                    aria-valuetext={
                                        selectedEffort ? (labels[selectedEffort] ?? selectedEffort) : unspecified
                                    }
                                    min={0}
                                    max={efforts.length - 1}
                                    step={1}
                                    value={Math.max(0, index)}
                                    onChange={(event) =>
                                        onEffortChange(efforts[Number(event.target.value)])
                                    }
                                />
                            </div>}
                            <div role="group" aria-label={t("chat.composer.chooseEffort")} className="mt-2 flex flex-wrap justify-center gap-1">
                                {efforts.map(item => <Button key={item} type="button" variant="ghost" size="sm"
                                    aria-pressed={selectedEffort === item}
                                    onClick={() => onEffortChange(item)}>{labels[item] ?? item}</Button>)}
                            </div>
                            </>
                        ) : reasoning ? (
                            <p className="composer-effort-unavailable">此模型未提供可选强度</p>
                        ) : null}
                    </>
                ) : (
                    <>
                        <div className="composer-model-heading">
                            {reasoning && <button
                                type="button"
                                aria-label="返回思考强度"
                                onClick={() => setPage("effort")}
                            >
                                ‹
                            </button>}
                            选择模型
                        </div>
                        <div role="radiogroup" aria-label="模型列表">
                            {options.map((option) => (
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={value === option.value}
                                    key={option.value}
                                    data-model-value={option.value}
                                    disabled={!!option.unavailableReason}
                                    onClick={() => {
                                        onChange(option.value);
                                        if (option.reasoning === false) setOpen(false);
                                        else setPage("effort");
                                    }}
                                >
                                    <span>{option.label}{option.unavailableReason && <small>{option.unavailableReason}</small>}</span>
                                    {value === option.value && <MenuSelectedIcon size={16} />}
                                </button>
                            ))}
                        </div>
                    </>
                )}
            </PopoverContent>
        </Popover>
    );
}
