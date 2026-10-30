-- Decoy: aggregates only.
select
    date_trunc('month', paid_at) as month,
    count(*) as payouts,
    sum(amount) as total_paid
from finance.payouts
group by 1
