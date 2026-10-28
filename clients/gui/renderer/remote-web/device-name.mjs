// 配对时发给桌面的设备名：浏览器 · 系统，例如 “Chrome · macOS”。只用于桌面设备列表展示。
const browsers = [
  [/Edg\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/CriOS\/|Chrome\//, "Chrome"],
  [/Safari\//, "Safari"],
];
const systems = [
  [/iPhone/, "iOS"],
  [/iPad/, "iPadOS"],
  [/Android/, "Android"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Windows/, "Windows"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
];

/** @param {string} userAgent @param {number} [touchPoints] */
export function browserDeviceName(userAgent, touchPoints = 0) {
  const browser = browsers.find(([pattern]) => pattern.test(userAgent))?.[1] ?? "浏览器";
  // iPadOS 13+ 默认上报桌面版 Safari 的 UA，只能靠触点数区分。
  const system =
    /Macintosh/.test(userAgent) && touchPoints > 1
      ? "iPadOS"
      : systems.find(([pattern]) => pattern.test(userAgent))?.[1];
  return system ? `${browser} · ${system}` : browser;
}
