# Use official lightweight Bun base image
FROM oven/bun:1.4-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Build application
FROM base AS builder
ARG PUBLIC_SUPABASE_URL
ARG PUBLIC_SUPABASE_ANON_KEY
ARG PUBLIC_SENTRY_DSN
ENV PUBLIC_SUPABASE_URL=$PUBLIC_SUPABASE_URL
ENV PUBLIC_SUPABASE_ANON_KEY=$PUBLIC_SUPABASE_ANON_KEY
ENV PUBLIC_SENTRY_DSN=$PUBLIC_SENTRY_DSN

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

# Production runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./
COPY --from=deps /app/node_modules ./node_modules

EXPOSE 3000
CMD ["bun", "build/index.js"]
