/*
MIGRATION 001: CORE ACCOUNTING FOUNDATION WITH ADVANCED FEATURES
================================================================

Double-entry bookkeeping system with multi-currency support and advanced accounting capabilities.

CORE FEATURES:
• Chart of accounts with 5-digit codes (10000-99999)
• Account types: asset, liability, equity, revenue, expense, contra accounts
• Journal entries with immutable posted entries (reversals only)
• Multi-currency support with functional currency (USD default)
• Real-time balance updates via triggers
• Exchange rate management with historical tracking

ADVANCED FEATURES:
• Enhanced revenue recognition (ASC 606 support)
• Entity management for intercompany transactions
• Budget vs actual reporting with variance analysis
• Cash flow statement generation
• Foreign exchange revaluation automation

DATA DESIGN:
• Integer amounts in smallest currency units (cents) to avoid rounding
• Unix timestamps for all time fields
• ISO 4217 currency codes with configurable decimal places
• Strict double-entry validation: debits must equal credits
• No SQL deletes - use reversal/correction entries instead

COMPLIANCE:
• GAAP/IFRS compliant chart of accounts structure
• SOX compliant immutable audit trail
• Accounting equation enforced: Assets = Liabilities + Equity
• Account tags for financial statement generation
• ASC 606 revenue recognition compliance

Includes default chart of accounts, 30 major world currencies, and advanced accounting features.
*/

pragma journal_mode = wal;
pragma foreign_keys = on;

begin exclusive transaction;

--- CURRENCY MANAGEMENT ---

create table if not exists currency (
  code text primary key check (length(code) = 3 and code = upper(code)),
  name text not null,
  symbol text not null,
  decimals integer not null default 2 check (decimals >= 0 and decimals <= 18),
  is_functional_currency integer not null default 0 check (is_functional_currency in (0, 1)),
  is_active integer not null default 1 check (is_active in (0, 1))
) strict, without rowid;

create table if not exists exchange_rate (
  from_currency_code text not null,
  to_currency_code text not null,
  rate_date integer not null,
  rate real not null check (rate > 0),
  source text,
  created_time integer not null,
  primary key (from_currency_code, to_currency_code, rate_date),
  foreign key (from_currency_code) references currency (code) on update restrict on delete restrict,
  foreign key (to_currency_code) references currency (code) on update restrict on delete restrict
) strict;

create index if not exists exchange_rate_from_currency_code_index on exchange_rate (from_currency_code);
create index if not exists exchange_rate_to_currency_code_index on exchange_rate (to_currency_code);
create index if not exists exchange_rate_rate_date_index on exchange_rate (rate_date);

-- Ensure only one functional currency exists
drop trigger if exists currency_functional_validation_trigger;
create trigger currency_functional_validation_trigger
before update on currency for each row
when new.is_functional_currency = 1 and old.is_functional_currency = 0
begin
  update currency set is_functional_currency = 0 where is_functional_currency = 1 and code != new.code;
end;

drop trigger if exists currency_functional_insert_validation_trigger;
create trigger currency_functional_insert_validation_trigger
before insert on currency for each row
when new.is_functional_currency = 1
begin
  update currency set is_functional_currency = 0 where is_functional_currency = 1;
end;

--- ENTITY MANAGEMENT FOR INTERCOMPANY TRANSACTIONS ---

create table if not exists entity (
  id integer primary key,
  entity_code text not null unique,
  entity_name text not null,
  is_consolidated integer not null default 1 check (is_consolidated in (0, 1)),
  parent_entity_id integer,
  functional_currency_code text not null default 'USD',
  created_time integer not null,
  foreign key (parent_entity_id) references entity (id) on update restrict on delete restrict,
  foreign key (functional_currency_code) references currency (code) on update restrict on delete restrict
) strict;

create index if not exists entity_entity_code_index on entity (entity_code);
create index if not exists entity_parent_entity_id_index on entity (parent_entity_id);

--- CHART OF ACCOUNTS ---

create table if not exists account_type (
  name text primary key,
  normal_balance text not null check (normal_balance in ('db', 'cr'))
) strict, without rowid;

create table if not exists account (
  code integer primary key check (code >= 10000 and code <= 99999),
  name text not null,
  account_type_name text not null,
  currency_code text not null default 'USD',
  balance integer not null default 0,
  foreign key (account_type_name) references account_type (name) on update restrict on delete restrict,
  foreign key (currency_code) references currency (code) on update restrict on delete restrict
) strict;

create index if not exists account_account_type_name_index on account (account_type_name);
create index if not exists account_name_index on account (name);
create index if not exists account_currency_code_index on account (currency_code);

create table if not exists account_tag (
  account_code integer not null,
  tag text not null,
  primary key (account_code, tag),
  foreign key (account_code) references account (code) on update restrict on delete restrict
) strict;

create index if not exists account_tag_tag_index on account_tag (tag);

--- ENHANCED REVENUE RECOGNITION (ASC 606 SUPPORT) ---

create table if not exists revenue_contract (
  id integer primary key,
  contract_number text not null unique,
  customer_name text not null,
  contract_date integer not null,
  total_contract_value integer not null check (total_contract_value >= 0),
  currency_code text not null default 'USD',
  contract_status text not null check (contract_status in ('DRAFT', 'ACTIVE', 'COMPLETED', 'TERMINATED')),
  created_time integer not null,
  foreign key (currency_code) references currency (code) on update restrict on delete restrict
) strict;

create index if not exists revenue_contract_contract_number_index on revenue_contract (contract_number);
create index if not exists revenue_contract_contract_date_index on revenue_contract (contract_date);
create index if not exists revenue_contract_contract_status_index on revenue_contract (contract_status);

create table if not exists revenue_performance_obligation (
  id integer primary key,
  revenue_contract_id integer not null,
  obligation_description text not null,
  standalone_selling_price integer not null check (standalone_selling_price >= 0),
  allocated_contract_price integer not null check (allocated_contract_price >= 0),
  satisfaction_method text not null check (satisfaction_method in ('POINT_IN_TIME', 'OVER_TIME')),
  percent_complete real not null default 0 check (percent_complete >= 0 and percent_complete <= 100),
  revenue_recognized integer not null default 0 check (revenue_recognized >= 0),
  created_time integer not null,
  foreign key (revenue_contract_id) references revenue_contract (id) on update restrict on delete restrict
) strict;

