import { PrismaClient } from "../generated/prisma/client";
import { PrismaNeon } from '@prisma/adapter-neon'
import { toClientSafe } from "./serializer";

export const prismaClientSingleton = () => {
  const connectionString = process.env.DATABASE_URL?.trim();
  
  if (!connectionString) {
    throw new Error('DATABASE_URL is missing');
  }

  const adapter = new PrismaNeon({ connectionString });

  const client = new PrismaClient({ 
    adapter,
    log: ['query', 'error', 'warn'],
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
}

declare global {
  var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>
}

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma
