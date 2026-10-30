{{ config(materialized='view') }}

select
    order_id,
    customer_id,
    order_total,
    ordered_at
from {{ source('shop', 'orders') }}