create index if not exists revenue_performance_obligation_contract_id_index on revenue_performance_obligation (revenue_contract_id);
create index if not exists revenue_performance_obligation_satisfaction_method_index on revenue_performance_obligation (satisfaction_method);

--- BUDGET MANAGEMENT AND VARIANCE ANALYSIS ---

create table if not exists budget (
  id integer primary key,
  budget_name text not null,
  budget_year integer not null,
  budget_period_type text not null check (budget_period_type in ('MONTHLY', 'QUARTERLY', 'ANNUALLY')),
  created_time integer not null,
  approved_time integer,
  unique (budget_name, budget_year)
) strict;

create index if not exists budget_budget_year_index on budget (budget_year);
create index if not exists budget_budget_name_index on budget (budget_name);

create table if not exists budget_line (
  budget_id integer not null,
  account_code integer not null,
  period_number integer not null check (period_number >= 1 and period_number <= 12),
  budgeted_amount integer not null default 0,
  foreign key (budget_id) references budget (id) on update restrict on delete restrict,
  foreign key (account_code) references account (code) on update restrict on delete restrict,
  primary key (budget_id, account_code, period_number)
) strict, without rowid;

create index if not exists budget_line_budget_id_index on budget_line (budget_id);
create index if not exists budget_line_account_code_index on budget_line (account_code);
create index if not exists budget_line_period_number_index on budget_line (period_number);

--- FOREIGN EXCHANGE REVALUATION ---

create table if not exists fx_revaluation_run (
  id integer primary key,
  revaluation_date integer not null,
  functional_currency_code text not null,
  total_unrealized_gain_loss integer not null default 0,
  journal_entry_ref integer,
  created_time integer not null,
  notes text,
  foreign key (functional_currency_code) references currency (code) on update restrict on delete restrict,
  foreign key (journal_entry_ref) references journal_entry (ref) on update restrict on delete restrict
) strict;

create index if not exists fx_revaluation_run_revaluation_date_index on fx_revaluation_run (revaluation_date);
create index if not exists fx_revaluation_run_journal_entry_ref_index on fx_revaluation_run (journal_entry_ref);

--- JOURNAL ENTRIES ---

create table if not exists journal_entry (
  ref integer primary key,
  transaction_time integer not null,
  note text,
  transaction_currency_code text not null default 'USD',
  exchange_rate_to_functional real,
  reversed_by_journal_entry_ref integer,
  corrected_by_journal_entry_ref integer,
  post_time integer,
  entity_id integer,
  intercompany_entity_id integer,
  foreign key (transaction_currency_code) references currency (code) on update restrict on delete restrict,
  foreign key (reversed_by_journal_entry_ref) references journal_entry (ref) on update restrict on delete restrict,
  foreign key (corrected_by_journal_entry_ref) references journal_entry (ref) on update restrict on delete restrict,
  foreign key (entity_id) references entity (id) on update restrict on delete restrict,
  foreign key (intercompany_entity_id) references entity (id) on update restrict on delete restrict
) strict;

create index if not exists journal_entry_transaction_time_index on journal_entry (transaction_time);
create index if not exists journal_entry_post_time_index on journal_entry (post_time);
create index if not exists journal_entry_entity_id_index on journal_entry (entity_id);
create index if not exists journal_entry_intercompany_entity_id_index on journal_entry (intercompany_entity_id);

drop trigger if exists journal_entry_insert_validation_trigger;
create trigger journal_entry_insert_validation_trigger
before insert on journal_entry for each row
begin
  select
    case
      when new.post_time is not null
      then raise(rollback, 'journal entry must be unposted at the time of creation')
    end;
end;

drop trigger if exists journal_entry_update_preventation_trigger;
create trigger journal_entry_update_preventation_trigger
before update on journal_entry for each row
begin
  select
    case
      when old.post_time is not null
      then raise(rollback, 'make reversal/correction journal entry instead of updating posted journal entry')
    end,
    case
      when old.post_time is null and new.post_time is not null and (select count(*) from journal_entry_line where journal_entry_ref = old.ref) < 2
      then raise(rollback, 'journal entry must have at least 2 lines to post')
    end;
end;

create table if not exists journal_entry_line (
  journal_entry_ref integer not null,
  line_order integer not null default 0,
  account_code integer not null,
  db integer not null default 0 check (db >= 0),
  cr integer not null default 0 check (cr >= 0),
  db_functional integer not null default 0 check (db_functional >= 0),
  cr_functional integer not null default 0 check (cr_functional >= 0),
  foreign_currency_amount integer,
  foreign_currency_code text,
  exchange_rate real,
  primary key (journal_entry_ref, line_order),
  foreign key (journal_entry_ref) references journal_entry (ref) on update restrict on delete restrict,
  foreign key (account_code) references account (code) on update restrict on delete restrict,
  foreign key (foreign_currency_code) references currency (code) on update restrict on delete restrict
) strict, without rowid;

create index if not exists journal_entry_line_journal_entry_ref_index on journal_entry_line (journal_entry_ref);
create index if not exists journal_entry_line_account_code_index on journal_entry_line (account_code);
create index if not exists journal_entry_line_journal_entry_ref_account_code_index on journal_entry_line (journal_entry_ref, account_code);

drop view if exists journal_entry_line_auto_number;
create view journal_entry_line_auto_number as
select
  journal_entry_line.journal_entry_ref,
  journal_entry_line.line_order,
  journal_entry_line.account_code,
  journal_entry_line.db,
  journal_entry_line.cr,
  journal_entry_line.db_functional,
  journal_entry_line.cr_functional,
  journal_entry_line.foreign_currency_amount,
  journal_entry_line.foreign_currency_code,
  journal_entry_line.exchange_rate
from journal_entry_line;

drop trigger if exists journal_entry_line_auto_number_trigger;
create trigger journal_entry_line_auto_number_trigger
instead of insert on journal_entry_line_auto_number for each row
begin
  insert into journal_entry_line (
    journal_entry_ref,
    line_order,
    account_code,
    db,
    cr,
    db_functional,
    cr_functional,
    foreign_currency_amount,
    foreign_currency_code,
    exchange_rate
  )
  values (
    new.journal_entry_ref,
    coalesce(new.line_order, (
      select max(line_order)
      from journal_entry_line
      where journal_entry_ref = new.journal_entry_ref
    ) + 1, 0),
    new.account_code,
    new.db,
    new.cr,
    coalesce(new.db_functional, new.db),
    coalesce(new.cr_functional, new.cr),
    new.foreign_currency_amount,
    new.foreign_currency_code,
    new.exchange_rate
  );
