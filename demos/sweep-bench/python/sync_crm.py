"""Push customer records to the CRM partner API."""
import requests

from config import CRM_PARTNER_KEY


def push(customers_df):
    records = customers_df[["customer_id", "email", "phone_number"]].to_dict(orient="records")
    resp = requests.post(
        "https://crm-partner.example.com/v1/contacts",
        json=records,
        headers={"Authorization": f"Bearer {CRM_PARTNER_KEY}"},
        timeout=30,
    )
    resp.raise_for_status()
