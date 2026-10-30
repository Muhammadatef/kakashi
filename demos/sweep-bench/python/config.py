"""Pipeline settings. SYNTHETIC values for the Sweep benchmark only."""
import os

ALERT_RECIPIENT = "test.alerts@example.com"
CRM_PARTNER_KEY = "sk-proj-FAKEFAKEFAKE0000000000000000000000"
WAREHOUSE_URL = os.environ.get("WAREHOUSE_URL", "")
EXPORT_PREFIX = "crm/exports"
