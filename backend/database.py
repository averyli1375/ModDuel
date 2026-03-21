from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./modduel.db")

# Lazy initialization to avoid import errors
_engine = None
_SessionLocal = None

def get_engine():
    global _engine
    if _engine is None:
        try:
            if DATABASE_URL.startswith("sqlite"):
                _engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
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
        except Exception as e:
            print(f"Warning: Could not initialize database: {e}")
            # Fall back to SQLite
            _engine = create_engine("sqlite:///./modduel.db", connect_args={"check_same_thread": False})
    return _engine

def get_session_factory():
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
        Base.metadata.create_all(bind=get_engine())
        _db_init_done = True
        print("Database initialized successfully")
    except Exception as e:
        print(f"Warning: Could not initialize database tables: {e}")
