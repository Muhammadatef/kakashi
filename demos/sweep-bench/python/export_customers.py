"""Pull the contact mart and drop it into the partner bucket as CSV."""
import pandas as pd
import sqlalchemy

from config import WAREHOUSE_URL

engine = sqlalchemy.create_engine(WAREHOUSE_URL)

customers_df = pd.read_sql(
    "select customer_id, email, phone_number from analytics.dim_customers",
    engine,
)

customers_df.to_csv("s3://example-partner-bucket/crm/customers.csv", index=False)
