# Multi-stage build: Frontend (Node.js)
FROM node:18-alpine AS frontend-builder

WORKDIR /frontend

# Copy frontend package files
COPY client/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy frontend source
COPY client/ ./

# Build the Next.js application
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

# Copy built frontend
COPY --from=frontend-builder /frontend/.next /app/frontend/.next
COPY --from=frontend-builder /frontend/public /app/frontend/public
COPY --from=frontend-builder /frontend/package.json /app/frontend/package.json
COPY --from=frontend-builder /frontend/node_modules /app/frontend/node_modules

# Create uploads directory
RUN mkdir -p /app/uploads

# Create startup script that runs both services
RUN echo '#!/bin/bash\n\
echo "Starting AISensei Full Stack Application"\n\
echo "Frontend will be served statically through backend"\n\
# Start FastAPI backend on the PORT specified by Cloud Run\n\
echo "Starting backend on port $PORT"\n\
cd /app && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}\n\
' > /app/start.sh && chmod +x /app/start.sh

# Run as non-root user
RUN useradd -m -u 1000 aisensei && chown -R aisensei:aisensei /app
USER aisensei

# Expose port that will be set by Cloud Run
EXPOSE 8080
ENV PORT=8080

# Run both services
CMD ["/app/start.sh"]
