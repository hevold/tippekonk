# Desken — production image (multi-stage, Next.js standalone output)
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1 \
    UPLOAD_DIR=/app/data/uploads PGLITE_DIR=/app/data/pglite
RUN groupadd -r desken && useradd -r -g desken -d /app desken \
    && mkdir -p /app/data && chown -R desken:desken /app
COPY --from=build --chown=desken:desken /app/public ./public
COPY --from=build --chown=desken:desken /app/.next/standalone ./
COPY --from=build --chown=desken:desken /app/.next/static ./.next/static
COPY --from=build --chown=desken:desken /app/drizzle ./drizzle
USER desken
EXPOSE 3000
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
