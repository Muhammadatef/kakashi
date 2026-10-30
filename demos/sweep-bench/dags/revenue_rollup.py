"""Decoy: runs the revenue model and logs a status string. No data leaves."""
from datetime import datetime

from airflow import DAG
from airflow.operators.bash import BashOperator
from airflow.operators.empty import EmptyOperator

with DAG(
    dag_id="revenue_rollup",
    start_date=datetime(2026, 1, 1),
    schedule="@daily",
    catchup=False,
) as dag:
    start = EmptyOperator(task_id="start")
    build = BashOperator(task_id="dbt_run", bash_command="dbt run --select revenue_daily")
    start >> build
