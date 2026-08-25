import assert from "node:assert/strict";
import test, { describe } from "node:test";
import * as libActions from "./actions";
import * as schedulerActions from "@/features/scheduler/server/actions";
import * as workerActions from "@/features/worker/server/actions";

describe("lib/actions re-exports", () => {
  test("re-exports all scheduler actions for backward compatibility", () => {
    assert.strictEqual(libActions.getEquipment, schedulerActions.getEquipment);
    assert.strictEqual(libActions.addEquipment, schedulerActions.addEquipment);
    assert.strictEqual(libActions.updateEquipment, schedulerActions.updateEquipment);
    assert.strictEqual(libActions.deleteEquipment, schedulerActions.deleteEquipment);
    assert.strictEqual(libActions.getTasks, schedulerActions.getTasks);
    assert.strictEqual(libActions.createTask, schedulerActions.createTask);
    assert.strictEqual(libActions.updateTask, schedulerActions.updateTask);
    assert.strictEqual(libActions.deleteTask, schedulerActions.deleteTask);
    assert.strictEqual(libActions.moveTask, schedulerActions.moveTask);
  });

  test("re-exports all worker actions for backward compatibility", () => {
    assert.strictEqual(libActions.getWorkers, workerActions.getWorkers);
    assert.strictEqual(libActions.createWorker, workerActions.createWorker);
    assert.strictEqual(libActions.updateWorker, workerActions.updateWorker);
    assert.strictEqual(libActions.deleteWorker, workerActions.deleteWorker);
  });
});
