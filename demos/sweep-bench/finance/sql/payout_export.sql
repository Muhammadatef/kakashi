-- Monthly payout file for the bank partner.
unload ('select first_name, last_name, iban, amount from finance.payouts')
to 's3://example-bank-drop/payouts/'
iam_role 'arn:aws:iam::000000000000:role/unload';
