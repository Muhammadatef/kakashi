"""Reconcile payouts and email the exception list to finance ops."""
import smtplib
from email.message import EmailMessage

import pandas as pd


def run(conn):
    exceptions = pd.read_sql(
        "select payout_id, full_name, iban, amount from finance.payouts where status = 'failed'",
        conn,
    )
    msg = EmailMessage()
    msg["Subject"] = "Payout exceptions"
    msg.set_content(exceptions.to_string())
    with smtplib.SMTP("localhost") as smtp:
        smtp.send_message(msg)
