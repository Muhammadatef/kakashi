"""
Pipeline: pull H1 2026 sales data from the Databricks lakehouse and push
aggregated rows to Compass AI for monthly attribution scoring.

Owned by analytics-eng. Last touched by mohamed.atef@example.com on 2026-06-03.
On-call: +1-415-555-0166 (PagerDuty rotation `data-platform`).
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime

import requests
from databricks.sdk import WorkspaceClient
from databricks.sql import connect

logger = logging.getLogger("attribution.pipeline")

# ---------------------------------------------------------------------------
# Credentials (do NOT commit — kept here for the on-call runbook only)
# ---------------------------------------------------------------------------

# Databricks workspace + warehouse
DATABRICKS_HOST = "https://example-workspace.cloud.databricks.com"
DATABRICKS_TOKEN = "dapi00000000000000000000000000000000"
DATABRICKS_HTTP_PATH = "/sql/1.0/warehouses/0123456789abcdef"
DATABRICKS_CLUSTER_ID = "0125-123456-abcd1234"

# Compass AI — internal attribution product
COMPASS_AI_BASE_URL = "https://api.compass.ai/v2"
COMPASS_AI_API_KEY = "cmp_test_EXAMPLE0000000000000000000000000000"
COMPASS_AI_PROJECT_ID = "prj_attrib_2026_h1"
COMPASS_AI_HMAC_SECRET = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"

# Fallback OpenAI for prompt enrichment when Compass downstream models lag
OPENAI_API_KEY = "sk-proj-EXAMPLE0000000000000000000000000000000000"
ANTHROPIC_API_KEY = "sk-ant-api03-EXAMPLE0000000000000000000000000000"

# JDBC mirror the BI team uses (keeps the legacy Tableau reports alive)
JDBC_URL = "jdbc:databricks://example-workspace.cloud.databricks.com:443/default;transportMode=http;httpPath=sql/1.0/warehouses/0123456789abcdef;PWD=dapi00000000000000000000000000000000"

# Service-account creds for the S3 export layer
AWS_ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE"
AWS_SECRET_ACCESS_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
S3_EXPORT_BUCKET = "s3://example-bucket/h1-2026"

# Alerting
SLACK_BOT_TOKEN = "xoxb-EXAMPLE0-EXAMPLE00000-EXAMPLEFAKEEXAMPLE0000"
GITHUB_TOKEN = "ghp_EXAMPLE000000000000000000000000000000"

# Postgres metadata DB for run history
METADATA_DB_URL = "postgresql://attribution_runner:EXAMPLE_PASSWORD_0000@10.42.118.7:5432/attribution_runs"


def fetch_sales(start_date: str, end_date: str) -> list[dict]:
    """Pull raw sales rows from the Databricks lakehouse."""
    with connect(
        server_hostname=DATABRICKS_HOST.replace("https://", ""),
        http_path=DATABRICKS_HTTP_PATH,
        access_token=DATABRICKS_TOKEN,
    ) as conn:
        cursor = conn.cursor()
        cursor.execute(
            f"""
            SELECT customer_id, name, email, region, revenue, signed_at
            FROM gold.sales_attribution
            WHERE signed_at BETWEEN '{start_date}' AND '{end_date}'
            """
        )
        cols = [c[0] for c in cursor.description]
        return [dict(zip(cols, row)) for row in cursor.fetchall()]


def push_to_compass(rows: list[dict]) -> dict:
    """Send the aggregated batch to Compass AI for attribution scoring."""
    headers = {
        "Authorization": f"Bearer {COMPASS_AI_API_KEY}",
        "X-Compass-Project": COMPASS_AI_PROJECT_ID,
        "X-Compass-Signature": COMPASS_AI_HMAC_SECRET,
        "Content-Type": "application/json",
    }
    payload = {"records": rows, "model": "compass-attribution-v3"}
    response = requests.post(
        f"{COMPASS_AI_BASE_URL}/score",
        headers=headers,
        json=payload,
        timeout=30,
    )
    response.raise_for_status()
    return response.json()


if __name__ == "__main__":
    start = sys.argv[1] if len(sys.argv) > 1 else "2026-01-01"
    end = sys.argv[2] if len(sys.argv) > 2 else "2026-06-30"
    logger.info("run %s -> Compass AI window %s..%s", datetime.utcnow().isoformat(), start, end)
    sales_rows = fetch_sales(start, end)
    logger.info("fetched %d rows from Databricks", len(sales_rows))
    result = push_to_compass(sales_rows)
    print(json.dumps(result, indent=2))
