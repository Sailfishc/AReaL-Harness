import { useState } from "react";
import { Monitor, ShieldCheck, Smartphone } from "lucide-react";
import { Input, Button } from "@areal/ui";
import { useI18n } from "../i18n/IntlProvider.js";
import type { CommandParams, Data } from "../services.js";

export function GrantReview({
  device,
  projects,
  pending,
  busy,
  run,
}: {
  device: Data;
  projects: Data[];
  pending?: boolean;
  busy: boolean;
  run: (request: CommandParams<"remoteControl">) => Promise<void>;
}) {
  const { t } = useI18n();
  const id = device.devicePeerId ?? device.id;
  const [selected, setSelected] = useState<string[]>(device.projectIds ?? []);
  const [preset, setPreset] = useState<"Observer" | "Operator">(
    device.capabilities?.includes("submit") ? "Operator" : "Observer",
  );
  return (
    <fieldset
      aria-label={t(
        pending
          ? "settings.mobileSettings.confirmDeviceLabel"
          : "settings.mobileSettings.authorizeDeviceLabel",
        { device: id },
      )}
      className="remote-grant"
    >
      <legend>
        {device.clientKind === "ios" ? <Smartphone size={20} /> : <Monitor size={20} />}
        {pending
          ? t(
              device.clientKind === "ios"
                ? "settings.mobileSettings.allowThisIOSAppToConnect"
                : "settings.mobileSettings.allowThisBrowserToConnect",
            )
          : (device.displayName ?? device.name)}
      </legend>
      <p className="remote-muted">
        {t(
          device.clientKind === "ios"
            ? "settings.mobileSettings.clientKindIOS"
            : "settings.mobileSettings.clientKindWeb",
        )}
      </p>
      {!pending && device.clientKind === "ios" && (
        <p className="remote-muted">
          {t(
            device.pushRegistered
              ? "settings.mobileSettings.pushRegistered"
              : "settings.mobileSettings.pushUnregistered",
          )}
        </p>
      )}
      {pending && (
        <p className="remote-muted">
          {t("settings.mobileSettings.onceConfirmedItCanAccessTheProjects")}
        </p>
      )}
      <div className="remote-fingerprint">
        <strong>
          <ShieldCheck size={18} />
          {t("settings.mobileSettings.checkTheFullDeviceFingerprint")}
        </strong>
        <code>{id}</code>
        <p>{t("settings.mobileSettings.compareEveryCharacterWithTheFingerprintShown")}</p>
      </div>
      {!pending && (
        <p>
          {device.status === "reviewRequired"
            ? t("settings.mobileSettings.thisOlderDeviceNeedsReviewAndIs")
            : device.status === "revoked"
              ? t("settings.mobileSettings.revoked")
              : t("settings.mobileSettings.authorizedRevisionValue", { value0: device.revision })}
        </p>
      )}
      {device.status !== "revoked" && (
        <>
          <div className="remote-project-scope">
            <h3>{t("settings.mobileSettings.chooseAccessibleProjects")}</h3>
            <p className="remote-muted">
              {t("settings.mobileSettings.authorizeOnlyTheProjectsNeededTheDevice")}
            </p>
            {projects.map((project) => (
              <label className="remote-project-choice" key={project.id}>
                <Input
                  unstyled
                  data-slot={undefined}
                  type="checkbox"
                  checked={selected.includes(project.id)}
                  onChange={(event) =>
                    setSelected((old) =>
                      event.target.checked
                        ? [...old, project.id]
                        : old.filter((value) => value !== project.id),
                    )
                  }
                />
                {project.name ?? project.root.split("/").at(-1)}
              </label>
            ))}
            {!projects.length && <p>{t("settings.mobileSettings.addAProjectInTheDesktopApp")}</p>}
          </div>
          <fieldset
            className="remote-permissions"
            aria-label={t("settings.mobileSettings.permissionPreset")}
          >
            <legend>{t("settings.mobileSettings.accessPermissions")}</legend>
            <div className="remote-permission-options">
              {(
                [
                  {
                    value: "Observer",
                    title: t("settings.mobileSettings.viewOnly"),
                    description: t(
                      "settings.mobileSettings.viewConversationsReviewResultsAndChanges",
                    ),
                  },
                  {
                    value: "Operator",
                    title: t("settings.mobileSettings.canOperate"),
                    description: t("settings.mobileSettings.alsoSendStopAnswerAndPauseTasks"),
                  },
                ] satisfies { value: typeof preset; title: string; description: string }[]
              ).map((option) => (
                <label key={option.value} data-selected={preset === option.value}>
                  <Input
                    unstyled
                    data-slot={undefined}
                    type="radio"
                    name={`remote-preset-${id}`}
                    value={option.value}
                    checked={preset === option.value}
                    aria-label={option.title}
                    onChange={() => setPreset(option.value)}
                  />
                  <span>
                    <strong>{option.title}</strong>
                    <small>{option.description}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="remote-muted">
            {t("settings.mobileSettings.eachOperationStillRequiresPermissionAndSession")}
          </p>
          <div className="remote-grant-actions">
            <Button
              disabled={busy || !selected.length}
              onClick={() =>
                void run({
                  operation: pending ? "approve" : "updateGrant",
                  id,
                  projects: selected,
                  preset,
                })
              }
            >
              {pending
                ? t("settings.mobileSettings.confirmPairing")
                : t("settings.mobileSettings.saveAccess")}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void run({ operation: pending ? "reject" : "revoke", id })}
            >
              {pending
                ? t("settings.mobileSettings.rejectPairing")
                : t("settings.mobileSettings.revokeAccess")}
            </Button>
          </div>
        </>
      )}
    </fieldset>
  );
}
