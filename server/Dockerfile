# Hardened Dockerfile for DA3 Question 2(c)
# Key hardening measures:
# 1. Minimal Alpine base image (node:22-alpine) reduces attack surface from hundreds of packages to minimal Alpine packages.
# 2. Non-root user execution (USER node) prevents container breakout and root privilege escalation.
# 3. Production dependencies only (--omit=dev) and cleaned npm cache.

FROM node:22-alpine

# Set working directory
WORKDIR /app

# Ensure proper non-root ownership of app directory
RUN chown -R node:node /app

# Copy dependency definitions with proper non-root ownership
COPY --chown=node:node package*.json ./

# Switch to unprivileged non-root user
USER node

# Install production dependencies only and clear cache
RUN npm ci --omit=dev && npm cache clean --force

# Copy application source files with non-root ownership
COPY --chown=node:node auth.js authMiddleware.js db.js index.js schema.sql ./
COPY --chown=node:node migrations ./migrations

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

CMD ["npm", "start"]
