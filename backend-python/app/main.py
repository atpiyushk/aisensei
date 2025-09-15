from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from contextlib import asynccontextmanager
import logging
import httpx
import os

from app.core.config import settings
from app.api.v1.router import api_router
from app.db.database import engine, Base

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting up AISensei API...")
    # Create database tables
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables created successfully")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        logger.info("Continuing without database - API will run with limited functionality")
    yield
    # Shutdown
    logger.info("Shutting down...")


app = FastAPI(
    title="AISensei API",
    description="AI-powered grading assistant with Google Classroom integration",
    version="2.0.0",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(api_router, prefix="/api/v1")

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "aisensei-api"}

# Proxy all non-API requests to Next.js frontend
@app.get("/{full_path:path}")
async def proxy_to_frontend(request: Request, full_path: str):
    # Skip API routes
    if full_path.startswith("api/") or full_path.startswith("health") or full_path.startswith("docs") or full_path.startswith("openapi.json"):
        return {"message": "Route not found"}
    
    # Proxy to Next.js server running on port 3000
    try:
        frontend_url = f"http://localhost:3000/{full_path}"
        query_params = str(request.url.query)
        if query_params:
            frontend_url += f"?{query_params}"
            
        async with httpx.AsyncClient() as client:
            response = await client.get(
                frontend_url,
                headers={k: v for k, v in request.headers.items() if k.lower() != 'host'},
                timeout=30.0
            )
            
            return Response(
                content=response.content,
                status_code=response.status_code,
                headers={k: v for k, v in response.headers.items() if k.lower() not in ['content-encoding', 'transfer-encoding']}
            )
    except Exception as e:
        logger.error(f"Frontend proxy error: {e}")
        return {
            "message": "AISensei API is running!", 
            "note": "Frontend server not available - serving API only",
            "api_docs": "/docs",
            "health": "/health"
        }
