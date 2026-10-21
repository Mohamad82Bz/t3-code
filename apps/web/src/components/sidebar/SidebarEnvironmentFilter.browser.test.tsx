import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

import { SidebarProvider } from "../ui/sidebar";
import { SidebarEnvironmentFilter } from "./SidebarEnvironmentFilter";

vi.mock("../../state/environments", () => ({
  useEnvironmentIdentities: () => [
    { environmentId: "local", label: "Local" },
    { environmentId: "wsl", label: "WSL" },
    { environmentId: "remote", label: "Remote" },
  ],
  useEnvironmentMachines: () => new Map(),
}));

function FilterHarness() {
  const [excluded, setExcluded] = useState<readonly string[]>([]);
  return (
    <SidebarEnvironmentFilter
      excludedEnvironmentIds={excluded}
      onExcludedEnvironmentIdsChange={setExcluded}
    />
  );
}

it("toggles environments without closing, isolates an unchecked environment on right click, and selects all", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const rows = () => [...document.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')];
  const checked = () => rows().map((row) => row.getAttribute("aria-checked"));
  try {
    await act(async () =>
      root.render(
        <SidebarProvider>
          <FilterHarness />
        </SidebarProvider>,
      ),
    );
    await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
    expect(checked()).toEqual(["true", "true", "true"]);

    await act(async () => rows()[1]!.click());
    expect(checked()).toEqual(["true", "false", "true"]);
    await act(async () => rows()[2]!.click());
    expect(checked()).toEqual(["true", "false", "false"]);

    await act(async () => {
      rows()[1]!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });
    expect(checked()).toEqual(["false", "true", "false"]);

    await act(async () => rows()[1]!.click());
    expect(checked()).toEqual(["false", "false", "false"]);
    await act(async () => document.querySelector<HTMLElement>('[role="menuitem"]')!.click());
    expect(checked()).toEqual(["true", "true", "true"]);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
