select
    payout_id,
    customer_id,
    iban,
    amount,
    paid_at
from {{ source('finance', 'payouts') }}
