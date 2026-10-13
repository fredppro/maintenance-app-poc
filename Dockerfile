FROM node:24-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66 AS runtime-base

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get upgrade -y --no-install-recommends \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

FROM runtime-base AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable \
    && corepack prepare pnpm@12.9.1 --activate

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN DATABASE_URL="postgresql://image-build:image-build@127.0.0.1:5432/image_build?schema=public" \
    MIGRATION_DATABASE_URL="postgresql://image-build:image-build@127.0.0.1:5432/image_build?schema=public" \
    pnpm install --frozen-lockfile

FROM deps AS builder

COPY . .
RUN DATABASE_URL="postgresql://image-build:image-build@127.0.0.1:5432/image_build?schema=public" \
    MIGRATION_DATABASE_URL="postgresql://image-build:image-build@127.0.0.1:5432/image_build?schema=public" \
    BETTER_AUTH_SECRET="image-build-only-secret-not-for-runtime-use-000000000000" \
    BETTER_AUTH_URL="http://localhost:3000" \
    CONTAINER_BUILD="true" \
    pnpm build

FROM runtime-base AS runner

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME="0.0.0.0"

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

WORKDIR /app

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma/generated ./prisma/generated

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
