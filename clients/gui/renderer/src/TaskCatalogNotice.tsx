import { Button } from "./components/ui/button.js";
import { useI18n } from "./i18n/IntlProvider.js";

export function TaskCatalogNotice({
  projectName,
  published,
  taskCount,
  error,
  disabled,
  onUpdate,
}: {
  projectName: string;
  published?: boolean;
  taskCount: number;
  error?: string;
  disabled: boolean;
  onUpdate: () => void;
}) {
  const { t } = useI18n();
  if (!error && (!published || taskCount === 0)) return null;
  return (
    <div className={error ? "task-catalog-error" : undefined}>
      <p role="status">
        {projectName} ·{" "}
        {error ? t("operations.schedules.readFailed") : t("operations.schedules.cached")}
      </p>
      {error && <p>{error}</p>}
      <Button size="sm" variant="ghost" disabled={disabled} onClick={onUpdate}>
        {t("operations.schedules.refreshProject")}
      </Button>
    </div>
  );
}
