// Class options for the shared dropdown: grouped like the iRO simulator, with
// job icons and a search box that matches the class name or ID.
import { useMemo } from "react";
import { GROUP_ORDER, jobIconUrl } from "../core/state";
import { t } from "../i18n";
import { useAppState, useDb, useDispatch } from "../state/AppStateContext";
import { Select } from "./Select";

export function ClassSelect() {
  const db = useDb();
  const state = useAppState();
  const dispatch = useDispatch();
  const options = useMemo(() => GROUP_ORDER.flatMap((group) =>
    db.classes.filter((c) => c.group === group).map((c) => ({
      value: c.id,
      label: c.name,
      icon: jobIconUrl(c.id),
      group: t.groups[group] ?? group,
    })),
  ), [db.classes]);

  return (
    <Select
      value={state.classId}
      onChange={(classId) => dispatch({ type: "setClass", classId })}
      options={options}
      searchPlaceholder={t.classSearch}
      emptyMessage={t.classSearchEmpty}
    />
  );
}
