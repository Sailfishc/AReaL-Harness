import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { Translate } from "./i18n/IntlProvider.js";
import { TaskCatalogNotice } from "./TaskCatalogNotice.js";

vi.mock("./i18n/IntlProvider.js", async () => {
  const { createIntl } = await import("react-intl");
  const { catalogs } = await import("./i18n/messages.js");
  const intl = createIntl({ locale: "en", messages: catalogs.en });
  const t: Translate = (id, values) => intl.formatMessage({ id }, values);
  return { useI18n: () => ({ t }) };
});

const render = (props: Partial<ComponentProps<typeof TaskCatalogNotice>> = {}) =>
  renderToStaticMarkup(
    createElement(TaskCatalogNotice, {
      projectName: "Owning project",
      published: true,
      taskCount: 1,
      disabled: false,
      onUpdate: () => {
        throw new Error("Rendering must not open a project");
      },
      ...props,
    }),
  );

describe("TaskCenter catalog diagnosis", () => {
  it("treats a published snapshot as a normal saved record without read-time freshness", () => {
    const markup = render();
    expect(markup).toContain("Owning project");
    expect(markup).toContain("Last saved record");
    expect(markup).toContain("Open project to update");
    expect(markup).not.toContain("task-catalog-error");
    expect(markup).not.toMatch(/unconfirmed|Read at|Invalid Date/);
  });

  it("does not hint about snapshots for projects with no tasks", () => {
    expect(render({ taskCount: 0 })).toBe("");
  });

  it("keeps real errors visible even when the owning project has no tasks", () => {
    const failed = render({ taskCount: 0, error: "Catalog read failed: denied" });
    expect(failed).toContain("Owning project");
    expect(failed).toContain("Catalog read failed: denied");
    expect(failed).toContain("task-catalog-error");
    expect(render({ projectName: "Other project", published: false })).toBe("");
  });

  it("keeps update disabled during reads or disconnection", () => {
    expect(render({ disabled: true })).toContain('disabled=""');
  });
});
