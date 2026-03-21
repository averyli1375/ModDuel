from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
import os

# Must use PostgreSQL on Vercel - SQLite won't persist
# Get DATABASE_URL from environment, or default to local SQLite for development
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./modduel.db")

# Alert if running on Vercel without a proper database
if os.environ.get("VERCEL") and DATABASE_URL.startswith("sqlite"):
    print("[ERROR] DATABASE_URL not set! SQLite will not work on Vercel. Set DATABASE_URL to a PostgreSQL connection string.")
    print("[ERROR] Supported services: Neon, Supabase, Railway, AWS RDS, etc.")

print(f"[DATABASE] Using: {DATABASE_URL[:30]}..." if len(DATABASE_URL) > 30 else f"[DATABASE] Using: {DATABASE_URL}")

def get_engine_args():
    if DATABASE_URL.startswith("sqlite"):
        return {"connect_args": {"check_same_thread": False}}
    elif DATABASE_URL.startswith("postgresql"):
        return {
            "pool_size": 5,
            "max_overflow": 10,
            "pool_pre_ping": True,
            "pool_recycle": 3600
        }
    return {}

# Direct initialization handles Vercel much better
engine = create_engine(DATABASE_URL, **get_engine_args())
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
        print("[DATABASE] Database initialized successfully")
    except Exception as e:
        print(f"[DATABASE ERROR] Could not initialize database tables: {e}")
        import traceback
        traceback.print_exc()

def get_db():
    """Dependency for FastAPI to get database session"""
    init_db()  # Ensure tables exist (fast check)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
