import type { ComponentProps } from "react";
import { MessageCodeBlock as View } from "@areal/ui/wip";
import { CodeViewer } from "../ui/code-viewer.js";
export function MessageCodeBlock(props: Omit<ComponentProps<typeof View>, "CodeComponent">) { return <View {...props} CodeComponent={CodeViewer} />; }
