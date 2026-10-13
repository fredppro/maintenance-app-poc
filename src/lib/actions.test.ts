import { describe, expect, it } from "vitest";
import * as libActions from "./actions";
import * as schedulerActions from "@/features/scheduler/server/actions";
import * as workerActions from "@/features/worker/server/actions";

describe("lib/actions re-exports", () => {
  it("re-exports all scheduler actions for backward compatibility", () => {
    expect(libActions.getEquipment).toBe(schedulerActions.getEquipment);
    expect(libActions.addEquipment).toBe(schedulerActions.addEquipment);
    expect(libActions.updateEquipment).toBe(schedulerActions.updateEquipment);
    expect(libActions.deleteEquipment).toBe(schedulerActions.deleteEquipment);
    expect(libActions.getTasks).toBe(schedulerActions.getTasks);
    expect(libActions.createTask).toBe(schedulerActions.createTask);
    expect(libActions.updateTask).toBe(schedulerActions.updateTask);
    expect(libActions.deleteTask).toBe(schedulerActions.deleteTask);
    expect(libActions.moveTask).toBe(schedulerActions.moveTask);
  });

  it("re-exports all worker actions for backward compatibility", () => {
    expect(libActions.getWorkers).toBe(workerActions.getWorkers);
    expect(libActions.createWorker).toBe(workerActions.createWorker);
    expect(libActions.updateWorker).toBe(workerActions.updateWorker);
    expect(libActions.deleteWorker).toBe(workerActions.deleteWorker);
  });
});
