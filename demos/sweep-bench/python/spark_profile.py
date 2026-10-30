"""PySpark job: build a profile extract and land it as parquet."""
from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("customer_profile").getOrCreate()

profile = spark.sql(
    "select customer_id, first_name, last_name, date_of_birth from analytics.stg_customers"
)

profile.write.mode("overwrite").parquet("s3://example-lake-bucket/profiles/")
