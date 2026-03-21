#!/usr/bin/env python3
"""
Quick diagnostic script to test database connectivity

Usage:
    python test_db.py
"""
import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

# Check environment
print("=== Environment ===")
db_url = os.getenv("DATABASE_URL", "Not set - using SQLite")
is_vercel = os.getenv("VERCEL", False)
print(f"DATABASE_URL: {db_url[:50] if len(db_url) > 50 else db_url}...")
print(f"Running on Vercel: {is_vercel}")

print("\n=== Testing Database Connection ===")

try:
    from database import get_engine, init_db
    
    print("✓ Successfully imported database module")
    
    # Try to get engine
    print("Attempting to create database engine...")
    engine = get_engine()
    print("✓ Engine created successfully")
    
    # Try to connect
    print("Attempting to connect to database...")
    with engine.connect() as conn:
        conn.execute("SELECT 1")
    print("✓ Database connection successful")
    
    # Try to initialize tables
    print("Attempting to initialize database tables...")
    init_db()
    print("✓ Database initialized successfully")
    
    print("\n✅ ALL TESTS PASSED - Database is working!")
    
except Exception as e:
    print(f"\n❌ ERROR: {e}")
    import traceback
    traceback.print_exc()
    
    print("\n=== Troubleshooting ===")
    if db_url.startswith("sqlite"):
        print("ℹ️  Using SQLite")
    elif db_url.startswith("postgresql"):
        print("ℹ️  Using PostgreSQL - verify connection string format:")
        print("   postgresql://user:password@host:port/dbname")
        print("\n   Common issues:")
        print("   - Wrong password")
        print("   - Host/port incorrect")
        print("   - Database doesn't exist")
        print("   - Network connectivity issue")
    else:
        print("ℹ️  Unknown database type")
    
    sys.exit(1)
