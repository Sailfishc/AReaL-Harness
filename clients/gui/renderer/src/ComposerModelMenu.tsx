import { MenuChevronIcon as ChevronDown } from "./interfaceIcons.js";
import { Button } from "./components/ui/button.js";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "./components/ui/dropdown-menu.js";

/** Shared picker for new drafts and existing tasks; the host owns availability and configuration. */
export function ComposerModelMenu({ options, value, disabled, onChange, onClose }: {
  options: { value: string; label: string }[];
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  const label = options.find(option => option.value === value)?.label ?? "请选择模型";
  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button type="button" variant="ghost" aria-label="模型" title={label}
      disabled={disabled || !options.length} className="composer-model-trigger" />}>
      <span>{label}</span><ChevronDown size={14} aria-hidden="true" />
    </DropdownMenuTrigger>
    <DropdownMenuContent aria-label="选择模型" side="top" align="end" sideOffset={8}
      className="composer-model-menu" finalFocus={() => { onClose(); return false; }}>
      <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
        {options.map(option => <DropdownMenuRadioItem key={option.value} value={option.value} data-model-value={option.value}>{option.label}</DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}
