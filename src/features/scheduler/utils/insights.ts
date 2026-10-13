import type { Equipment, MaintenanceEntry } from "../types";

export interface MaterialSummary {
  key: string;
  name: string;
  reference?: string;
  unit: string;
  quantity: number;
  cost: number;
  taskCount: number;
}

/** Sums the per-task materials into one row per name + reference + unit. */
export function summarizeMaterials(entries: MaintenanceEntry[]): MaterialSummary[] {
  const rows = new Map<string, MaterialSummary & { taskIds: Set<string> }>();
  for (const entry of entries) {
    for (const material of entry.materials ?? []) {
      const key = `${material.name.toLowerCase()}|${material.reference ?? ""}|${material.unit}`;
      const row = rows.get(key) ?? {
        key,
        name: material.name,
        reference: material.reference ?? undefined,
        unit: material.unit,
        quantity: 0,
        cost: 0,
        taskCount: 0,
        taskIds: new Set<string>(),
      };
      const quantity = Number(material.quantity);
      row.quantity += quantity;
      row.cost += quantity * Number(material.price ?? 0);
      row.taskIds.add(entry.id);
      row.taskCount = row.taskIds.size;
      rows.set(key, row);
    }
  }
  return [...rows.values()]
    .map((row) => ({
      key: row.key,
      name: row.name,
      reference: row.reference,
      unit: row.unit,
      quantity: row.quantity,
      cost: row.cost,
      taskCount: row.taskCount,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const isOpen = (entry: MaintenanceEntry) => entry.status !== "completed";

export function summarizeMetrics(
  entries: MaintenanceEntry[],
  equipment: Equipment[],
  now: number,
) {
  const count = (predicate: (entry: MaintenanceEntry) => boolean) =>
    entries.filter(predicate).length;
  const open = entries.filter(isOpen);
  const completed = count((e) => e.status === "completed");

  return {
    total: entries.length,
    completionRate: entries.length
      ? Math.round((completed / entries.length) * 100)
      : 0,
    overdue: open.filter((e) => +new Date(e.endTime) < now).length,
    upcoming: open.filter((e) => +new Date(e.endTime) >= now).length,
    byType: {
      preventive: count((e) => e.type === "PREVENTIVE"),
      corrective: count((e) => e.type === "CORRECTIVE"),
      inspection: count((e) => e.type === "INSPECTION"),
    },
    byStatus: {
      scheduled: count((e) => e.status === "scheduled"),
      inProgress: count((e) => e.status === "in-progress"),
      completed,
    },
    topEquipment: equipment
      .map((item) => ({
        label: item.name,
        value: entries.filter((e) => e.equipmentId === item.id).length,
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5),
  };
}

/** Upcoming = not completed and not yet finished; last = most recently completed. */
export function summarizeEquipmentMaintenance(
  equipmentId: string,
  entries: MaintenanceEntry[],
  now: number,
) {
  const own = entries.filter((e) => e.equipmentId === equipmentId);
  const upcoming = own
    .filter((e) => isOpen(e) && +new Date(e.endTime) >= now)
    .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime));
  const last = own
    .filter((e) => e.status === "completed")
    .sort((a, b) => +new Date(b.endTime) - +new Date(a.endTime))[0];
  return {
    upcomingCount: upcoming.length,
    next: upcoming[0]?.startTime,
    last: last?.endTime,
  };
}
