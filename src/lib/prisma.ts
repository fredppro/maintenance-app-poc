import { PrismaPg } from "@prisma/adapter-pg";
import { toClientSafe } from "./serializer";
import { resolveRuntimeDatabaseUrl } from "./database-url";
import { PrismaClient } from "../../prisma/generated/prisma/client";

export const prismaClientSingleton = () => {
  const connectionString = resolveRuntimeDatabaseUrl();

  if (!connectionString) {
    throw new Error("DATABASE_URL is missing");
  }

  const adapter = new PrismaPg({ connectionString });

  const client = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "production" ? ["error"] : ["query", "error", "warn"],
  });

  return client.$extends({
    query: {
      $allModels: {
        async $allOperations({ query, args }) {
          const result = await query(args);
          return toClientSafe(result);
        },
      },
    },
  });
};

type BaseClient = ReturnType<typeof prismaClientSingleton>;

const TENANT_SETTING = "app.org_id";

const SOFT_DELETE_MODELS = new Set(["Equipment", "MaintenanceTask", "Worker"]);
const FILTERED_OPERATIONS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
]);

/**
 * Soft-deletable models hide trashed rows unless the query asks about
 * `deletedAt` explicitly (trash listings, restore, purge).
 */
export const hideTrashed = <A>(model: string, operation: string, args: A): A => {
  if (!SOFT_DELETE_MODELS.has(model) || !FILTERED_OPERATIONS.has(operation)) return args;
  const input = (args ?? {}) as { where?: Record<string, unknown> };
  if (input.where && "deletedAt" in input.where) return args;
  return { ...input, where: { ...input.where, deletedAt: null } } as A;
};

type TenantTransaction = Parameters<Parameters<BaseClient["$transaction"]>[0]>[0];

export async function runTenantOperation(
  tx: TenantTransaction,
  organizationId: string,
  model: string,
  operation: string,
  args: unknown,
) {
  await tx.$executeRaw`SELECT set_config(${TENANT_SETTING}, ${organizationId}, true)`;

  const delegateName = model.charAt(0).toLowerCase() + model.slice(1);
  const delegate = Reflect.get(tx, delegateName);
  if (
    !delegate ||
    (typeof delegate !== "object" && typeof delegate !== "function")
  ) {
    throw new Error(`Unknown Prisma model delegate: ${model}`);
  }

  const modelOperation = Reflect.get(delegate, operation);
  if (typeof modelOperation !== "function") {
    throw new Error(`Unknown Prisma operation ${operation} for model ${model}`);
  }

  return Reflect.apply(modelOperation, delegate, [
    hideTrashed(model, operation, args),
  ]);
}

/**
 * Returns a client whose every query runs in a transaction that first sets
 * `app.org_id`, the value the row-level-security policies compare against.
 * `transaction` is the interactive form, for multi-statement work; it does not
 * hide soft-deleted rows, so queries inside it must filter `deletedAt` themselves.
 */
export const createTenantClient = (base: BaseClient, organizationId: string) => {
  if (!organizationId) {
    throw new Error("A tenant client requires an organizationId");
  }

  return base.$extends({
    client: {
      transaction<T>(fn: (tx: Parameters<Parameters<BaseClient["$transaction"]>[0]>[0]) => Promise<T>) {
        return base.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config(${TENANT_SETTING}, ${organizationId}, true)`;
          return fn(tx);
        });
      },
    },
    query: {
      $allModels: {
        async $allOperations({ model, operation, args }) {
          if (!model) {
            throw new Error("A tenant-scoped model operation requires a model name");
          }

          return base.$transaction((tx) =>
            runTenantOperation(tx, organizationId, model, operation, args),
          );
        },
      },
    },
  });
};

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

export type DB = typeof prisma;
export type TenantDb = ReturnType<typeof createTenantClient>;

export const forTenant = (organizationId: string): TenantDb =>
  createTenantClient(prisma, organizationId);

if (process.env.NODE_ENV !== "production") globalThis.prismaGlobal = prisma;

export default prisma