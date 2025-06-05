-- Enhanced Chart of Accounts with hierarchy for UK Trial Balance
-- Drop existing views first
DROP VIEW IF EXISTS trial_balance;
DROP VIEW IF EXISTS coding_summary;

-- Create enhanced chart of accounts table
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  code VARCHAR(10) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  account_type VARCHAR(50) NOT NULL, -- Assets, Liabilities, Equity, Revenue, Expenses
  category VARCHAR(100), -- Main category (e.g., "Administrative expenses - General")
  subcategory VARCHAR(100), -- Sub category (e.g., "Employee costs")
  section VARCHAR(50), -- P&L or Balance Sheet
  normal_balance VARCHAR(10) NOT NULL, -- DR or CR
  is_header BOOLEAN DEFAULT FALSE, -- True for category headers
  parent_code VARCHAR(10), -- For hierarchy
  sort_order INTEGER DEFAULT 0,
  tax_code VARCHAR(20) DEFAULT 'No VAT',
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert comprehensive UK chart of accounts
INSERT INTO chart_of_accounts (code, name, account_type, category, subcategory, section, normal_balance, sort_order, tax_code) VALUES
-- PROFIT & LOSS ACCOUNTS
-- Revenue/Turnover
('4000', 'Sales', 'Revenue', 'Turnover', NULL, 'P&L', 'CR', 100, 'Standard Rate'),
('4010', 'Fees', 'Revenue', 'Turnover', NULL, 'P&L', 'CR', 110, 'Standard Rate'),
('4020', 'Reimbursed Expenses', 'Revenue', 'Turnover', NULL, 'P&L', 'CR', 120, 'Standard Rate'),

-- Cost of Sales
('5000', 'Purchases', 'Expenses', 'Cost of sales', NULL, 'P&L', 'DR', 200, 'Standard Rate'),
('5010', 'Increase/Decrease in Stocks', 'Expenses', 'Cost of sales', NULL, 'P&L', 'DR', 210, 'No VAT'),
('5020', 'Subcontractor Costs', 'Expenses', 'Cost of sales', NULL, 'P&L', 'DR', 220, 'Standard Rate'),
('5030', 'Direct Labour', 'Expenses', 'Cost of sales', NULL, 'P&L', 'DR', 230, 'No VAT'),
('5040', 'Carriage', 'Expenses', 'Cost of sales', NULL, 'P&L', 'DR', 240, 'Standard Rate'),

-- Administrative Expenses - Employee Costs
('6000', 'Wages and Salaries', 'Expenses', 'Administrative expenses', 'Employee costs', 'P&L', 'DR', 300, 'No VAT'),
('6010', 'Directors Salaries', 'Expenses', 'Administrative expenses', 'Employee costs', 'P&L', 'DR', 310, 'No VAT'),
('6020', 'Pensions', 'Expenses', 'Administrative expenses', 'Employee costs', 'P&L', 'DR', 320, 'No VAT'),
('6030', 'Bonuses', 'Expenses', 'Administrative expenses', 'Employee costs', 'P&L', 'DR', 330, 'No VAT'),
('6040', 'Employer NI', 'Expenses', 'Administrative expenses', 'Employee costs', 'P&L', 'DR', 340, 'No VAT'),
('6050', 'Staff Training and Welfare', 'Expenses', 'Administrative expenses', 'Employee costs', 'P&L', 'DR', 350, 'Standard Rate'),
('6060', 'Travel and Subsistence', 'Expenses', 'Administrative expenses', 'Employee costs', 'P&L', 'DR', 360, 'Standard Rate'),

-- Administrative Expenses - General
('6100', 'Motor Expenses', 'Expenses', 'Administrative expenses', 'General', 'P&L', 'DR', 400, 'Standard Rate'),
('6110', 'Entertaining', 'Expenses', 'Administrative expenses', 'General', 'P&L', 'DR', 410, 'Standard Rate'),
('6120', 'Telephone and Fax', 'Expenses', 'Administrative expenses', 'General', 'P&L', 'DR', 420, 'Standard Rate'),
('6130', 'Internet', 'Expenses', 'Administrative expenses', 'General', 'P&L', 'DR', 430, 'Standard Rate'),
('6140', 'Postage', 'Expenses', 'Administrative expenses', 'General', 'P&L', 'DR', 440, 'Standard Rate'),
('6150', 'Stationery and Printing', 'Expenses', 'Administrative expenses', 'General', 'P&L', 'DR', 450, 'Standard Rate'),
('6160', 'Bank Charges', 'Expenses', 'Administrative expenses', 'General', 'P&L', 'DR', 460, 'No VAT'),
('6170', 'Insurance', 'Expenses', 'Administrative expenses', 'General', 'P&L', 'DR', 470, 'No VAT'),
('6180', 'Software', 'Expenses', 'Administrative expenses', 'General', 'P&L', 'DR', 480, 'Standard Rate'),
('6190', 'Repairs and Maintenance', 'Expenses', 'Administrative expenses', 'General', 'P&L', 'DR', 490, 'Standard Rate'),
('6200', 'Depreciation', 'Expenses', 'Administrative expenses', 'General', 'P&L', 'DR', 500, 'No VAT'),

