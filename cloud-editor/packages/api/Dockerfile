# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH"
RUN corepack enable \
    && corepack prepare pnpm@10.15.0 --activate \
    && pnpm config set store-dir /pnpm/store --global
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/api/package.json ./packages/api/package.json
COPY packages/realtime/package.json ./packages/realtime/package.json
COPY packages/runner/package.json ./packages/runner/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @cloud-editor/api...

FROM deps AS development
ENV NODE_ENV=development
COPY packages/shared ./packages/shared
COPY packages/api ./packages/api
RUN pnpm --filter @cloud-editor/shared build
RUN chown -R node:node /app
USER node
EXPOSE 4000
CMD ["pnpm", "--filter", "@cloud-editor/api", "dev"]

FROM deps AS build
COPY packages/shared ./packages/shared
COPY packages/api ./packages/api
RUN pnpm --filter @cloud-editor/shared build \
    && pnpm --filter @cloud-editor/api build \
    && pnpm --filter @cloud-editor/api deploy --prod --legacy /deploy/api

FROM node:20-alpine AS runtime
RUN apk add --no-cache dumb-init
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /deploy/api ./
USER node
EXPOSE 4000
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
