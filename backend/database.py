from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
import os

# Get DATABASE_URL from environment
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./modduel.db")

# Convert old postgres:// format to new postgresql:// format required by SQLAlchemy 2.0+
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    print("[DATABASE] Converted postgres:// to postgresql://")

# Alert if running on Vercel without a proper database
if os.environ.get("VERCEL") and DATABASE_URL.startswith("sqlite"):
    print("[ERROR] DATABASE_URL not set! SQLite will not work on Vercel. Set DATABASE_URL to a PostgreSQL connection string.")
    print("[ERROR] Supported services: Neon, Supabase, Railway, AWS RDS, etc.")

print(f"[DATABASE] Using: {DATABASE_URL[:40]}..." if len(DATABASE_URL) > 40 else f"[DATABASE] Using: {DATABASE_URL}")

def get_engine_args():
    """Get engine arguments based on database type"""
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

# Lazy initialization - only create engine when first needed
_engine = None
_SessionLocal = None

def get_engine():
    """Get or create the database engine (lazy loading)"""
    global _engine
    if _engine is None:
        try:
            print("[DATABASE] Creating database engine...")
            _engine = create_engine(DATABASE_URL, **get_engine_args())
            print("[DATABASE] Engine created successfully")
        except Exception as e:
            print(f"[DATABASE ERROR] Failed to create engine: {e}")
            import traceback
            traceback.print_exc()
            raise
    return _engine

def get_session_factory():
    """Get or create the session factory"""
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=get_engine())
    return _SessionLocal

class Base(DeclarativeBase):
    pass

def get_db():
    """Dependency for FastAPI to get database session"""
    session_factory = get_session_factory()
    db = session_factory()
    try:
        yield db
    finally:
        db.close()

_db_init_done = False

def init_db():
    """Initialize database tables"""
    global _db_init_done
    if _db_init_done:
        return
    try:
        import models  # Required so tables bind to Base metadata before creation
        print("[DATABASE] Creating database tables...")
        engine = get_engine()
        Base.metadata.create_all(bind=engine)
        _db_init_done = True
        print("[DATABASE] Database initialized successfully")
    except Exception as e:
        print(f"[DATABASE ERROR] Could not initialize database tables: {e}")
        import traceback
        traceback.print_exc()
        raise

def get_db():
    """Dependency for FastAPI to get database session"""
    init_db()  # Ensure tables exist (fast check)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
