from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
import os

# Check if we are running in a Vercel-like environment
is_serverless = os.environ.get("VERCEL") or os.environ.get("VERCEL_URL")

default_db = "sqlite:////tmp/modduel.db" if is_serverless else "sqlite:///./modduel.db"
DATABASE_URL = os.getenv("DATABASE_URL", default_db)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

# Direct initialization handles Vercel much better
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass

_db_init_done = False
def init_db():
    """Initialize database tables"""
    global _db_init_done
    if _db_init_done:
        return
    import models # Required so tables bind to Base metadata before creation
    try:
        Base.metadata.create_all(bind=engine)
        _db_init_done = True
    except Exception as e:
        print(f"Warning: Could not initialize database tables: {e}")

def get_db():
    """Dependency for FastAPI to get database session"""
    init_db()  # Ensure tables exist (fast check)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
