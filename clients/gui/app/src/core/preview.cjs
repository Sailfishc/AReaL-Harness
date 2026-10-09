"use strict";

function webUrl(value) {
  const text = String(value ?? "").trim();
  const explicit =
    /^[a-z][a-z\d+.-]*:/i.test(text) &&
    !/^(localhost|[\d.]+):\d+(\/|$)/i.test(text);
  const url = new URL(
    explicit
      ? text
      : `${/^(localhost|127\.|\[::1\])/.test(text) ? "http" : "https"}://${text}`,
  );
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("预览仅支持不含凭据的 HTTP(S) 地址");
  return url.href;
}
function boundsWithinWindow(value, size) {
  if (
    !value ||
    ["x", "y", "width", "height"].some((key) => !Number.isFinite(value[key]))
  )
    throw new Error("无效预览区域");
  const x = Math.max(0, Math.round(value.x)),
    y = Math.max(0, Math.round(value.y));
  return {
    x: Math.min(x, size[0]),
    y: Math.min(y, size[1]),
    width: Math.max(0, Math.min(Math.round(value.width), size[0] - x)),
    height: Math.max(0, Math.min(Math.round(value.height), size[1] - y)),
  };
}
/** 网页没有 preload/Node/产品 IPC；任务拥有独立内容与导航历史。 */
class CorePreview {
  constructor(window, WebContentsView, owns, preferences = () => ({})) {
    this.window = window;
    this.WebContentsView = WebContentsView;
    this.owns = owns;
    this.preferences = preferences;
    this.pages = new Map();
    this.owner = null;
    this.view = null;
  }
  dispose() {
    for (const page of this.pages.values()) {
      this.window.contentView.removeChildView(page.view);
      page.view.webContents.close();
    }
    this.pages.clear();
    this.view = null;
    this.owner = null;
  }
  state(page = this.pages.get(this.owner)) {
    const c = page?.view.webContents;
    return {
      url: c?.getURL() || page?.url || "",
      title: c?.getTitle() ?? "",
      loading: c?.isLoading() ?? false,
      canGoBack: c?.navigationHistory.canGoBack() ?? false,
      canGoForward: c?.navigationHistory.canGoForward() ?? false,
      error: page?.error ?? "",
    };
  }
  create(owner) {
    const view = new this.WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        partition: `areal-preview-${crypto.randomUUID()}`,
      },
    });
    const page = { view, error: "", url: "" },
      c = view.webContents;
    c.setWindowOpenHandler(() => ({ action: "deny" }));
    c.session.setPermissionRequestHandler((_contents, _permission, respond) =>
      respond(false),
    );
    c.session.setPermissionCheckHandler(() => false);
    const navigate = (event, url) => {
      try {
        webUrl(url);
      } catch {
        event.preventDefault();
      }
    };
    c.on("will-navigate", navigate);
    c.on("will-redirect", navigate);
    c.on("will-frame-navigate", (event) => {
      try {
        webUrl(event.url);
      } catch {
        event.preventDefault();
      }
    });
    c.on("did-start-navigation", (_event, url, _inPlace, main) => {
      if (main) {
        page.url = url;
        page.error = "";
      }
    });
    c.on("did-fail-load", (_event, code, message, url, main) => {
      if (main && code !== -3 && url === page.url) page.error = message;
    });
    this.window.contentView.addChildView(view);
    view.setVisible(false);
    this.pages.set(owner, page);
    return page;
  }
  async command(request) {
    if (!request || typeof request !== "object")
      throw new Error("无效预览操作");
    const owner = `${request.projectId}:${request.threadId ?? ""}`;
    if (request.operation === "hide") {
      if (!request.projectId || this.owner === owner)
        this.view?.setVisible(false);
      return this.state(this.pages.get(owner));
    }
    if (!this.owns(request.projectId, request.threadId))
      throw new Error("请选择有效任务");
    if (request.operation === "openLink") {
      const url = webUrl(request.url), host = new URL(url).hostname;
      const local = host === 'localhost' || host.endsWith('.localhost') || host === '[::1]' || /^127\./.test(host);
      const settings = this.preferences();
      const destination = local ? settings.browserLocalTarget ?? 'internal' : settings.browserLinkTarget ?? 'external';
      if (destination === 'external') await require('electron').shell.openExternal(url);
      // Renderer may have switched tasks while awaiting native handoff. It
      // chooses whether to reveal an internal page; this read creates none.
      return { destination, url };
    }
    const operations = [
      "show",
      "navigate",
      "back",
      "forward",
      "reload",
      "stop",
      "state",
      "external",
      "devtools",
    ];
    if (!operations.includes(request.operation))
      throw new Error("不支持的预览操作");
    const target =
      request.operation === "navigate" ? webUrl(request.url) : null;
    let page = this.pages.get(owner);
    if (!page && ["show", "navigate"].includes(request.operation))
      page = this.create(owner);
    if (!page) return this.state(null);
    const c = page.view.webContents;
    if (request.bounds)
      page.view.setBounds(
        boundsWithinWindow(request.bounds, this.window.getContentSize()),
      );
    switch (request.operation) {
      case "show":
        if (this.owner !== owner) this.view?.setVisible(false);
        this.owner = owner;
        this.view = page.view;
        page.view.setVisible(request.visible !== false);
        break;
      case "navigate": {
        page.url = target;
        page.error = "";
        // Loading is observed through state; navigation completion cannot switch task ownership.
        void c.loadURL(target).catch((error) => {
          if (error.code !== "ERR_ABORTED" && page.url === target)
            page.error = error.message;
        });
        break;
      }
      case "back":
        if (c.navigationHistory.canGoBack()) c.navigationHistory.goBack();
        break;
      case "forward":
        if (c.navigationHistory.canGoForward()) c.navigationHistory.goForward();
        break;
      case "reload":
        page.error = "";
        if (c.getURL()) c.reload();
        else if (page.url)
          void c.loadURL(page.url).catch((error) => {
            if (error.code !== "ERR_ABORTED") page.error = error.message;
          });
        break;
      case "stop":
        c.stop();
        break;
      case "external":
        await require("electron").shell.openExternal(
          webUrl(c.getURL() || page.url),
        );
        break;
      case "devtools":
        c.openDevTools({ mode: "detach" });
        break;
    }
    return this.state(page);
  }
}
module.exports = { CorePreview, webUrl, boundsWithinWindow };
