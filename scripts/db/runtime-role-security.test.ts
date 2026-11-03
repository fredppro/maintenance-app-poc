import { describe, expect, it } from "vitest";
import {
  getSecurityDefinerFunctionIssues,
  REQUIRED_RESERVATION_FUNCTIONS,
  type SecurityDefinerFunction,
} from "./runtime-role-security";

const safeFunctions: SecurityDefinerFunction[] =
  REQUIRED_RESERVATION_FUNCTIONS.map((signature) => ({
    signature,
    hasSafeSearchPath: true,
    publicCanExecute: false,
    runtimeCanExecute: true,
  }));

describe("runtime SECURITY DEFINER checks", () => {
  it("accepts only the restricted reservation functions", () => {
    expect(getSecurityDefinerFunctionIssues(safeFunctions)).toEqual([]);
  });

  it("rejects unexpected functions and unsafe execution grants", () => {
    expect(
      getSecurityDefinerFunctionIssues([
        ...safeFunctions,
        {
          signature: "unexpected_function(text)",
          hasSafeSearchPath: false,
          publicCanExecute: true,
          runtimeCanExecute: false,
        },
        {
          signature: REQUIRED_RESERVATION_FUNCTIONS[0],
          hasSafeSearchPath: false,
          publicCanExecute: true,
          runtimeCanExecute: false,
        },
      ]),
    ).toEqual([
      "unexpected SECURITY DEFINER function unexpected_function(text)",
      `${REQUIRED_RESERVATION_FUNCTIONS[0]} has no fixed search_path`,
      `${REQUIRED_RESERVATION_FUNCTIONS[0]} is executable by PUBLIC`,
      `${REQUIRED_RESERVATION_FUNCTIONS[0]} is not executable by the runtime role`,
    ]);
  });

  it("requires the complete reservation function set", () => {
    expect(getSecurityDefinerFunctionIssues([])).toEqual(
      REQUIRED_RESERVATION_FUNCTIONS.map(
        (signature) =>
          `required SECURITY DEFINER function is missing: ${signature}`,
      ),
    );
  });
});
