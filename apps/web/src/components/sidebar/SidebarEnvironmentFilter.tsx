import { MonitorCogIcon } from "lucide-react";

import { useEnvironmentIdentities, useEnvironmentMachines } from "../../state/environments";
import { EnvironmentMachineIcon } from "../EnvironmentMachineIcon";
import {
  Menu,
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { SidebarHeaderIconButton } from "./SidebarThreadHeader";

export function SidebarEnvironmentFilter({
  excludedEnvironmentIds,
  onExcludedEnvironmentIdsChange,
}: {
  excludedEnvironmentIds: readonly string[];
  onExcludedEnvironmentIdsChange: (ids: readonly string[]) => void;
}) {
  const environments = useEnvironmentIdentities();
  const machineById = useEnvironmentMachines();
  const filtered = environments.some((environment) =>
    excludedEnvironmentIds.includes(environment.environmentId),
  );

  return (
    <Menu>
      <MenuTrigger render={<SidebarHeaderIconButton label="Filter by environment" />}>
        <MonitorCogIcon className="size-4" />
        {filtered ? (
          <span className="absolute right-1 top-1 size-1.5 rounded-full bg-primary" />
        ) : null}
      </MenuTrigger>
      <MenuPopup align="start" aria-label="Filter by environment">
        <MenuGroup>
          <MenuGroupLabel>Environments</MenuGroupLabel>
          <MenuItem closeOnClick={false} onClick={() => onExcludedEnvironmentIdsChange([])}>
            Select All
          </MenuItem>
          <MenuSeparator />
          {environments.map((environment) => (
            <MenuCheckboxItem
              key={environment.environmentId}
              checked={!excludedEnvironmentIds.includes(environment.environmentId)}
              closeOnClick={false}
              title="Right-click to show only this environment"
              onCheckedChange={(checked) =>
                onExcludedEnvironmentIdsChange(
                  checked
                    ? excludedEnvironmentIds.filter((id) => id !== environment.environmentId)
                    : [...excludedEnvironmentIds, environment.environmentId],
                )
              }
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onExcludedEnvironmentIdsChange(
                  environments
                    .filter((candidate) => candidate.environmentId !== environment.environmentId)
                    .map((candidate) => candidate.environmentId),
                );
              }}
            >
              <span className="flex min-w-0 items-center gap-2">
                <EnvironmentMachineIcon
                  kind={machineById.get(environment.environmentId) ?? "server"}
                />
                <span className="truncate">{environment.label}</span>
              </span>
            </MenuCheckboxItem>
          ))}
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}
