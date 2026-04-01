# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies needed to build better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# Build Next.js standalone
RUN npm run build

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# Install curl for the cron health checks and supercronic for cron
RUN apk add --no-cache curl \
    && wget -qO /usr/local/bin/supercronic \
       https://github.com/aptible/supercronic/releases/download/v0.2.33/supercronic-linux-amd64 \
    && chmod +x /usr/local/bin/supercronic

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Copy standalone build output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Create data directory for SQLite
RUN mkdir -p /app/data

# Cron job: refresh every 5 minutes
RUN echo "*/5 * * * * curl -sf --max-time 180 -o /dev/null -w 'CRON refresh: HTTP %{http_code} in %{time_total}s\n' http://localhost:3000/api/cron/refresh -H \"Authorization: Bearer \${CRON_SECRET}\"" > /app/crontab

# Start script: runs both the Next.js server and the cron scheduler
RUN printf '#!/bin/sh\n\
echo "Starting PULSE v2 — Unified Societal Sentiment Engine"\n\
echo "  → Next.js server on port 3000"\n\
echo "  → Cron refresh every 5 minutes (markets, classification, resolution)"\n\
echo "  → Hourly: FRED data, AI term curation, Google Trends, narratives"\n\
echo "  → Health: http://localhost:3000/api/health"\n\
echo ""\n\
echo "Signal layers:"\n\
echo "  1. Prediction Markets (Polymarket, Kalshi, Manifold, PredictIt)"\n\
echo "  2. Economic Psychology (FRED: consumer sentiment, unemployment, etc.)"\n\
echo "  3. Fear Signals (FRED: VIX, yield curve, credit spreads)"\n\
echo "  4. Public Attention (AI-curated Google Trends)"\n\
echo ""\n\
\n\
# Start cron in background\n\
supercronic /app/crontab &\n\
\n\
# Start Next.js\n\
exec node server.js\n' > /app/start.sh && chmod +x /app/start.sh

EXPOSE 3000

CMD ["/app/start.sh"]
