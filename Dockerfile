# Multi-stage build for StateReaper FinOps Tribunal
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package.json package-lock.json tsconfig.json ./

# Install all dependencies (including devDependencies for TypeScript compilation)
RUN npm ci

# Copy source code
COPY src/ ./src/

# Compile TypeScript to dist/
RUN npm run build

# Prune devDependencies to keep production image minimal
RUN npm prune --production

# Runtime stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV USE_MOCK_TELEMETRY=true
ENV SWITCH_DRY_RUN=true

# Create unprivileged user for security compliance
RUN addgroup -S statereaper && adduser -S statereaper -G statereaper

# Copy production artifacts from builder
COPY --from=builder --chown=statereaper:statereaper /app/node_modules ./node_modules
COPY --from=builder --chown=statereaper:statereaper /app/dist ./dist
COPY --from=builder --chown=statereaper:statereaper /app/package.json ./package.json
COPY --chown=statereaper:statereaper statereaper-pipeline.template.yaml ./

# Create audit logs directory with appropriate permissions
RUN mkdir -p /app/audit-logs && chown -R statereaper:statereaper /app/audit-logs

USER statereaper

VOLUME ["/app/audit-logs"]

# Start StateReaper daemon
CMD ["node", "dist/index.js"]

