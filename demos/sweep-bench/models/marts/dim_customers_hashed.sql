{{ config(materialized='table') }}

-- Pseudonymised key only: no direct identifiers leave this model.
select
    sha2(cast(customer_id as varchar), 256) as customer_key,
    created_at
from {{ ref('stg_customers') }}
