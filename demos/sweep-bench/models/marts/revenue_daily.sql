{{ config(materialized='table') }}

select
    cast(ordered_at as date) as order_day,
    count(*) as orders,
    sum(order_total) as revenue
from {{ ref('stg_orders') }}
group by 1
