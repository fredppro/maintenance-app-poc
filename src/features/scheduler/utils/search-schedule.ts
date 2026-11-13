import type { Equipment, MaintenanceEntry } from "../types";

export function searchSchedule(
  entries: MaintenanceEntry[],
  equipment: Equipment[],
  query: string,
) {
  const search = query.trim().toLowerCase();
  if (!search) return { entries, equipment };

  const matchingEquipmentIds = new Set(
    equipment
      .filter((item) =>
        [item.name, item.category].some((value) =>
          value?.toLowerCase().includes(search),
        ),
      )
      .map((item) => item.id),
  );
  const matchingEntries = entries.filter(
    (entry) =>
      matchingEquipmentIds.has(entry.equipmentId) ||
      entry.title.toLowerCase().includes(search) ||
      entry.assignments?.some(({ worker }) =>
        [worker.name, worker.email].some((value) =>
          value?.toLowerCase().includes(search),
        ),
      ),
  );
  const matchingTaskEquipmentIds = new Set(
    matchingEntries.map((entry) => entry.equipmentId),
  );

  return {
    entries: matchingEntries,
    equipment: equipment.filter(
      (item) =>
        matchingEquipmentIds.has(item.id) ||
        matchingTaskEquipmentIds.has(item.id),
    ),
  };
}
