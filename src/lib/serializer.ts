type ClientPrimitive = string | number | boolean | null | undefined | Date;

export type ClientSafeValue =
  | ClientPrimitive
  | ClientSafeValue[]
  | { [key: string]: ClientSafeValue };

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

export const toNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof (value as { toNumber?: () => number }).toNumber === "function") {
    const parsed = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toClientSafeInternal = (value: unknown): ClientSafeValue => {
  if (value === null || value === undefined) {
    return value;
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  
  // Preserves the native Date instance intact for Next.js and Prisma
  if (value instanceof Date) {
    return value;
  }
  
  if (typeof (value as { toNumber?: () => number }).toNumber === "function") {
    const parsed = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof (value as { toJSON?: () => unknown }).toJSON === "function") {
    return toClientSafeInternal((value as { toJSON: () => unknown }).toJSON());
  }
  if (Array.isArray(value)) {
    return value.map(toClientSafeInternal);
  }
  if (isPlainObject(value)) {
    const result: Record<string, ClientSafeValue> = {};
    for (const [key, nested] of Object.entries(value)) {
      result[key] = toClientSafeInternal(nested);
    }
    return result;
  }
  return String(value);
};

export const toClientSafe = <T>(value: T): ClientSafeValue =>
  toClientSafeInternal(value);