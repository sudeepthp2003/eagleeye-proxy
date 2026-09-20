# ==========================================
# Stage 1: Build React Frontend
# ==========================================
FROM node:20-alpine AS frontend-builder
WORKDIR /app/client

COPY client/package*.json ./
RUN npm install

COPY client/ ./
RUN npm run build

# ==========================================
# Stage 2: Production Node.js Environment
# ==========================================
FROM node:20-alpine
WORKDIR /app

# Install production dependencies for backend
COPY package*.json ./
RUN npm install --omit=dev

# Copy backend application source
COPY . .

# Copy built frontend assets into the backend static folder
COPY --from=frontend-builder /app/client/build ./client/build

# Expose Web UI / API (8081) and Proxy (8080)
EXPOSE 8081 8080

CMD ["node", "server.js"]