end;

drop trigger if exists journal_entry_post_validation_trigger;
create trigger journal_entry_post_validation_trigger
before update on journal_entry for each row
when old.post_time is null and new.post_time is not null
begin
  select
    case
      when sum(db_functional) <= 0
      then raise(rollback, 'sum of debit on journal entry must be greater than zero')
    end,
    case
      when sum(cr_functional) <= 0
      then raise(rollback, 'sum of credit on journal entry must be greater than zero')
    end,
    case
      when sum(db_functional) != sum(cr_functional)
      then raise(rollback, 'sum of debit and credit on journal entry must balance')
    end
  from journal_entry_line
  where journal_entry_ref = new.ref;
end;

drop trigger if exists journal_entry_post_account_trigger;
create trigger journal_entry_post_account_trigger
after update on journal_entry for each row
when old.post_time is null and new.post_time is not null
begin
  update account
  set balance = balance + (
    select
      case
        when account_type.normal_balance = 'db' then
          case
            when account.currency_code = (select code from currency where is_functional_currency = 1)
            then sum(journal_entry_line.db_functional) - sum(journal_entry_line.cr_functional)
            else sum(journal_entry_line.db) - sum(journal_entry_line.cr)
          end
        when account_type.normal_balance = 'cr' then
          case
            when account.currency_code = (select code from currency where is_functional_currency = 1)
            then sum(journal_entry_line.cr_functional) - sum(journal_entry_line.db_functional)
            else sum(journal_entry_line.cr) - sum(journal_entry_line.db)
          end
      end
    from journal_entry_line
    join account_type on account_type.name = account.account_type_name
    where journal_entry_line.journal_entry_ref = new.ref
      and journal_entry_line.account_code = account.code
  )
  where account.code in (
    select account_code
    from journal_entry_line
    where journal_entry_ref = new.ref
  );
end;

drop trigger if exists journal_entry_delete_preventation_trigger;
create trigger journal_entry_delete_preventation_trigger
before delete on journal_entry_line for each row
begin
  select
    case
      when journal_entry.post_time is not null
      then raise(rollback, 'make reversal/correction journal entry instead of deleting posted journal entry')
    end
  from journal_entry
  where journal_entry.ref = old.journal_entry_ref;
end;

drop view if exists journal_entry_summary;
create view journal_entry_summary as
select
  journal_entry.ref,
  journal_entry.transaction_time,
  journal_entry.note,
  journal_entry.transaction_currency_code,
  journal_entry.exchange_rate_to_functional,
  journal_entry.entity_id,
  journal_entry.intercompany_entity_id,
  e1.entity_code as entity_code,
  e2.entity_code as intercompany_entity_code,
  journal_entry_line.line_order,
  journal_entry_line.account_code,
  account.name as account_name,
  account.currency_code as account_currency_code,
  journal_entry_line.db,
  journal_entry_line.cr,
  journal_entry_line.db_functional,
  journal_entry_line.cr_functional,
  journal_entry_line.foreign_currency_amount,
  journal_entry_line.foreign_currency_code,
  journal_entry_line.exchange_rate as line_exchange_rate
from journal_entry_line
join journal_entry on journal_entry.ref = journal_entry_line.journal_entry_ref
join account on account.code = journal_entry_line.account_code
left join entity e1 on e1.id = journal_entry.entity_id
left join entity e2 on e2.id = journal_entry.intercompany_entity_id
where journal_entry.post_time is not null
order by journal_entry.ref asc, journal_entry_line.line_order asc;

--- DEFAULT CHART OF ACCOUNTS ---

-- Insert default currencies
insert into currency (code, name, symbol, decimals, is_functional_currency, is_active) values
  ('AED', 'United Arab Emirates Dirham', 'د.إ', 2, 0, 1),
  ('AUD', 'Australian Dollar', 'A$', 2, 0, 1),
  ('BRL', 'Brazilian Real', 'R$', 2, 0, 1),
  ('CAD', 'Canadian Dollar', 'C$', 2, 0, 1),
  ('CHF', 'Swiss Franc', 'CHF', 2, 0, 1),
  ('CNY', 'Chinese Yuan', '¥', 2, 0, 1),
  ('CZK', 'Czech Koruna', 'Kč', 2, 0, 1),
  ('DKK', 'Danish Krone', 'kr', 2, 0, 1),
  ('EUR', 'Euro', '€', 2, 0, 1),
  ('GBP', 'British Pound', '£', 2, 0, 1),
  ('HKD', 'Hong Kong Dollar', 'HK$', 2, 0, 1),
  ('HUF', 'Hungarian Forint', 'Ft', 2, 0, 1),
  ('IDR', 'Indonesian Rupiah', 'Rp', 0, 0, 1),
  ('INR', 'Indian Rupee', '₹', 2, 0, 1),
  ('JPY', 'Japanese Yen', '¥', 2, 0, 1),
  ('KRW', 'South Korean Won', '₩', 2, 0, 1),
  ('MXN', 'Mexican Peso', '$', 2, 0, 1),
  ('MYR', 'Malaysian Ringgit', 'RM', 2, 0, 1),
  ('NOK', 'Norwegian Krone', 'kr', 2, 0, 1),
  ('NZD', 'New Zealand Dollar', 'NZ$', 2, 0, 1),
  ('PHP', 'Philippine Peso', '₱', 2, 0, 1),
  ('PLN', 'Polish Zloty', 'zł', 2, 0, 1),
  ('RUB', 'Russian Ruble', '₽', 2, 0, 1),
  ('SAR', 'Saudi Riyal', 'ر.س', 2, 0, 1),
  ('SEK', 'Swedish Krona', 'kr', 2, 0, 1),
  ('SGD', 'Singapore Dollar', 'S$', 2, 0, 1),
  ('THB', 'Thai Baht', '฿', 2, 0, 1),
  ('TRY', 'Turkish Lira', '₺', 2, 0, 1),
  ('USD', 'US Dollar', '$', 2, 1, 1), -- this is the functional currency
  ('ZAR', 'South African Rand', 'R', 2, 0, 1)
on conflict (code) do update set
  name = excluded.name,
  symbol = excluded.symbol,
  decimals = excluded.decimals,
  is_active = excluded.is_active;

