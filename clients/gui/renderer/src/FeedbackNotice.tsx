import { useEffect, useRef, type ComponentProps } from "react";
import { FeedbackNotice as View } from "@areal/ui/wip";
import { useI18n } from "./i18n/IntlProvider.js";
import { toast } from "./components/ui/toast.js";

export function FeedbackNotice({ transient, ...props }: ComponentProps<typeof View> & { transient?: boolean }) {
  const { t } = useI18n();
  const shortLived = transient ?? !props.actions;
  const announced = useRef("");
  const dismiss = useRef(props.onDismiss);
  dismiss.current = props.onDismiss;
  useEffect(() => {
    if (!shortLived || !props.message) { announced.current = ""; return; }
    const identity = `${props.tone}:${props.message}`;
    if (announced.current === identity) return;
    announced.current = identity;
    toast(props.message, props.tone);
    // Consume the original notice so it cannot accumulate behind another page.
    // Actionable recovery notices keep their original identity and controls.
    dismiss.current?.();
  }, [shortLived, props.message, props.tone]);
  if (shortLived) return null;
  return <View dismissLabel={t("recovery.dismiss")} detailsLabel={t("recovery.details")} expandLabel={t("settings.settingsDisclosure.expand")} collapseLabel={t("settings.settingsDisclosure.collapse")} {...props} />;
}
