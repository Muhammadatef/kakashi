{{ config(materialized='table') }}

select
    customer_id,
    email,
    phone_number
from {{ ref('dim_customers') }}
where lifetime_orders > 0
