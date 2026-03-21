import sys
import os
from pathlib import Path

# Add parent directory to path so we can import modules from backend/
sys.path.insert(0, str(Path(__file__).parent.parent))

# Import the FastAPI app
from main import app

# Export for Vercel ASGI handler
__all__ = ["app"]
