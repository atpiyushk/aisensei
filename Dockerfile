# Multi-stage build: Frontend (Node.js)
FROM node:18-alpine AS frontend-builder

WORKDIR /frontend

# Copy frontend package files
COPY client/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy frontend source
COPY client/ ./

# Build the Next.js application for static export
RUN npm run build

# Final stage
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies including Node.js
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file (note: singular 'requirement.txt')
COPY backend-python/requirement.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirement.txt

# Copy application code
COPY backend-python/ .

# Copy built Next.js standalone files
COPY --from=frontend-builder /frontend/.next/standalone /app/frontend
COPY --from=frontend-builder /frontend/.next/static /app/frontend/.next/static
COPY --from=frontend-builder /frontend/public /app/frontend/public

# Create uploads directory
RUN mkdir -p /app/uploads

# Create startup script that runs both services
RUN echo '#!/bin/bash\n\
echo "Starting AISensei Full Stack Application"\n\
# Start Next.js frontend on port 3000 in background\n\
cd /app/frontend && PORT=3000 node server.js &\n\
echo "Frontend started on port 3000"\n\
# Wait a moment for frontend to start\n\
sleep 3\n\
# Start FastAPI backend with reverse proxy to frontend\n\
echo "Starting backend on port ${PORT:-8080}"\n\
cd /app && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}\n\
' > /app/start.sh && chmod +x /app/start.sh

# Run as non-root user
RUN useradd -m -u 1000 aisensei && chown -R aisensei:aisensei /app
USER aisensei

# Expose port that will be set by Cloud Run
EXPOSE 8080
ENV PORT=8080

# Run both services
CMD ["/app/start.sh"]
