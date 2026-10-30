{{ config(materialized='view') }}

select
    customer_id,
    first_name,
    last_name,
    email,
    phone_number,
    national_id,
    date_of_birth,
    created_at
from {{ source('crm', 'customers') }}
