-- Add account coding fields to transactions table

-- Add account coding columns
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS account_code VARCHAR(10),
ADD COLUMN IF NOT EXISTS coded_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS coded_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_transactions_account_code ON transactions(account_code);
CREATE INDEX IF NOT EXISTS idx_transactions_coded_at ON transactions(coded_at);
CREATE INDEX IF NOT EXISTS idx_transactions_user_coded ON transactions(user_id, account_code);

-- Create trial balance view
CREATE OR REPLACE VIEW trial_balance AS
SELECT 
  t.account_code,
  CASE 
    WHEN t.account_code BETWEEN '100' AND '299' THEN 'Assets'
    WHEN t.account_code BETWEEN '800' AND '899' THEN 'Liabilities'
    WHEN t.account_code BETWEEN '900' AND '999' THEN 'Equity'
    WHEN t.account_code BETWEEN '200' AND '299' THEN 'Revenue'
    WHEN t.account_code BETWEEN '400' AND '499' THEN 'Expenses'
    ELSE 'Unknown'
  END as account_type,
  COUNT(*) as transaction_count,
  SUM(CASE WHEN t.is_income THEN t.amount ELSE 0 END) as total_debits,
  SUM(CASE WHEN NOT t.is_income THEN t.amount ELSE 0 END) as total_credits,
  SUM(CASE WHEN t.is_income THEN t.amount ELSE -t.amount END) as net_amount,
  t.user_id
FROM transactions t
WHERE t.account_code IS NOT NULL
GROUP BY t.account_code, t.user_id
ORDER BY t.account_code;

-- Create coding summary view
CREATE OR REPLACE VIEW coding_summary AS
SELECT 
  u.user_id,
  u.file_name,
  u.created_at as upload_date,
  COUNT(t.id) as total_transactions,
  COUNT(t.account_code) as coded_transactions,
  COUNT(t.id) - COUNT(t.account_code) as uncoded_transactions,
  ROUND(
    (COUNT(t.account_code)::DECIMAL / NULLIF(COUNT(t.id), 0)) * 100, 
    2
  ) as coding_percentage
FROM uploads u
LEFT JOIN transactions t ON u.id = t.upload_id
GROUP BY u.user_id, u.id, u.file_name, u.created_at
ORDER BY u.created_at DESC;

-- Grant permissions
GRANT SELECT ON trial_balance TO authenticated;
GRANT SELECT ON coding_summary TO authenticated;

-- Show current status
SELECT 'Transactions with account codes' as status, COUNT(*) as count 
FROM transactions 
WHERE account_code IS NOT NULL
UNION ALL
SELECT 'Transactions without account codes' as status, COUNT(*) as count 
FROM transactions 
WHERE account_code IS NULL;
