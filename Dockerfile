# Multi-stage Docker build for Social Command Center
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci

# Copy client and build
COPY client/package*.json ./client/
RUN cd client && npm ci

COPY client/ ./client/
RUN cd client && npm run build

# Runtime Stage
FROM node:22-bookworm-slim AS runner

# Install FFmpeg and font tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    fonts-dejavu-core \
    fonts-freefont-ttf \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci --omit=dev

# Copy server source and pre-built client
COPY server/ ./server/
COPY --from=builder /app/client/dist ./client/dist

# Ensure data directory exists
RUN mkdir -p .data/uploads .data/renders

ENV NODE_ENV=production
ENV PORT=3001
ENV TZ=Asia/Bangkok

EXPOSE 3001

CMD ["npx", "tsx", "server/src/index.ts"]