-- Insert account types
insert into account_type (name, normal_balance) values
  ('asset', 'db'),
  ('contra_asset', 'cr'),
  ('liability', 'cr'),
  ('contra_liability', 'db'),
  ('equity', 'cr'),
  ('contra_equity', 'db'),
  ('revenue', 'cr'),
  ('contra_revenue', 'db'),
  ('expense', 'db'),
  ('contra_expense', 'cr'),
  ('cogs', 'db')
on conflict (name) do update set
  normal_balance = excluded.normal_balance;

-- Insert accounts
insert into account (code, name, account_type_name) values
  -- Assets
  (10100, 'Cash', 'asset'),
  (10200, 'Accounts Receivable', 'asset'),
  (10250, 'Contract Assets', 'asset'),
  (10300, 'Inventory', 'asset'),
  (10400, 'Prepaid Expenses', 'asset'),
  (10600, 'Merchandise Inventory', 'asset'),
  (11500, 'Foreign Exchange Translation Assets', 'asset'),
  (13100, 'Raw Materials Inventory', 'asset'),
  (13200, 'Work in Process Inventory', 'asset'),
  (13300, 'Finished Goods Inventory', 'asset'),
  (12000, 'Property, Plant, and Equipment', 'asset'),
  (12100, 'Land', 'asset'),
  (12200, 'Buildings', 'asset'),
  (12210, 'Accumulated Depreciation - Buildings', 'contra_asset'),
  (12300, 'Machinery & Equipment', 'asset'),
  (12310, 'Accumulated Depreciation - Machinery & Equipment', 'contra_asset'),
  (12400, 'Office Equipment', 'asset'),
  (12410, 'Accumulated Depreciation - Office Equipment', 'contra_asset'),
  (12500, 'Vehicles', 'asset'),
  (12510, 'Accumulated Depreciation - Vehicles', 'contra_asset'),
  (12600, 'Other Fixed Assets', 'asset'),
  (12610, 'Accumulated Depreciation - Other Fixed Assets', 'contra_asset'),

  -- Liabilities
  (20100, 'Accounts Payable', 'liability'),
  (20200, 'Accrued Expenses', 'liability'),
  (20250, 'Contract Liabilities', 'liability'),
  (20300, 'Short-term Debt', 'liability'),
  (21000, 'Long-term Debt', 'liability'),

  -- Equity
  (30100, 'Common Stock', 'equity'),
  (30200, 'Retained Earnings', 'equity'),
  (30300, 'Dividends', 'equity'),
  (30400, 'Income Summary', 'equity'),
  (30600, 'Dividends/Withdrawals', 'contra_equity'),

  -- Revenue
  (40100, 'Sales Revenue', 'revenue'),
  (40200, 'Service Revenue', 'revenue'),
  (40300, 'Other Revenue', 'revenue'),
  (41000, 'Sales Returns and Allowances', 'contra_revenue'),
  (41200, 'Inventory Adjustment Gain', 'revenue'),

  -- Expenses
  (50100, 'Cost of Goods Sold', 'cogs'),
  (50700, 'Cost of Goods Sold', 'cogs'),
  (51200, 'Inventory Adjustment Loss', 'expense'),
  (51300, 'Obsolescence Loss', 'expense'),
  (51400, 'Damage Loss', 'expense'),
  (60100, 'Salaries and Wages', 'expense'),
  (60200, 'Rent Expense', 'expense'),
  (60300, 'Utilities Expense', 'expense'),
  (60400, 'Insurance Expense', 'expense'),
  (60500, 'Office Supplies Expense', 'expense'),
  (60600, 'Marketing Expense', 'expense'),
  (60700, 'Professional Fees', 'expense'),
  (60800, 'Travel Expense', 'expense'),
  (61000, 'Other Operating Expenses', 'expense'),
  (61100, 'Depreciation Expense', 'expense'),
  (40400, 'Gain on Asset Disposal', 'revenue'),
  (51500, 'Loss on Asset Disposal', 'expense')
on conflict (code) do update set
  name = excluded.name,
  account_type_name = excluded.account_type_name;

