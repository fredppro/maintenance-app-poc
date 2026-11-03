export const REQUIRED_RESERVATION_FUNCTIONS = [
  "reserve_tenant_export_temp(text,text,text)",
  "heartbeat_tenant_export_temp(text,text,text)",
  "release_tenant_export_temp(text,text,text)",
  "is_tenant_export_temp_active(text,text)",
] as const;

export type SecurityDefinerFunction = {
  signature: string;
  hasSafeSearchPath: boolean;
  publicCanExecute: boolean;
  runtimeCanExecute: boolean;
};

const requiredFunctions = new Set<string>(REQUIRED_RESERVATION_FUNCTIONS);

export function getSecurityDefinerFunctionIssues(
  functions: readonly SecurityDefinerFunction[],
): string[] {
  const issues: string[] = [];
  const found = new Set<string>();

  for (const fn of functions) {
    if (!requiredFunctions.has(fn.signature)) {
      issues.push(`unexpected SECURITY DEFINER function ${fn.signature}`);
      continue;
    }

    found.add(fn.signature);
    if (!fn.hasSafeSearchPath) {
      issues.push(`${fn.signature} has no fixed search_path`);
    }
    if (fn.publicCanExecute) {
      issues.push(`${fn.signature} is executable by PUBLIC`);
    }
    if (!fn.runtimeCanExecute) {
      issues.push(`${fn.signature} is not executable by the runtime role`);
    }
  }

  for (const signature of REQUIRED_RESERVATION_FUNCTIONS) {
    if (!found.has(signature)) {
      issues.push(`required SECURITY DEFINER function is missing: ${signature}`);
    }
  }

  return issues;
}
