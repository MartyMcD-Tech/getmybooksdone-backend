-- Create comprehensive trial balance views

-- Main trial balance view with proper debit/credit logic
CREATE OR REPLACE VIEW trial_balance_detailed AS
SELECT 
  coa.code,
  coa.name,
  coa.account_type,
  coa.category,
  coa.subcategory,
  coa.section,
  coa.normal_balance,
  coa.sort_order,
  t.user_id,
  
  -- Transaction counts
  COUNT(t.id) as transaction_count,
  
  -- Calculate debits and credits based on transaction nature and account normal balance
  SUM(CASE 
    WHEN (t.is_income = false AND coa.normal_balance = 'DR') OR 
         (t.is_income = true AND coa.normal_balance = 'CR') 
    THEN ABS(t.amount) 
    ELSE 0 
  END) as debit_amount,
  
  SUM(CASE 
    WHEN (t.is_income = true AND coa.normal_balance = 'DR') OR 
         (t.is_income = false AND coa.normal_balance = 'CR') 
    THEN ABS(t.amount) 
    ELSE 0 
  END) as credit_amount,
  
  -- Net balance (positive = debit balance, negative = credit balance)
  SUM(CASE 
    WHEN (t.is_income = false AND coa.normal_balance = 'DR') OR 
         (t.is_income = true AND coa.normal_balance = 'CR') 
    THEN ABS(t.amount) 
    ELSE -ABS(t.amount) 
  END) as net_balance,
  
  -- For trial balance display (following UK convention: credits as negative)
  SUM(CASE 
    WHEN coa.normal_balance = 'DR' THEN
      CASE WHEN t.is_income = false THEN ABS(t.amount) ELSE -ABS(t.amount) END
    ELSE
      CASE WHEN t.is_income = true THEN -ABS(t.amount) ELSE ABS(t.amount) END
  END) as trial_balance_amount,
  
  MIN(t.transaction_date) as earliest_transaction,
  MAX(t.transaction_date) as latest_transaction,
  MAX(t.coded_at) as last_coded_at

FROM chart_of_accounts coa
LEFT JOIN transactions t ON coa.code = t.account_code 
  AND t.account_code IS NOT NULL
GROUP BY 
  coa.code, coa.name, coa.account_type, coa.category, coa.subcategory, 
  coa.section, coa.normal_balance, coa.sort_order, t.user_id
HAVING COUNT(t.id) > 0 OR t.user_id IS NULL
ORDER BY coa.sort_order, coa.code;

-- Summary trial balance by category
CREATE OR REPLACE VIEW trial_balance_summary AS
SELECT 
  tb.section,
  tb.category,
  tb.subcategory,
  tb.user_id,
  COUNT(DISTINCT tb.code) as account_count,
  SUM(tb.transaction_count) as total_transactions,
  SUM(tb.debit_amount) as total_debits,
  SUM(tb.credit_amount) as total_credits,
  SUM(tb.trial_balance_amount) as category_balance,
  MIN(tb.earliest_transaction) as period_start,
  MAX(tb.latest_transaction) as period_end
FROM trial_balance_detailed tb
WHERE tb.user_id IS NOT NULL
GROUP BY tb.section, tb.category, tb.subcategory, tb.user_id
ORDER BY 
  CASE tb.section 
    WHEN 'P&L' THEN 1 
    WHEN 'Balance Sheet' THEN 2 
    ELSE 3 
  END,
  MIN(tb.sort_order);

-- Trial balance totals for validation
CREATE OR REPLACE VIEW trial_balance_totals AS
SELECT 
  tb.user_id,
  tb.section,
  SUM(tb.debit_amount) as section_debits,
  SUM(tb.credit_amount) as section_credits,
  SUM(tb.trial_balance_amount) as section_balance,
  COUNT(DISTINCT tb.code) as accounts_with_balances,
  SUM(tb.transaction_count) as total_transactions
FROM trial_balance_detailed tb
WHERE tb.user_id IS NOT NULL
GROUP BY tb.user_id, tb.section

UNION ALL

SELECT 
  tb.user_id,
  'TOTAL' as section,
  SUM(tb.debit_amount) as section_debits,
  SUM(tb.credit_amount) as section_credits,
  SUM(tb.trial_balance_amount) as section_balance,
  COUNT(DISTINCT tb.code) as accounts_with_balances,
  SUM(tb.transaction_count) as total_transactions
FROM trial_balance_detailed tb
WHERE tb.user_id IS NOT NULL
GROUP BY tb.user_id
ORDER BY user_id, 
  CASE section 
    WHEN 'P&L' THEN 1 
    WHEN 'Balance Sheet' THEN 2 
    WHEN 'TOTAL' THEN 3 
    ELSE 4 
  END;

-- Grant permissions
GRANT SELECT ON chart_of_accounts TO authenticated;
GRANT SELECT ON trial_balance_detailed TO authenticated;
GRANT SELECT ON trial_balance_summary TO authenticated;
GRANT SELECT ON trial_balance_totals TO authenticated;

-- Show sample data
SELECT 'Chart of Accounts loaded' as status, COUNT(*) as count FROM chart_of_accounts;
