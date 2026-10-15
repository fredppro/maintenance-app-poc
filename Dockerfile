FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS runtime-base

RUN apk upgrade --no-cache \
    && apk add --no-cache openssl

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

FROM deps AS migrator

ENV NODE_ENV=production \
    HOME=/tmp

RUN addgroup -S -g 1001 nodejs \
    && adduser -S -u 1001 -G nodejs nextjs \
    && DATABASE_URL="postgresql://maintenance_app:maintenance_app@127.0.0.1:5432/image_build?schema=public" \
        MIGRATION_DATABASE_URL="postgresql://maintenance_app:maintenance_app@127.0.0.1:5432/image_build?schema=public" \
        pnpm prune --prod \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

COPY src/lib/database-url.ts ./src/lib/database-url.ts
COPY scripts/db/provision-runtime-role.ts scripts/db/verify-runtime-role.ts ./scripts/db/
COPY docker/migrate-entrypoint.sh ./docker/migrate-entrypoint.sh

USER nextjs

ENTRYPOINT ["sh", "docker/migrate-entrypoint.sh"]

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

RUN addgroup -S -g 1001 nodejs \
    && adduser -S -u 1001 -G nodejs nextjs \
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
