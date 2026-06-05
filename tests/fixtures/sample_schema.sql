-- Sample schema dump with mixed sensitive data for kakashi tests
CREATE USER reporting IDENTIFIED BY 'Sup3rS3cret!';
CREATE ROLE etl_worker WITH PASSWORD 'pg-r0le-pass';
ALTER USER legacy IDENTIFIED BY PASSWORD '*81F5E21E35407D884A6CD4A731AEBFB6AF209E1B';

-- Seed data containing PII
INSERT INTO customers (id, full_name, email, phone) VALUES
  (1, 'John Smith', 'john.smith@example.com', '+1-415-555-0188'),
  (2, 'Jane Doe',   'jane.doe@example.org',   '+44 20 7946 0958');

-- Connection string left in a comment by mistake
-- conn: postgresql://admin:hunter2@prod.db.example.com:5432/analytics
