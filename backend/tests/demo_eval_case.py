import json
import sys
from pathlib import Path
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from main import app


def run_demo() -> None:
    with TestClient(app) as client:
        payloads = [
            {"batch_id": "demo_batch_001", "file_name": "case_001.json"},
            {"batch_id": "demo_batch_001", "file_name": "case_002.json"},
        ]

        graded = []
        for p in payloads:
            resp = client.post("/api/evals/grade-file", json=p)
            print(f"grade-file {p['file_name']} -> status {resp.status_code}")
            resp.raise_for_status()
            graded.append(resp.json())

        print("\n--- Graded Records ---")
        print(json.dumps(graded, indent=2))

        analyze_resp = client.post("/api/evals/analyze", json={"batch_id": "demo_batch_001"})
        print(f"\nanalyze -> status {analyze_resp.status_code}")
        analyze_resp.raise_for_status()

        print("\n--- Batch Analysis ---")
        print(json.dumps(analyze_resp.json(), indent=2))


if __name__ == "__main__":
    run_demo()