-- Administrative Expenses - Premises
('6300', 'Rent', 'Expenses', 'Administrative expenses', 'Premises costs', 'P&L', 'DR', 600, 'No VAT'),
('6310', 'Rates', 'Expenses', 'Administrative expenses', 'Premises costs', 'P&L', 'DR', 610, 'No VAT'),
('6320', 'Light and Heat', 'Expenses', 'Administrative expenses', 'Premises costs', 'P&L', 'DR', 620, 'Standard Rate'),
('6330', 'Cleaning', 'Expenses', 'Administrative expenses', 'Premises costs', 'P&L', 'DR', 630, 'Standard Rate'),

-- Administrative Expenses - Legal & Professional
('6400', 'Audit Fees', 'Expenses', 'Administrative expenses', 'Legal & professional', 'P&L', 'DR', 700, 'No VAT'),
('6410', 'Accountancy Fees', 'Expenses', 'Administrative expenses', 'Legal & professional', 'P&L', 'DR', 710, 'No VAT'),
('6420', 'Solicitors Fees', 'Expenses', 'Administrative expenses', 'Legal & professional', 'P&L', 'DR', 720, 'No VAT'),
('6430', 'Consultancy Fees', 'Expenses', 'Administrative expenses', 'Legal & professional', 'P&L', 'DR', 730, 'Standard Rate'),

-- Other Income/Expenses
('7000', 'Interest Receivable', 'Revenue', 'Interest receivable', NULL, 'P&L', 'CR', 800, 'No VAT'),
('7100', 'Interest Payable', 'Expenses', 'Interest payable', NULL, 'P&L', 'DR', 900, 'No VAT'),
('7200', 'Corporation Tax', 'Expenses', 'Taxation', NULL, 'P&L', 'DR', 1000, 'No VAT'),

-- BALANCE SHEET ACCOUNTS
-- Fixed Assets
('1000', 'Computer Equipment - Cost', 'Assets', 'Fixed Assets', 'Computer equipment', 'Balance Sheet', 'DR', 2000, 'No VAT'),
('1001', 'Computer Equipment - Depreciation', 'Assets', 'Fixed Assets', 'Computer equipment', 'Balance Sheet', 'CR', 2010, 'No VAT'),
('1100', 'Motor Vehicles - Cost', 'Assets', 'Fixed Assets', 'Motor vehicles', 'Balance Sheet', 'DR', 2100, 'No VAT'),
('1101', 'Motor Vehicles - Depreciation', 'Assets', 'Fixed Assets', 'Motor vehicles', 'Balance Sheet', 'CR', 2110, 'No VAT'),

-- Current Assets
('1200', 'Trade Debtors', 'Assets', 'Current Assets', 'Debtors', 'Balance Sheet', 'DR', 2200, 'No VAT'),
('1210', 'Other Debtors', 'Assets', 'Current Assets', 'Debtors', 'Balance Sheet', 'DR', 2210, 'No VAT'),
('1220', 'VAT Control Account', 'Assets', 'Current Assets', 'VAT', 'Balance Sheet', 'DR', 2220, 'No VAT'),
('1230', 'Prepayments', 'Assets', 'Current Assets', 'Prepayments', 'Balance Sheet', 'DR', 2230, 'No VAT'),
('1300', 'Cash at Bank', 'Assets', 'Current Assets', 'Cash', 'Balance Sheet', 'DR', 2300, 'No VAT'),
('1310', 'Petty Cash', 'Assets', 'Current Assets', 'Cash', 'Balance Sheet', 'DR', 2310, 'No VAT'),

-- Current Liabilities
('2000', 'Trade Creditors', 'Liabilities', 'Current Liabilities', 'Creditors', 'Balance Sheet', 'CR', 3000, 'No VAT'),
('2010', 'Other Creditors', 'Liabilities', 'Current Liabilities', 'Creditors', 'Balance Sheet', 'CR', 3010, 'No VAT'),
('2020', 'VAT Liability', 'Liabilities', 'Current Liabilities', 'VAT', 'Balance Sheet', 'CR', 3020, 'No VAT'),
('2030', 'PAYE/NI Liability', 'Liabilities', 'Current Liabilities', 'Taxes', 'Balance Sheet', 'CR', 3030, 'No VAT'),
('2040', 'Corporation Tax Liability', 'Liabilities', 'Current Liabilities', 'Taxes', 'Balance Sheet', 'CR', 3040, 'No VAT'),
('2050', 'Directors Loan Account', 'Liabilities', 'Current Liabilities', 'Directors loans', 'Balance Sheet', 'CR', 3050, 'No VAT'),
('2060', 'Accruals', 'Liabilities', 'Current Liabilities', 'Accruals', 'Balance Sheet', 'CR', 3060, 'No VAT'),

-- Equity
('3000', 'Share Capital', 'Equity', 'Share Capital', NULL, 'Balance Sheet', 'CR', 4000, 'No VAT'),
('3100', 'Profit and Loss Account', 'Equity', 'Retained Earnings', NULL, 'Balance Sheet', 'CR', 4100, 'No VAT'),
('3200', 'Dividends', 'Equity', 'Dividends', NULL, 'Balance Sheet', 'DR', 4200, 'No VAT');

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_chart_accounts_type ON chart_of_accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_chart_accounts_category ON chart_of_accounts(category);
CREATE INDEX IF NOT EXISTS idx_chart_accounts_section ON chart_of_accounts(section);
CREATE INDEX IF NOT EXISTS idx_chart_accounts_sort ON chart_of_accounts(sort_order);

-- Update existing transactions table to reference chart of accounts
ALTER TABLE transactions 
ADD CONSTRAINT fk_transactions_account_code 
FOREIGN KEY (account_code) REFERENCES chart_of_accounts(code);
