import { PrismaPg } from "@prisma/adapter-pg";
import { toClientSafe } from "./serializer";
import { PrismaClient } from "../../prisma/generated/prisma/client";

export const prismaClientSingleton = () => {
  const connectionString = process.env.DATABASE_URL?.trim();

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

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>;
}

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

export type DB = typeof prisma;

if (process.env.NODE_ENV !== "production") globalThis.prismaGlobal = prisma;

export default prisma