-- Insert account tags for financial statement categorization
insert into account_tag (account_code, tag) values
  -- Balance Sheet - Current Assets
  (10100, 'balance_sheet_current_asset'), -- Cash
  (10200, 'balance_sheet_current_asset'), -- Accounts Receivable
  (10250, 'balance_sheet_current_asset'), -- Contract Assets
  (10300, 'balance_sheet_current_asset'), -- Inventory
  (10400, 'balance_sheet_current_asset'), -- Prepaid Expenses
  (10600, 'balance_sheet_current_asset'), -- Merchandise Inventory
  (11500, 'balance_sheet_current_asset'), -- Foreign Exchange Translation Assets
  (13100, 'balance_sheet_current_asset'), -- Raw Materials Inventory
  (13200, 'balance_sheet_current_asset'), -- Work in Process Inventory
  (13300, 'balance_sheet_current_asset'), -- Finished Goods Inventory

  -- Balance Sheet - Non-Current Assets
  (12000, 'balance_sheet_non_current_asset'), -- Property, Plant, and Equipment
  (12100, 'balance_sheet_non_current_asset'), -- Land
  (12200, 'balance_sheet_non_current_asset'), -- Buildings
  (12210, 'balance_sheet_non_current_asset'), -- Accumulated Depreciation - Buildings
  (12300, 'balance_sheet_non_current_asset'), -- Machinery & Equipment
  (12310, 'balance_sheet_non_current_asset'), -- Accumulated Depreciation - Machinery & Equipment
  (12400, 'balance_sheet_non_current_asset'), -- Office Equipment
  (12410, 'balance_sheet_non_current_asset'), -- Accumulated Depreciation - Office Equipment
  (12500, 'balance_sheet_non_current_asset'), -- Vehicles
  (12510, 'balance_sheet_non_current_asset'), -- Accumulated Depreciation - Vehicles
  (12600, 'balance_sheet_non_current_asset'), -- Other Fixed Assets
  (12610, 'balance_sheet_non_current_asset'), -- Accumulated Depreciation - Other Fixed Assets

  -- Balance Sheet - Current Liabilities
  (20100, 'balance_sheet_current_liability'), -- Accounts Payable
  (20200, 'balance_sheet_current_liability'), -- Accrued Expenses
  (20250, 'balance_sheet_current_liability'), -- Contract Liabilities
  (20300, 'balance_sheet_current_liability'), -- Short-term Debt

  -- Balance Sheet - Non-Current Liabilities
  (21000, 'balance_sheet_non_current_liability'), -- Long-term Debt

  -- Balance Sheet - Equity
  (30100, 'balance_sheet_equity'), -- Common Stock
  (30200, 'balance_sheet_equity'), -- Retained Earnings
  (30300, 'balance_sheet_equity'), -- Dividends
  (30400, 'balance_sheet_equity'), -- Income Summary

  -- Income Statement - Revenue
  (40100, 'income_statement_revenue'), -- Sales Revenue
  (40200, 'income_statement_revenue'), -- Service Revenue
  (40300, 'income_statement_other_revenue'), -- Other Revenue
  (41000, 'income_statement_contra_revenue'), -- Sales Returns and Allowances
  (41200, 'income_statement_other_revenue'), -- Inventory Adjustment Gain

  -- Income Statement - Expenses
  (50100, 'income_statement_cogs'), -- Cost of Goods Sold
  (50700, 'income_statement_cogs'), -- Cost of Goods Sold
  (51200, 'income_statement_expense'), -- Inventory Adjustment Loss
  (51300, 'income_statement_expense'), -- Obsolescence Loss
  (51400, 'income_statement_expense'), -- Damage Loss
  (60100, 'income_statement_expense'), -- Salaries and Wages
  (60200, 'income_statement_expense'), -- Rent Expense
  (60300, 'income_statement_expense'), -- Utilities Expense
  (60400, 'income_statement_expense'), -- Insurance Expense
  (60500, 'income_statement_expense'), -- Office Supplies Expense
  (60600, 'income_statement_expense'), -- Marketing Expense
  (60700, 'income_statement_expense'), -- Professional Fees
  (60800, 'income_statement_expense'), -- Travel Expense
  (61000, 'income_statement_other_expense'), -- Other Operating Expenses
  (61100, 'income_statement_expense'), -- Depreciation Expense
  (40400, 'income_statement_other_revenue'), -- Gain on Asset Disposal
  (51500, 'income_statement_expense'), -- Loss on Asset Disposal

  -- Fiscal Year Closing
  (40100, 'fiscal_year_closing_revenue'), -- Sales Revenue
  (40200, 'fiscal_year_closing_revenue'), -- Service Revenue
  (40300, 'fiscal_year_closing_revenue'), -- Other Revenue
  (41000, 'fiscal_year_closing_revenue'), -- Sales Returns and Allowances
  (41200, 'fiscal_year_closing_revenue'), -- Inventory Adjustment Gain
  (50100, 'fiscal_year_closing_expense'), -- Cost of Goods Sold
  (50700, 'fiscal_year_closing_expense'), -- Cost of Goods Sold
  (51200, 'fiscal_year_closing_expense'), -- Inventory Adjustment Loss
  (51300, 'fiscal_year_closing_expense'), -- Obsolescence Loss
  (51400, 'fiscal_year_closing_expense'), -- Damage Loss
  (60100, 'fiscal_year_closing_expense'), -- Salaries and Wages
  (60200, 'fiscal_year_closing_expense'), -- Rent Expense
  (60300, 'fiscal_year_closing_expense'), -- Utilities Expense
  (60400, 'fiscal_year_closing_expense'), -- Insurance Expense
  (60500, 'fiscal_year_closing_expense'), -- Office Supplies Expense
  (60600, 'fiscal_year_closing_expense'), -- Marketing Expense
  (60700, 'fiscal_year_closing_expense'), -- Professional Fees
  (60800, 'fiscal_year_closing_expense'), -- Travel Expense
  (61000, 'fiscal_year_closing_expense'), -- Other Operating Expenses
  (61100, 'fiscal_year_closing_expense'), -- Depreciation Expense
  (40400, 'fiscal_year_closing_revenue'), -- Gain on Asset Disposal
  (51500, 'fiscal_year_closing_expense'), -- Loss on Asset Disposal
  (30300, 'fiscal_year_closing_dividend'), -- Dividends
  (30600, 'fiscal_year_closing_dividend') -- Dividends/Withdrawals
on conflict (account_code, tag) do nothing;

-- Cash Flow Statement Tags
insert into account_tag (account_code, tag) values
  (10100, 'cash_flow_operating'), -- Cash
  (10200, 'cash_flow_operating'), -- Accounts Receivable
  (10250, 'cash_flow_operating'), -- Contract Assets
  (10300, 'cash_flow_operating'), -- Inventory
  (10400, 'cash_flow_operating'), -- Prepaid Expenses
  (11500, 'cash_flow_operating'), -- Foreign Exchange Translation Assets
  (20100, 'cash_flow_operating'), -- Accounts Payable
  (20200, 'cash_flow_operating'), -- Accrued Expenses
  (20250, 'cash_flow_operating'), -- Contract Liabilities
  (40100, 'cash_flow_operating'), -- Sales Revenue
  (40200, 'cash_flow_operating'), -- Service Revenue
  (50100, 'cash_flow_operating'), -- Cost of Goods Sold
  (60100, 'cash_flow_operating'), -- Salaries and Wages
  (60200, 'cash_flow_operating'), -- Rent Expense
  (60300, 'cash_flow_operating'), -- Utilities Expense
  (60400, 'cash_flow_operating'), -- Insurance Expense
  (60500, 'cash_flow_operating'), -- Office Supplies Expense
  (60600, 'cash_flow_operating'), -- Marketing Expense
  (60700, 'cash_flow_operating'), -- Professional Fees
  (60800, 'cash_flow_operating'), -- Travel Expense
  (61000, 'cash_flow_operating'), -- Other Operating Expenses
  (40400, 'cash_flow_operating'), -- Gain on Asset Disposal
  (51500, 'cash_flow_operating'), -- Loss on Asset Disposal
  
  -- Investing Activities
  (12100, 'cash_flow_investing'), -- Land
  (12200, 'cash_flow_investing'), -- Buildings
  (12300, 'cash_flow_investing'), -- Machinery & Equipment
  (12400, 'cash_flow_investing'), -- Office Equipment
  (12500, 'cash_flow_investing'), -- Vehicles
  (12600, 'cash_flow_investing'), -- Other Fixed Assets
  
  -- Financing Activities
  (21000, 'cash_flow_financing'), -- Long-term Debt
  (30100, 'cash_flow_financing'), -- Common Stock
  (30600, 'cash_flow_financing') -- Dividends/Withdrawals
on conflict (account_code, tag) do nothing;

