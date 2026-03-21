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

# Lazy initialization to avoid import errors
_engine = None
_SessionLocal = None

def get_engine():
    """Get or create the database engine"""
    global _engine
    if _engine is None:
        try:
            if DATABASE_URL.startswith("sqlite"):
                _engine = create_engine(
                    DATABASE_URL, 
                    connect_args={"check_same_thread": False}
                )
            elif DATABASE_URL.startswith("postgresql"):
                _engine = create_engine(
                    DATABASE_URL,
                    pool_size=5,
                    max_overflow=10,
                    pool_pre_ping=True,
                    pool_recycle=3600
                )
            else:
                _engine = create_engine(DATABASE_URL)
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

def SessionLocal():
    """Create a new database session"""
    session_factory = get_session_factory()
    return session_factory()

class Base(DeclarativeBase):
    pass

def get_db():
    """Dependency for FastAPI to get database session"""
    init_db()  # Ensure tables exist (fast check)
    db = SessionLocal()
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
        engine = get_engine()
        Base.metadata.create_all(bind=engine)
        _db_init_done = True
        print("[DATABASE] Database initialized successfully")
    except Exception as e:
        print(f"[DATABASE ERROR] Could not initialize database tables: {e}")
        import traceback
        traceback.print_exc()
        raise
