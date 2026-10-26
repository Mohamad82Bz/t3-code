import { describe, expect, it } from "vite-plus/test";
import { codexCommandTitle } from "./codexCommandTitle.ts";

describe("codexCommandTitle", () => {
  it("uses Codex read, list and search actions instead of shell wrappers", () => {
    expect(
      codexCommandTitle("powershell.exe -Command ...", [
        {
          type: "read",
          command: "Get-Content AGENTS.md",
          name: "AGENTS.md",
          path: "C:\\work\\AGENTS.md",
        },
      ]),
    ).toBe("Read AGENTS.md");
    expect(
      codexCommandTitle("wrapped", [{ type: "listFiles", command: "ls skills", path: "skills" }]),
    ).toBe("List files in skills");
    expect(
      codexCommandTitle("wrapped", [
        { type: "search", command: "rg impeccable skills", query: "impeccable", path: "skills" },
      ]),
    ).toBe("Search for “impeccable” in skills");
  });

  it("reads a leading title from the original payload and preserves the command", () => {
    const command = '# t3-title: Migrate global instructions\r\n@"\nimport pathlib\n"@ | python -';
    expect(codexCommandTitle("powershell.exe -Command ...", [{ type: "unknown", command }])).toBe(
      "Migrate global instructions",
    );
    expect(command).toContain("import pathlib");
  });

  it("does not mistake script content for a title", () => {
    for (const command of [
      "python - <<'EOF'\n# t3-title: Not metadata\nEOF",
      'echo "# t3-title: Not metadata"',
    ]) {
      expect(codexCommandTitle(command, [])).not.toContain("Not metadata");
    }
  });

  it.each([
    ["git status --short", "Run git status"],
    ["npm test", "Run npm test"],
    ['python -c "print(1)"', "Run Python script"],
    ["@'\nimport pathlib\n'@ | python -", "Run Python script"],
    ["Get-Content -Raw settings.json", "Run PowerShell script"],
    ["$p = 'data'; Get-Content $p", "Run PowerShell script"],
    ['node -e "console.log(1)"', "Run node script"],
    ["", "Run command"],
  ])("labels %s without displaying inline code", (command, expected) => {
    expect(codexCommandTitle("wrapped", [{ type: "unknown", command }])).toBe(expected);
  });

  it("keeps mixed and multiple actions visible without unbounded labels", () => {
    expect(
      codexCommandTitle("wrapped", [
        { type: "read", command: "cat a", path: "a", name: "a" },
        { type: "unknown", command: "npm test" },
        { type: "read", command: "cat b", path: "b", name: "b" },
      ]),
    ).toBe("Read a; Run npm test (+1 more)");
    expect(
      codexCommandTitle(`# t3-title: ${"long ".repeat(100)}\necho ok`, []).length,
    ).toBeLessThanOrEqual(100);
  });
});