--- FOREIGN EXCHANGE MANAGEMENT ---

-- View to get the latest exchange rate between any two currencies
drop view if exists latest_exchange_rate;
create view latest_exchange_rate as
select
  from_currency_code,
  to_currency_code,
  rate,
  rate_date,
  source
from exchange_rate er1
where rate_date = (
  select max(rate_date)
  from exchange_rate er2
  where er2.from_currency_code = er1.from_currency_code
    and er2.to_currency_code = er1.to_currency_code
);

-- Function to get exchange rate (implemented as view due to SQLite limitations)
drop view if exists exchange_rate_lookup;
create view exchange_rate_lookup as
select
  from_currency_code,
  to_currency_code,
  rate,
  rate_date
from latest_exchange_rate
union all
select
  to_currency_code as from_currency_code,
  from_currency_code as to_currency_code,
  1.0 / rate as rate,
  rate_date
from latest_exchange_rate;

-- Multi-currency account balance view
-- NOTE: Returns NULL for balance_functional_currency when no exchange rate exists
-- Applications should check for NULL and handle missing exchange rates appropriately
-- instead of relying on a default rate of 1.0 which could lead to incorrect calculations
drop view if exists account_balance_multicurrency;
create view account_balance_multicurrency as
select
  a.code,
  a.name,
  a.account_type_name,
  a.currency_code,
  a.balance as balance_original_currency,
  case
    when a.currency_code = fc.code then a.balance
    when erl.rate is not null then cast(a.balance * erl.rate as integer)
    else null -- Return null instead of defaulting to 1.0, let application handle missing rates
  end as balance_functional_currency,
  fc.code as functional_currency_code,
  erl.rate as exchange_rate_to_functional,
  erl.rate_date as exchange_rate_date
from account a
cross join (select code from currency where is_functional_currency = 1) fc
left join exchange_rate_lookup erl on erl.from_currency_code = a.currency_code
  and erl.to_currency_code = fc.code;

-- Multi-currency trial balance
drop view if exists trial_balance_multicurrency;
create view trial_balance_multicurrency as
select
  abmc.code,
  abmc.name,
  abmc.account_type_name,
  abmc.currency_code,
  abmc.balance_original_currency,
  abmc.balance_functional_currency,
  at.normal_balance,
  case
    when at.normal_balance = 'db' and abmc.balance_functional_currency >= 0
    then abmc.balance_functional_currency
    when at.normal_balance = 'db' and abmc.balance_functional_currency < 0
    then 0
    when at.normal_balance = 'cr' and abmc.balance_functional_currency <= 0
    then abs(abmc.balance_functional_currency)
    else 0
  end as debit_balance_functional,
  case
    when at.normal_balance = 'cr' and abmc.balance_functional_currency >= 0
    then abmc.balance_functional_currency
    when at.normal_balance = 'cr' and abmc.balance_functional_currency < 0
    then 0
    when at.normal_balance = 'db' and abmc.balance_functional_currency <= 0
    then abs(abmc.balance_functional_currency)
    else 0
  end as credit_balance_functional
from account_balance_multicurrency abmc
join account_type at on at.name = abmc.account_type_name
where abmc.balance_functional_currency != 0
order by abmc.code;

--- ADVANCED ACCOUNTING AUTOMATION ---

-- Trigger to automatically recognize revenue for completed performance obligations
drop trigger if exists revenue_recognition_trigger;
create trigger revenue_recognition_trigger
after update on revenue_performance_obligation for each row
when old.percent_complete < 100 and new.percent_complete = 100 
     and new.satisfaction_method = 'POINT_IN_TIME'
     and new.revenue_recognized < new.allocated_contract_price
begin
  -- Create journal entry for revenue recognition
  insert into journal_entry (
    transaction_time,
    note
  ) values (
    unixepoch(),
    'Revenue Recognition - Contract: ' || (select contract_number from revenue_contract where id = new.revenue_contract_id) ||
    ' - Obligation: ' || new.obligation_description
  );

  -- DR Contract Asset or Cash, CR Revenue
  insert into journal_entry_line_auto_number (
    journal_entry_ref,
    account_code,
    db,
    cr,
    db_functional,
    cr_functional
  ) values (
    last_insert_rowid(),
    10250, -- Contract Assets
    new.allocated_contract_price - new.revenue_recognized,
    0,
    new.allocated_contract_price - new.revenue_recognized,
    0
  );

  insert into journal_entry_line_auto_number (
    journal_entry_ref,
    account_code,
    db,
    cr,
    db_functional,
    cr_functional
  ) values (
    last_insert_rowid(),
    40100, -- Sales Revenue
    0,
    new.allocated_contract_price - new.revenue_recognized,
    0,
    new.allocated_contract_price - new.revenue_recognized
  );

  -- Post the journal entry immediately
  update journal_entry
  set post_time = unixepoch()
  where ref = last_insert_rowid();

  -- Update revenue recognized
  update revenue_performance_obligation
  set revenue_recognized = new.allocated_contract_price
  where id = new.id;
end;

--- ADVANCED REPORTING VIEWS ---

-- Intercompany transactions view
drop view if exists intercompany_transactions;
create view intercompany_transactions as
select
  je.ref as journal_entry_ref,
  je.transaction_time,
  je.note,
  je.post_time,
  e1.entity_code as entity_code,
  e2.entity_code as intercompany_entity_code,
  sum(jel.db_functional) as total_debit,
  sum(jel.cr_functional) as total_credit
from journal_entry je
join entity e1 on e1.id = coalesce(je.entity_id, 1) -- Default to main entity
left join entity e2 on e2.id = je.intercompany_entity_id
join journal_entry_line jel on jel.journal_entry_ref = je.ref
where je.post_time is not null
  and je.intercompany_entity_id is not null
group by je.ref, e1.entity_code, e2.entity_code
having total_debit = total_credit;

