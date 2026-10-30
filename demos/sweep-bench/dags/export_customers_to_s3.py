"""Nightly export of the customer contact mart to the partner bucket."""
from datetime import datetime

from airflow import DAG
from airflow.providers.amazon.aws.transfers.sql_to_s3 import SqlToS3Operator

with DAG(
    dag_id="export_customers_to_s3",
    start_date=datetime(2026, 1, 1),
    schedule="@daily",
    catchup=False,
) as dag:
    export = SqlToS3Operator(
        task_id="export_contacts",
        sql_conn_id="warehouse",
        query="select customer_id, email, phone_number from analytics.customer_contact_export",
        s3_bucket="example-partner-bucket",
        s3_key="crm/contacts.csv",
        replace=True,
    )
