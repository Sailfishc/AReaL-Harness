import { describe, expect, it } from "vite-plus/test";
import { statusTarget } from "./conversationPresentation.js";

describe("statusTarget", () => {
  it("keeps a one-line command as is, with collapsed whitespace", () => {
    expect(statusTarget("pnpm   --dir clients/gui\ttypecheck")).toBe(
      "pnpm --dir clients/gui typecheck",
    );
  });

  it("stops a heredoc at its opening marker", () => {
    const command = "python3 - <<'PY'\nimport pathlib,json\nprint('INDEX')\nPY";
    expect(statusTarget(command)).toBe("python3 - <<'PY'");
    expect(statusTarget('cat <<-"EOF" > out.txt\nbody\nEOF')).toBe('cat <<-"EOF"');
    expect(statusTarget("bash <<EOS\necho hi\nEOS")).toBe("bash <<EOS");
  });

  it("marks a multi-line command that is not a heredoc as truncated", () => {
    expect(statusTarget("\n\ncd app &&\n  pnpm test\n")).toBe("cd app && …");
  });

  it("returns undefined for empty targets", () => {
    expect(statusTarget(undefined)).toBeUndefined();
    expect(statusTarget("  \n ")).toBeUndefined();
  });
});
