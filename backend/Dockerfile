# Realtime backend (Express + WebSocket + node-pty).
# Must run on a long-lived container host (Render, Railway, Fly.io, etc.).
# It is intentionally NOT deployable to a stateless serverless runtime because
# a live PTY session requires a persistent process.

FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
EXPOSE 4000
CMD ["node", "dist/index.js"]