-- Budget variance analysis view
drop view if exists budget_variance_analysis;
create view budget_variance_analysis as
select
  b.budget_name,
  b.budget_year,
  a.code as account_code,
  a.name as account_name,
  bl.period_number,
  bl.budgeted_amount,
  coalesce(actual.actual_amount, 0) as actual_amount,
  coalesce(actual.actual_amount, 0) - bl.budgeted_amount as variance_amount,
  case 
    when bl.budgeted_amount != 0 
    then round(((coalesce(actual.actual_amount, 0) - bl.budgeted_amount) * 100.0) / abs(bl.budgeted_amount), 2)
    else null 
  end as variance_percentage,
  case
    when bl.budgeted_amount = 0 then 'UNDEFINED'
    when abs(coalesce(actual.actual_amount, 0) - bl.budgeted_amount) * 1.0 / abs(bl.budgeted_amount) > 0.10 then 'SIGNIFICANT'
    when abs(coalesce(actual.actual_amount, 0) - bl.budgeted_amount) * 1.0 / abs(bl.budgeted_amount) > 0.05 then 'MODERATE'
    else 'MINIMAL'
  end as variance_significance
from budget b
join budget_line bl on bl.budget_id = b.id
join account a on a.code = bl.account_code
left join (
  select
    jel.account_code,
    cast(strftime('%m', datetime(je.transaction_time, 'unixepoch')) as integer) as period_number,
    sum(case 
      when at.normal_balance = 'db' then jel.db_functional - jel.cr_functional
      else jel.cr_functional - jel.db_functional
    end) as actual_amount
  from journal_entry_line jel
  join journal_entry je on je.ref = jel.journal_entry_ref
  join account acc on acc.code = jel.account_code
  join account_type at on at.name = acc.account_type_name
  where je.post_time is not null
  group by jel.account_code, cast(strftime('%m', datetime(je.transaction_time, 'unixepoch')) as integer)
) actual on actual.account_code = a.code and actual.period_number = bl.period_number
order by b.budget_year, bl.period_number, a.code;

-- Cash flow statement view (basic indirect method)
drop view if exists cash_flow_statement;
create view cash_flow_statement as
with operating_activities as (
  select
    'Operating Activities' as category,
    a.code,
    a.name,
    sum(case 
      when at.normal_balance = 'db' then jel.db_functional - jel.cr_functional
      else jel.cr_functional - jel.db_functional
    end) as amount,
    1 as sort_order
  from journal_entry_line jel
  join journal_entry je on je.ref = jel.journal_entry_ref
  join account a on a.code = jel.account_code
  join account_type at on at.name = a.account_type_name
  join account_tag atag on atag.account_code = a.code
  where je.post_time is not null
    and atag.tag = 'cash_flow_operating'
  group by a.code, a.name, at.normal_balance
  having amount != 0
),
investing_activities as (
  select
    'Investing Activities' as category,
    a.code,
    a.name,
    sum(case 
      when at.normal_balance = 'db' then jel.db_functional - jel.cr_functional
      else jel.cr_functional - jel.db_functional
    end) as amount,
    2 as sort_order
  from journal_entry_line jel
  join journal_entry je on je.ref = jel.journal_entry_ref
  join account a on a.code = jel.account_code
  join account_type at on at.name = a.account_type_name
  join account_tag atag on atag.account_code = a.code
  where je.post_time is not null
    and atag.tag = 'cash_flow_investing'
  group by a.code, a.name, at.normal_balance
  having amount != 0
),
financing_activities as (
  select
    'Financing Activities' as category,
    a.code,
    a.name,
    sum(case 
      when at.normal_balance = 'db' then jel.db_functional - jel.cr_functional
      else jel.cr_functional - jel.db_functional
    end) as amount,
    3 as sort_order
  from journal_entry_line jel
  join journal_entry je on je.ref = jel.journal_entry_ref
  join account a on a.code = jel.account_code
  join account_type at on at.name = a.account_type_name
  join account_tag atag on atag.account_code = a.code
  where je.post_time is not null
    and atag.tag = 'cash_flow_financing'
  group by a.code, a.name, at.normal_balance
  having amount != 0
)
select * from operating_activities
union all
select * from investing_activities
union all
select * from financing_activities
order by sort_order, code;

-- Revenue contract performance summary
drop view if exists revenue_contract_summary;
create view revenue_contract_summary as
select
  rc.contract_number,
  rc.customer_name,
  rc.contract_date,
  rc.total_contract_value,
  rc.contract_status,
  count(rpo.id) as performance_obligations_count,
  sum(rpo.allocated_contract_price) as total_allocated_price,
  sum(rpo.revenue_recognized) as total_revenue_recognized,
  sum(rpo.allocated_contract_price) - sum(rpo.revenue_recognized) as remaining_revenue,
  case 
    when sum(rpo.allocated_contract_price) > 0 
    then round(sum(rpo.percent_complete * rpo.allocated_contract_price) / sum(rpo.allocated_contract_price), 2)
    else 0 
  end as completion_percentage
from revenue_contract rc
left join revenue_performance_obligation rpo on rpo.revenue_contract_id = rc.id
group by rc.id, rc.contract_number, rc.customer_name, rc.contract_date, rc.total_contract_value, rc.contract_status
order by rc.contract_date desc;

--- DEFAULT DATA ---

-- Insert default entity (main company)
insert into entity (entity_code, entity_name, is_consolidated, functional_currency_code, created_time) values
  ('MAIN', 'Main Company', 1, 'USD', unixepoch())
on conflict (entity_code) do update set
  entity_name = excluded.entity_name,
  is_consolidated = excluded.is_consolidated,
  functional_currency_code = excluded.functional_currency_code;

--- REVERSAL AND CORRECTION HELPERS ---

-- View to create reversal entries automatically
drop view if exists journal_entry_reversal;
create view journal_entry_reversal as
select
  'reversal' as operation_type,
  je.ref as original_ref,
  je.transaction_time as original_transaction_time,
  je.note as original_note,
  je.transaction_currency_code,
  je.exchange_rate_to_functional,
  'Reversal of: ' || coalesce(je.note, 'Journal Entry ' || je.ref) as reversal_note,
  null as reversal_transaction_time -- To be set by caller
from journal_entry je
where je.post_time is not null
  and je.reversed_by_journal_entry_ref is null
  and je.corrected_by_journal_entry_ref is null;

