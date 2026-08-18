# Build stage
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Copy workspace definition and install dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json .prettierrc ./
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY apps/api/package.json apps/api/tsconfig.json apps/api/nest-cli.json ./apps/api/
COPY packages/infra ./packages/infra/

RUN pnpm install --frozen-lockfile

# Copy source and build
COPY packages/shared/src ./packages/shared/src
COPY apps/api/src ./apps/api/src
COPY apps/api/prisma ./apps/api/prisma

RUN pnpm --filter @brandpilot/shared build
RUN pnpm --filter @brandpilot/api db:generate
RUN pnpm --filter @brandpilot/api build

# Production stage
FROM node:20-alpine AS production
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/apps/api/package.json /app/apps/api/tsconfig.json /app/apps/api/nest-cli.json ./apps/api/
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma

RUN pnpm install --frozen-lockfile --prod && pnpm --filter @brandpilot/api db:generate

WORKDIR /app/apps/api
EXPOSE 3000

CMD ["node", "dist/main"]
