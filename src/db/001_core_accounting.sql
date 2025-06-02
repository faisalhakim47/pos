/*
MIGRATION 001: CORE ACCOUNTING FOUNDATION
=========================================

Double-entry bookkeeping system with multi-currency support.

FEATURES:
• Chart of accounts with 5-digit codes (10000-99999)
• Account types: asset, liability, equity, revenue, expense, contra accounts
• Journal entries with immutable posted entries (reversals only)
• Multi-currency support with functional currency (USD default)
• Real-time balance updates via triggers
• Exchange rate management with historical tracking

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

Includes default chart of accounts and 30 major world currencies.
*/

pragma journal_mode = wal;
pragma foreign_keys = on;

begin exclusive transaction;

--- CURRENCY MANAGEMENT ---

create table if not exists currency (
  code text primary key check (length(code) = 3 and code = upper(code)),
  name text not null,
  symbol text not null,
  decimal_places integer not null default 2 check (decimal_places >= 0 and decimal_places <= 8),
  is_functional_currency integer not null default 0 check (is_functional_currency in (0, 1)),
  is_active integer not null default 1 check (is_active in (0, 1))
) strict, without rowid;

create table if not exists exchange_rate (
  from_currency_code text not null,
  to_currency_code text not null,
  rate_date integer not null,
  rate real not null check (rate > 0),
  source text,
  created_time integer not null default (unixepoch()),
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



--- JOURNAL ENTRIES ---

create table if not exists journal_entry (
  ref integer primary key,
  transaction_time integer not null,
  note text,
  transaction_currency_code text not null default 'USD',
  exchange_rate_to_functional real,
  reversal_of_journal_entry_ref integer,
  correction_of_journal_entry_ref integer,
  post_time integer,
  foreign key (transaction_currency_code) references currency (code) on update restrict on delete restrict,
  foreign key (reversal_of_journal_entry_ref) references journal_entry (ref) on update restrict on delete restrict,
  foreign key (correction_of_journal_entry_ref) references journal_entry (ref) on update restrict on delete restrict
) strict;

create index if not exists journal_entry_transaction_time_index on journal_entry (transaction_time);
create index if not exists journal_entry_post_time_index on journal_entry (post_time);

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
where journal_entry.post_time is not null
order by journal_entry.ref asc, journal_entry_line.line_order asc;

--- DEFAULT CHART OF ACCOUNTS ---

-- Insert default currencies
insert into currency (code, name, symbol, decimal_places, is_functional_currency, is_active) values
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
  ('IDR', 'Indonesian Rupiah', 'Rp', 2, 0, 1),
  ('INR', 'Indian Rupee', '₹', 2, 0, 1),
  ('JPY', 'Japanese Yen', '¥', 0, 0, 1),
  ('KRW', 'South Korean Won', '₩', 0, 0, 1),
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
  decimal_places = excluded.decimal_places,
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
  (10300, 'Inventory', 'asset'),
  (10400, 'Prepaid Expenses', 'asset'),
  (10600, 'Merchandise Inventory', 'asset'),
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
  
  -- Expenses  
  (50100, 'Cost of Goods Sold', 'cogs'),
  (50700, 'Cost of Goods Sold', 'cogs'),
  (60100, 'Salaries and Wages', 'expense'),
  (60200, 'Rent Expense', 'expense'),
  (60300, 'Utilities Expense', 'expense'),
  (60400, 'Insurance Expense', 'expense'),
  (60500, 'Office Supplies Expense', 'expense'),
  (60600, 'Marketing Expense', 'expense'),
  (60700, 'Professional Fees', 'expense'),
  (60800, 'Travel Expense', 'expense'),
  (61000, 'Other Operating Expenses', 'expense'),
  (61100, 'Depreciation Expense', 'expense')
on conflict (code) do update set
  name = excluded.name,
  account_type_name = excluded.account_type_name;

-- Insert account tags for financial statement categorization
insert into account_tag (account_code, tag) values
  -- Balance Sheet - Current Assets
  (10100, 'balance_sheet_current_asset'), -- Cash
  (10200, 'balance_sheet_current_asset'), -- Accounts Receivable
  (10300, 'balance_sheet_current_asset'), -- Inventory
  (10400, 'balance_sheet_current_asset'), -- Prepaid Expenses
  (10600, 'balance_sheet_current_asset'), -- Merchandise Inventory
  
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
  
  -- Income Statement - Expenses
  (50100, 'income_statement_cogs'), -- Cost of Goods Sold
  (50700, 'income_statement_cogs'), -- Cost of Goods Sold
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
  
  -- Fiscal Year Closing
  (40100, 'fiscal_year_closing_revenue'), -- Sales Revenue
  (40200, 'fiscal_year_closing_revenue'), -- Service Revenue
  (40300, 'fiscal_year_closing_revenue'), -- Other Revenue
  (41000, 'fiscal_year_closing_revenue'), -- Sales Returns and Allowances
  (50100, 'fiscal_year_closing_expense'), -- Cost of Goods Sold
  (50700, 'fiscal_year_closing_expense'), -- Cost of Goods Sold
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
  (30300, 'fiscal_year_closing_dividend'), -- Dividends
  (30600, 'fiscal_year_closing_dividend') -- Dividends/Withdrawals
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
from latest_exchange_rate
union all
select 
  code as from_currency_code,
  code as to_currency_code,
  1.0 as rate,
  unixepoch() as rate_date
from currency;

-- Multi-currency account balance view
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
    else cast(a.balance * coalesce(erl.rate, 1.0) as integer)
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

commit transaction;