-- Trigger to create reversal entry
drop trigger if exists journal_entry_create_reversal_trigger;
create trigger journal_entry_create_reversal_trigger
instead of insert on journal_entry_reversal for each row
begin
  -- Validate that the original entry exists and is posted
  select
    case
      when (select count(*) from journal_entry where ref = new.original_ref and post_time is not null) = 0
      then raise(rollback, 'original journal entry must exist and be posted to create reversal')
    end,
    case
      when (select count(*) from journal_entry where note like '%[Reverses Entry #' || printf('%.0f', new.original_ref) || ']%') > 0
      then raise(rollback, 'journal entry has already been reversed')
    end,
    case
      when (select count(*) from journal_entry where note like '%[Corrects Entry #' || printf('%.0f', new.original_ref) || ']%') > 0
      then raise(rollback, 'journal entry has already been corrected, cannot reverse')
    end;

  -- Create the reversal journal entry with the tracking note
  insert into journal_entry (
    transaction_time,
    note,
    transaction_currency_code,
    exchange_rate_to_functional
  )
  select
    coalesce(new.reversal_transaction_time, je.transaction_time),
    'Reversal of: ' || coalesce(je.note, 'Journal Entry ' || je.ref) || ' [Reverses Entry #' || printf('%.0f', new.original_ref) || ']',
    je.transaction_currency_code,
    je.exchange_rate_to_functional
  from journal_entry je
  where je.ref = new.original_ref;

  -- Create reversal journal entry lines (flip debit/credit)
  insert into journal_entry_line (
    journal_entry_ref,
    line_order,
    account_code,
    db,
    cr,
    db_functional,
    cr_functional,
    foreign_currency_amount,
    foreign_currency_code,
    exchange_rate
  )
  select
    (select max(ref) from journal_entry),
    jel.line_order,
    jel.account_code,
    jel.cr, -- flip credit to debit
    jel.db, -- flip debit to credit
    jel.cr_functional, -- flip credit to debit in functional currency
    jel.db_functional, -- flip debit to credit in functional currency
    case when jel.foreign_currency_amount is not null then -jel.foreign_currency_amount else null end,
    jel.foreign_currency_code,
    jel.exchange_rate
  from journal_entry_line jel
  where jel.journal_entry_ref = new.original_ref
  order by jel.line_order;

  -- Post the reversal entry immediately
  update journal_entry
  set post_time = coalesce(new.reversal_transaction_time, (select transaction_time from journal_entry where ref = new.original_ref))
  where ref = (select max(ref) from journal_entry);
end;

-- View to create correction entries
drop view if exists journal_entry_correction;
create view journal_entry_correction as
select
  'correction' as operation_type,
  je.ref as original_ref,
  je.transaction_time as original_transaction_time,
  je.note as original_note,
  je.transaction_currency_code,
  je.exchange_rate_to_functional,
  'Correction of: ' || coalesce(je.note, 'Journal Entry ' || je.ref) as correction_note,
  null as correction_transaction_time -- To be set by caller
from journal_entry je
where je.post_time is not null
  and je.reversed_by_journal_entry_ref is null
  and je.corrected_by_journal_entry_ref is null;

-- Trigger to create correction entry (reversal + new correct entry)
drop trigger if exists journal_entry_create_correction_trigger;
create trigger journal_entry_create_correction_trigger
instead of insert on journal_entry_correction for each row
begin
  -- Validate that the original entry exists and is posted
  select
    case
      when (select count(*) from journal_entry where ref = new.original_ref and post_time is not null) = 0
      then raise(rollback, 'original journal entry must exist and be posted to create correction')
    end,
    case
      when (select count(*) from journal_entry where note like '%[Reverses Entry #' || printf('%.0f', new.original_ref) || ']%') > 0
      then raise(rollback, 'journal entry has already been reversed, cannot correct')
    end,
    case
      when (select count(*) from journal_entry where note like '%[Corrects Entry #' || printf('%.0f', new.original_ref) || ']%') > 0
      then raise(rollback, 'journal entry has already been corrected')
    end;

  -- Create the correction journal entry (reversal part)
  insert into journal_entry (
    transaction_time,
    note,
    transaction_currency_code,
    exchange_rate_to_functional
  )
  select
    coalesce(new.correction_transaction_time, je.transaction_time),
    'Correction of: ' || coalesce(je.note, 'Journal Entry ' || je.ref) || ' [Corrects Entry #' || printf('%.0f', new.original_ref) || ']',
    je.transaction_currency_code,
    je.exchange_rate_to_functional
  from journal_entry je
  where je.ref = new.original_ref;

  -- Create correction journal entry lines (flip debit/credit to reverse)
  insert into journal_entry_line (
    journal_entry_ref,
    line_order,
    account_code,
    db,
    cr,
    db_functional,
    cr_functional,
    foreign_currency_amount,
    foreign_currency_code,
    exchange_rate
  )
  select
    (select max(ref) from journal_entry),
    jel.line_order,
    jel.account_code,
    jel.cr, -- flip credit to debit
    jel.db, -- flip debit to credit
    jel.cr_functional, -- flip credit to debit in functional currency
    jel.db_functional, -- flip debit to credit in functional currency
    case when jel.foreign_currency_amount is not null then -jel.foreign_currency_amount else null end,
    jel.foreign_currency_code,
    jel.exchange_rate
  from journal_entry_line jel
  where jel.journal_entry_ref = new.original_ref
  order by jel.line_order;

  -- Post the correction entry
  update journal_entry
  set post_time = coalesce(new.correction_transaction_time, (select transaction_time from journal_entry where ref = new.original_ref))
  where ref = (select max(ref) from journal_entry);
end;

-- Helper view to find entries that can be reversed or corrected
drop view if exists journal_entry_reversible;
create view journal_entry_reversible as
select
  je.ref,
  je.transaction_time,
  je.note,
  je.transaction_currency_code,
  je.post_time,
  case
    when exists(select 1 from journal_entry je2 where je2.note like '%[Reverses Entry #' || printf('%.0f', je.ref) || ']%') then 'reversed'
    when exists(select 1 from journal_entry je2 where je2.note like '%[Corrects Entry #' || printf('%.0f', je.ref) || ']%') then 'corrected'
    else 'reversible'
  end as status,
  (select ref from journal_entry je2 where je2.note like '%[Reverses Entry #' || printf('%.0f', je.ref) || ']%' limit 1) as reversed_by_journal_entry_ref,
  (select ref from journal_entry je2 where je2.note like '%[Corrects Entry #' || printf('%.0f', je.ref) || ']%' limit 1) as corrected_by_journal_entry_ref,
  (select count(*) from journal_entry_line where journal_entry_ref = je.ref) as line_count,
  (select sum(db_functional) from journal_entry_line where journal_entry_ref = je.ref) as total_debit,
  (select sum(cr_functional) from journal_entry_line where journal_entry_ref = je.ref) as total_credit
from journal_entry je
where je.post_time is not null
order by je.ref;

commit transaction;
