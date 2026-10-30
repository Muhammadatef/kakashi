"""Weekly report of new customers, emailed to the growth team."""
from datetime import datetime

from airflow import DAG
from airflow.models import Variable
from airflow.operators.email import EmailOperator

with DAG(
    dag_id="weekly_customer_report",
    start_date=datetime(2026, 1, 1),
    schedule="@weekly",
    catchup=False,
) as dag:
    send_report = EmailOperator(
        task_id="send_report",
        to=Variable.get("growth_team_list"),
        subject="New customers this week",
        html_content="See attached list of new customers.",
        files=["/data/reports/new_customers.csv"],
    )
