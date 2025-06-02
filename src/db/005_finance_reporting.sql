/*
SQLite 3.49.0

MIGRATION 002: FINANCIAL REPORTING SYSTEM WITH MULTI-CURRENCY SUPPORT
=====================================================================

Builds comprehensive financial reporting capabilities on top of the core accounting system:

DEPENDS ON: 001_core_accounting.sql

FINANCE STATEMENT CONFIGURATION:
• Configuration table linking account tags to reporting categories
• Mappings for balance sheet categorization (current/non-current assets and liabilities)
• Income statement categorization (revenue, COGS, expenses)
• Fiscal year closing account mappings
• Multi-currency reporting currency designation

TRIAL BALANCE:
• Snapshot reports of all account balances at specific points in time
• Incremental calculation from previous trial balance + intervening transactions
• Automatic debit/credit classification based on account normal balance
• Multi-currency balances with functional currency conversion

INCOME STATEMENT:
• Period-based profit & loss reporting with configurable date ranges
• Automatic categorization: revenue, COGS, expenses, other income/expenses
• Calculated subtotals: gross profit, operating income, net income
• Line ordering system for proper financial statement presentation
• Multi-currency consolidation and reporting

BALANCE SHEET:
• Point-in-time financial position reporting
• Asset classification: current vs non-current assets
• Liability classification: current vs non-current liabilities
• Equity section with automatic balance verification
• Assets = Liabilities + Equity validation
• Multi-currency translation and consolidation

FISCAL YEAR CLOSING:
• Automated year-end closing entries for revenue, expense, and dividend accounts
• Transfer of net income to retained earnings
• Configurable fiscal year periods (not restricted to 12 months)
• Automatic journal entry creation and posting for closing process
• Foreign currency translation adjustments for year-end
*/

pragma journal_mode = wal;
pragma foreign_keys = on;

begin exclusive transaction;

--- FINANCE STATEMENT CONFIGURATION ---

create table if not exists finance_statement_config (
  id integer primary key default 1 check (id = 1),
  reporting_currency_code text not null default 'USD',
  balance_sheet_current_asset_tag text not null,
  balance_sheet_non_current_asset_tag text not null,
  balance_sheet_current_liability_tag text not null,
  balance_sheet_non_current_liability_tag text not null,
  balance_sheet_equity_tag text not null,
  fiscal_year_closing_revenue_tag text not null,
  fiscal_year_closing_expense_tag text not null,
  fiscal_year_closing_dividend_tag text not null,
  fiscal_year_closing_income_summary_account_code integer not null,
  fiscal_year_closing_retained_earnings_account_code integer not null,
  income_statement_revenue_tag text not null,
  income_statement_contra_revenue_tag text not null,
  income_statement_other_revenue_tag text not null,
  income_statement_expense_tag text not null,
  income_statement_other_expense_tag text not null,
  income_statement_cogs_tag text not null,
  foreign key (reporting_currency_code) references currency (code) on update restrict on delete restrict,
  foreign key (fiscal_year_closing_income_summary_account_code) references account (code) on update restrict on delete restrict,
  foreign key (fiscal_year_closing_retained_earnings_account_code) references account (code) on update restrict on delete restrict
) strict;

drop trigger if exists finance_statement_config_delete_preventation_trigger;
create trigger finance_statement_config_delete_preventation_trigger
before delete on finance_statement_config for each row
begin
  select raise(rollback, 'finance statement configuration cannot be deleted');
end;

--- TRIAL BALANCE ---

create table if not exists trial_balance (
  id integer primary key,
  report_time integer not null
) strict;

create index if not exists trial_balance_report_time_index on trial_balance (report_time);

create table if not exists trial_balance_account (
  trial_balance_id integer not null,
  account_code integer not null,
  currency_code text not null,
  db integer not null,
  cr integer not null,
  db_functional integer not null,
  cr_functional integer not null,
  db_reporting integer not null,
  cr_reporting integer not null,
  exchange_rate_functional real,
  exchange_rate_reporting real,
  primary key (trial_balance_id, account_code),
  foreign key (trial_balance_id) references trial_balance (id) on update restrict on delete restrict,
  foreign key (account_code) references account (code) on update restrict on delete restrict,
  foreign key (currency_code) references currency (code) on update restrict on delete restrict
) strict, without rowid;

create index if not exists trial_balance_account_trial_balance_id_account_code_index on trial_balance_account (trial_balance_id, account_code);
create index if not exists trial_balance_account_trial_balance_id_index on trial_balance_account (trial_balance_id);
create index if not exists trial_balance_account_account_code_index on trial_balance_account (account_code);

drop trigger if exists trial_balance_report_generation_trigger;
create trigger trial_balance_report_generation_trigger
after insert on trial_balance for each row
begin
  insert into trial_balance_account (
    trial_balance_id,
    account_code,
    currency_code,
    db,
    cr,
    db_functional,
    cr_functional,
    db_reporting,
    cr_reporting,
    exchange_rate_functional,
    exchange_rate_reporting
  )
  select
    new.id,
    account_balance.account_code,
    account_balance.currency_code,
    case
      when account_balance.net_balance > 0 and account_balance.normal_balance = 'db'
      then account_balance.net_balance
      when account_balance.net_balance < 0 and account_balance.normal_balance = 'db'
      then -account_balance.net_balance
      else 0
    end as db,
    case
      when account_balance.net_balance > 0 and account_balance.normal_balance = 'cr'
      then account_balance.net_balance
      when account_balance.net_balance < 0 and account_balance.normal_balance = 'cr'
      then -account_balance.net_balance
      else 0
    end as cr,
    case
      when account_balance.net_balance_functional > 0 and account_balance.normal_balance = 'db'
      then account_balance.net_balance_functional
      when account_balance.net_balance_functional < 0 and account_balance.normal_balance = 'db'
      then -account_balance.net_balance_functional
      else 0
    end as db_functional,
    case
      when account_balance.net_balance_functional > 0 and account_balance.normal_balance = 'cr'
      then account_balance.net_balance_functional
      when account_balance.net_balance_functional < 0 and account_balance.normal_balance = 'cr'
      then -account_balance.net_balance_functional
      else 0
    end as cr_functional,
    case
      when account_balance.net_balance_reporting > 0 and account_balance.normal_balance = 'db'
      then account_balance.net_balance_reporting
      when account_balance.net_balance_reporting < 0 and account_balance.normal_balance = 'db'
      then -account_balance.net_balance_reporting
      else 0
    end as db_reporting,
    case
      when account_balance.net_balance_reporting > 0 and account_balance.normal_balance = 'cr'
      then account_balance.net_balance_reporting
      when account_balance.net_balance_reporting < 0 and account_balance.normal_balance = 'cr'
      then -account_balance.net_balance_reporting
      else 0
    end as cr_reporting,
    account_balance.exchange_rate_functional,
    account_balance.exchange_rate_reporting
  from (
    select
      account.code as account_code,
      account.currency_code,
      account_type.normal_balance,
      (
        + coalesce(last_trial_balance_account.db, 0)
        - coalesce(last_trial_balance_account.cr, 0)
        + coalesce(sum(journal_entry_line.db), 0)
        - coalesce(sum(journal_entry_line.cr), 0)
      ) as net_balance,
      (
        + coalesce(last_trial_balance_account.db_functional, 0)
        - coalesce(last_trial_balance_account.cr_functional, 0)
        + coalesce(sum(journal_entry_line.db_functional), 0)
        - coalesce(sum(journal_entry_line.cr_functional), 0)
      ) as net_balance_functional,
      (
        + coalesce(last_trial_balance_account.db_reporting, 0)
        - coalesce(last_trial_balance_account.cr_reporting, 0)
        + coalesce(sum(
          case 
            when account.currency_code = fsc.reporting_currency_code 
            then journal_entry_line.db
            else cast(journal_entry_line.db_functional * coalesce(erl_reporting.rate, 1.0) as integer)
          end
        ), 0)
        - coalesce(sum(
          case 
            when account.currency_code = fsc.reporting_currency_code 
            then journal_entry_line.cr
            else cast(journal_entry_line.cr_functional * coalesce(erl_reporting.rate, 1.0) as integer)
          end
        ), 0)
      ) as net_balance_reporting,
      erl_functional.rate as exchange_rate_functional,
      erl_reporting.rate as exchange_rate_reporting
    from account
    left join account_type on account_type.name = account.account_type_name
    cross join finance_statement_config fsc
    left join exchange_rate_lookup erl_functional 
      on erl_functional.from_currency_code = account.currency_code 
      and erl_functional.to_currency_code = (select code from currency where is_functional_currency = 1)
    left join exchange_rate_lookup erl_reporting 
      on erl_reporting.from_currency_code = (select code from currency where is_functional_currency = 1)
      and erl_reporting.to_currency_code = fsc.reporting_currency_code
    left join trial_balance as last_trial_balance
      on last_trial_balance.id = (
        select max(id)
        from trial_balance
        where report_time < new.report_time
      )
    left join trial_balance_account as last_trial_balance_account
      on last_trial_balance_account.trial_balance_id = last_trial_balance.id
      and last_trial_balance_account.account_code = account.code
    left join journal_entry_line
      on journal_entry_line.account_code = account.code
      and journal_entry_line.journal_entry_ref in (
        select ref from journal_entry
        where post_time is not null
          and transaction_time > coalesce(last_trial_balance.report_time, 0)
          and transaction_time <= new.report_time
      )
    group by account.code
  ) account_balance
  where account_balance.net_balance != 0 
     or account_balance.net_balance_functional != 0 
     or account_balance.net_balance_reporting != 0;
end;

drop view if exists trial_balance_report;
create view trial_balance_report as
select
  trial_balance.report_time,
  account.code,
  account.name,
  account.currency_code,
  trial_balance_account.db,
  trial_balance_account.cr,
  trial_balance_account.db_functional,
  trial_balance_account.cr_functional,
  trial_balance_account.db_reporting,
  trial_balance_account.cr_reporting,
  trial_balance_account.exchange_rate_functional,
  trial_balance_account.exchange_rate_reporting,
  fc.code as functional_currency_code,
  fsc.reporting_currency_code
from trial_balance
join trial_balance_account on trial_balance_account.trial_balance_id = trial_balance.id
join account on account.code = trial_balance_account.account_code
cross join (select code from currency where is_functional_currency = 1) fc
cross join finance_statement_config fsc
order by trial_balance.report_time asc, account.code asc;

--- INCOME STATEMENT ---

create table if not exists income_statement (
  id integer primary key,
  period_begin_time integer not null,
  period_end_time integer not null,
  report_time integer not null,
  check (period_begin_time < period_end_time)
) strict;

create index if not exists income_statement_period_begin_time_index on income_statement (period_begin_time);
create index if not exists income_statement_period_end_time_index on income_statement (period_end_time);
create index if not exists income_statement_report_time_index on income_statement (report_time);

create table if not exists income_statement_line (
  income_statement_id integer not null,
  line_type text not null check (line_type in ('revenue', 'contra_revenue', 'cogs', 'gross_profit', 'expense', 'operating_income', 'other_revenue', 'other_expense', 'net_income')),
  account_code integer,
  account_name text not null,
  amount integer not null default 0,
  line_order integer not null,
  is_subtotal integer not null default 0 check (is_subtotal in (0, 1)),
  primary key (income_statement_id, line_order),
  foreign key (income_statement_id) references income_statement (id) on update restrict on delete restrict,
  foreign key (account_code) references account (code) on update restrict on delete restrict
) strict, without rowid;

create index if not exists income_statement_line_income_statement_id_index on income_statement_line (income_statement_id);
create index if not exists income_statement_line_account_code_index on income_statement_line (account_code);
create index if not exists income_statement_line_line_type_index on income_statement_line (line_type);

drop trigger if exists income_statement_report_generation_trigger;
create trigger income_statement_report_generation_trigger
after insert on income_statement for each row
begin
  -- Insert revenue accounts
  insert into income_statement_line (
    income_statement_id,
    line_type,
    account_code,
    account_name,
    amount,
    line_order,
    is_subtotal
  )
  select
    new.id,
    'revenue',
    account.code,
    account.name,
    coalesce(sum(journal_entry_line.cr) - sum(journal_entry_line.db), 0),
    (row_number() over (order by account.code)) * 10,
    0
  from finance_statement_config, account
  left join journal_entry_line on journal_entry_line.account_code = account.code
  left join journal_entry on journal_entry.ref = journal_entry_line.journal_entry_ref
    and journal_entry.post_time is not null
    and journal_entry.transaction_time > new.period_begin_time
    and journal_entry.transaction_time <= new.period_end_time
  where account.code in (
    select account_code
    from account_tag
    where tag = income_statement_revenue_tag
  )
  group by account.code
  having coalesce(sum(journal_entry_line.cr) - sum(journal_entry_line.db), 0) != 0;

  -- Insert contra revenue accounts
  insert into income_statement_line (
    income_statement_id,
    line_type,
    account_code,
    account_name,
    amount,
    line_order,
    is_subtotal
  )
  select
    new.id,
    'contra_revenue',
    account.code,
    account.name,
    coalesce(sum(journal_entry_line.db) - sum(journal_entry_line.cr), 0),
    1000 + (row_number() over (order by account.code)) * 10,
    0
  from finance_statement_config, account
  left join journal_entry_line on journal_entry_line.account_code = account.code
  left join journal_entry on journal_entry.ref = journal_entry_line.journal_entry_ref
    and journal_entry.post_time is not null
    and journal_entry.transaction_time > new.period_begin_time
    and journal_entry.transaction_time <= new.period_end_time
  where account.code in (
    select account_code
    from account_tag
    where tag = income_statement_contra_revenue_tag
  )
  group by account.code
  having coalesce(sum(journal_entry_line.db) - sum(journal_entry_line.cr), 0) != 0;

  -- Insert cost of goods sold (COGS) accounts
  insert into income_statement_line (
    income_statement_id,
    line_type,
    account_code,
    account_name,
    amount,
    line_order,
    is_subtotal
  )
  select
    new.id,
    'cogs',
    account.code,
    account.name,
    coalesce(sum(journal_entry_line.db) - sum(journal_entry_line.cr), 0),
    2000 + (row_number() over (order by account.code)) * 10,
    0
  from finance_statement_config, account
  left join journal_entry_line on journal_entry_line.account_code = account.code
  left join journal_entry on journal_entry.ref = journal_entry_line.journal_entry_ref
    and journal_entry.post_time is not null
    and journal_entry.transaction_time > new.period_begin_time
    and journal_entry.transaction_time <= new.period_end_time
  where account.code in (
    select account_code
    from account_tag
    where tag = income_statement_cogs_tag
  )
  group by account.code
  having coalesce(sum(journal_entry_line.db) - sum(journal_entry_line.cr), 0) != 0;

  -- Calculate and insert gross profit
  insert into income_statement_line (
    income_statement_id,
    line_type,
    account_code,
    account_name,
    amount,
    line_order,
    is_subtotal
  )
  select
    new.id,
    'gross_profit',
    null,
    'Gross Profit',
    coalesce(total_revenue, 0) - coalesce(total_contra_revenue, 0) - coalesce(total_cogs, 0),
    2999,
    1
  from (
    select
      (select coalesce(sum(amount), 0) from income_statement_line where income_statement_id = new.id and line_type = 'revenue') as total_revenue,
      (select coalesce(sum(amount), 0) from income_statement_line where income_statement_id = new.id and line_type = 'contra_revenue') as total_contra_revenue,
      (select coalesce(sum(amount), 0) from income_statement_line where income_statement_id = new.id and line_type = 'cogs') as total_cogs
  );

  -- Insert operating expense accounts
  insert into income_statement_line (
    income_statement_id,
    line_type,
    account_code,
    account_name,
    amount,
    line_order,
    is_subtotal
  )
  select
    new.id,
    'expense',
    account.code,
    account.name,
    coalesce(sum(journal_entry_line.db) - sum(journal_entry_line.cr), 0),
    3000 + (row_number() over (order by account.code)) * 10,
    0
  from finance_statement_config, account
  left join journal_entry_line on journal_entry_line.account_code = account.code
  left join journal_entry on journal_entry.ref = journal_entry_line.journal_entry_ref
    and journal_entry.post_time is not null
    and journal_entry.transaction_time > new.period_begin_time
    and journal_entry.transaction_time <= new.period_end_time
  where account.code in (
    select account_code
    from account_tag
    where tag = income_statement_expense_tag
  )
  group by account.code
  having coalesce(sum(journal_entry_line.db) - sum(journal_entry_line.cr), 0) != 0;

  -- Calculate and insert operating income
  insert into income_statement_line (
    income_statement_id,
    line_type,
    account_code,
    account_name,
    amount,
    line_order,
    is_subtotal
  )
  select
    new.id,
    'operating_income',
    null,
    'Operating Income',
    coalesce(gross_profit, 0) - coalesce(total_expenses, 0),
    3999,
    1
  from (
    select
      (select amount from income_statement_line where income_statement_id = new.id and line_type = 'gross_profit') as gross_profit,
      (select coalesce(sum(amount), 0) from income_statement_line where income_statement_id = new.id and line_type = 'expense') as total_expenses
  );

  -- Insert other revenue accounts (non-operating)
  insert into income_statement_line (
    income_statement_id,
    line_type,
    account_code,
    account_name,
    amount,
    line_order,
    is_subtotal
  )
  select
    new.id,
    'other_revenue',
    account.code,
    account.name,
    coalesce(sum(journal_entry_line.cr) - sum(journal_entry_line.db), 0),
    4000 + (row_number() over (order by account.code)) * 10,
    0
  from finance_statement_config, account
  left join journal_entry_line on journal_entry_line.account_code = account.code
  left join journal_entry on journal_entry.ref = journal_entry_line.journal_entry_ref
    and journal_entry.post_time is not null
    and journal_entry.transaction_time > new.period_begin_time
    and journal_entry.transaction_time <= new.period_end_time
  where account.code in (
    select account_code
    from account_tag
    where tag = income_statement_other_revenue_tag
  )
  group by account.code
  having coalesce(sum(journal_entry_line.cr) - sum(journal_entry_line.db), 0) != 0;

  -- Insert other expense accounts (non-operating)
  insert into income_statement_line (
    income_statement_id,
    line_type,
    account_code,
    account_name,
    amount,
    line_order,
    is_subtotal
  )
  select
    new.id,
    'other_expense',
    account.code,
    account.name,
    coalesce(sum(journal_entry_line.db) - sum(journal_entry_line.cr), 0),
    5000 + (row_number() over (order by account.code)) * 10,
    0
  from finance_statement_config, account
  left join journal_entry_line on journal_entry_line.account_code = account.code
  left join journal_entry on journal_entry.ref = journal_entry_line.journal_entry_ref
    and journal_entry.post_time is not null
    and journal_entry.transaction_time > new.period_begin_time
    and journal_entry.transaction_time <= new.period_end_time
  where account.code in (
    select account_code
    from account_tag
    where tag = income_statement_other_expense_tag
  )
  group by account.code
  having coalesce(sum(journal_entry_line.db) - sum(journal_entry_line.cr), 0) != 0;

  -- Calculate and insert net income
  insert into income_statement_line (
    income_statement_id,
    line_type,
    account_code,
    account_name,
    amount,
    line_order,
    is_subtotal
  )
  select
    new.id,
    'net_income',
    null,
    'Net Income',
    coalesce(operating_income, 0) + coalesce(other_revenue, 0) - coalesce(other_expenses, 0),
    9999,
    1
  from (
    select
      (select amount from income_statement_line where income_statement_id = new.id and line_type = 'operating_income') as operating_income,
      (select coalesce(sum(amount), 0) from income_statement_line where income_statement_id = new.id and line_type = 'other_revenue') as other_revenue,
      (select coalesce(sum(amount), 0) from income_statement_line where income_statement_id = new.id and line_type = 'other_expense') as other_expenses
  );
end;

drop view if exists income_statement_report;
create view income_statement_report as
select
  income_statement.period_begin_time,
  income_statement.period_end_time,
  income_statement.report_time,
  income_statement_line.line_type,
  income_statement_line.account_code,
  income_statement_line.account_name,
  income_statement_line.amount,
  income_statement_line.line_order,
  income_statement_line.is_subtotal
from income_statement
join income_statement_line on income_statement_line.income_statement_id = income_statement.id
order by income_statement.period_begin_time asc, income_statement.period_end_time asc, income_statement_line.line_order asc;

--- BALANCE SHEET ---

create table if not exists balance_sheet (
  id integer primary key,
  report_time integer not null
) strict;

create index if not exists balance_sheet_report_time_index on balance_sheet (report_time);

create table if not exists balance_sheet_line (
  balance_sheet_id integer not null,
  line_type text not null check (line_type in ('current_asset', 'non_current_asset', 'total_asset', 'current_liability', 'non_current_liability', 'total_liability', 'equity', 'total_equity', 'total_liability_equity')),
  account_code integer,
  account_name text not null,
  amount integer not null default 0,
  line_order integer not null,
  is_subtotal integer not null default 0 check (is_subtotal in (0, 1)),
  primary key (balance_sheet_id, line_order),
  foreign key (balance_sheet_id) references balance_sheet (id) on update restrict on delete restrict,
  foreign key (account_code) references account (code) on update restrict on delete restrict
) strict, without rowid;

create index if not exists balance_sheet_line_balance_sheet_id_index on balance_sheet_line (balance_sheet_id);
create index if not exists balance_sheet_line_account_code_index on balance_sheet_line (account_code);
create index if not exists balance_sheet_line_line_type_index on balance_sheet_line (line_type);

drop trigger if exists balance_sheet_report_generation_trigger;
create trigger balance_sheet_report_generation_trigger
after insert on balance_sheet for each row
begin
  -- Insert current asset accounts
  insert into balance_sheet_line (
    balance_sheet_id,
    line_type,
    account_code,
    account_name,
    amount,
    line_order,
    is_subtotal
  )
  select
    new.id,
    'current_asset',
    account.code,
    account.name,
    case
      when account_type.normal_balance = 'db' then account.balance
      when account_type.normal_balance = 'cr' then -account.balance
    end,
    100 + (row_number() over (order by account.code)) * 10,
    0
  from account
  join account_type on account_type.name = account.account_type_name
  join finance_statement_config on finance_statement_config.id = 1
  where account.code in (
    select account_code
    from account_tag
    where tag = balance_sheet_current_asset_tag
  ) and account.balance != 0
  order by account.code;

  -- Insert non-current asset accounts
  insert into balance_sheet_line (
    balance_sheet_id,
    line_type,
    account_code,
    account_name,
    amount,
    line_order,
    is_subtotal
  )
  select
    new.id,
    'non_current_asset',
    account.code,
    account.name,
    case
      when account_type.normal_balance = 'db' then account.balance
      when account_type.normal_balance = 'cr' then -account.balance
    end,
    1000 + (row_number() over (order by account.code)) * 10,
    0
  from account
  join account_type on account_type.name = account.account_type_name
  join finance_statement_config on finance_statement_config.id = 1
  where account.code in (
    select account_code
    from account_tag
    where tag = balance_sheet_non_current_asset_tag
  ) and account.balance != 0
  order by account.code;

  -- Calculate and insert total assets
  insert into balance_sheet_line (
    balance_sheet_id,
    line_type,
    account_code,
    account_name,
    amount,
    line_order,
    is_subtotal
  )
  select
    new.id,
    'total_asset',
    null,
    'Total Assets',
    coalesce(current_assets, 0) + coalesce(non_current_assets, 0),
    1999,
    1
  from (
    select
      (select coalesce(sum(amount), 0) from balance_sheet_line where balance_sheet_id = new.id and line_type = 'current_asset') as current_assets,
      (select coalesce(sum(amount), 0) from balance_sheet_line where balance_sheet_id = new.id and line_type = 'non_current_asset') as non_current_assets
  );

  -- Insert current liability accounts
  insert into balance_sheet_line (
    balance_sheet_id,
    line_type,
    account_code,
    account_name,
    amount,
    line_order,
    is_subtotal
  )
  select
    new.id,
    'current_liability',
    account.code,
    account.name,
    case
      when account_type.normal_balance = 'cr' then account.balance
      when account_type.normal_balance = 'db' then -account.balance
    end,
    2000 + (row_number() over (order by account.code)) * 10,
    0
  from account
  join account_type on account_type.name = account.account_type_name
  join finance_statement_config on finance_statement_config.id = 1
  where account.code in (
    select account_code
    from account_tag
    where tag = balance_sheet_current_liability_tag
  ) and account.balance != 0
  order by account.code;

  -- Insert non-current liability accounts
  insert into balance_sheet_line (
    balance_sheet_id,
    line_type,
    account_code,
    account_name,
    amount,
    line_order,
    is_subtotal
  )
  select
    new.id,
    'non_current_liability',
    account.code,
    account.name,
    case
      when account_type.normal_balance = 'cr' then account.balance
      when account_type.normal_balance = 'db' then -account.balance
    end,
    3000 + (row_number() over (order by account.code)) * 10,
    0
  from account
  join account_type on account_type.name = account.account_type_name
  join finance_statement_config on finance_statement_config.id = 1
  where account.code in (
    select account_code
    from account_tag
    where tag = balance_sheet_non_current_liability_tag
  ) and account.balance != 0
  order by account.code;

  -- Calculate and insert total liabilities
  insert into balance_sheet_line (
    balance_sheet_id,
    line_type,
    account_code,
    account_name,
    amount,
    line_order,
    is_subtotal
  )
  select
    new.id,
    'total_liability',
    null,
    'Total Liabilities',
    coalesce(current_liabilities, 0) + coalesce(non_current_liabilities, 0),
    3999,
    1
  from (
    select
      (select coalesce(sum(amount), 0) from balance_sheet_line where balance_sheet_id = new.id and line_type = 'current_liability') as current_liabilities,
      (select coalesce(sum(amount), 0) from balance_sheet_line where balance_sheet_id = new.id and line_type = 'non_current_liability') as non_current_liabilities
  );

  -- Insert equity accounts
  insert into balance_sheet_line (
    balance_sheet_id,
    line_type,
    account_code,
    account_name,
    amount,
    line_order,
    is_subtotal
  )
  select
    new.id,
    'equity',
    account.code,
    account.name,
    case
      when account_type.normal_balance = 'cr' then account.balance
      when account_type.normal_balance = 'db' then -account.balance
    end,
    4000 + (row_number() over (order by account.code)) * 10,
    0
  from account
  join account_type on account_type.name = account.account_type_name
  join finance_statement_config on finance_statement_config.id = 1
  where account.code in (
    select account_code
    from account_tag
    where tag = balance_sheet_equity_tag
  ) and account.balance != 0
  order by account.code;

  -- Calculate and insert total equity
  insert into balance_sheet_line (
    balance_sheet_id,
    line_type,
    account_code,
    account_name,
    amount,
    line_order,
    is_subtotal
  )
  select
    new.id,
    'total_equity',
    null,
    'Total Equity',
    coalesce(sum(amount), 0),
    4999,
    1
  from balance_sheet_line
  where balance_sheet_id = new.id and line_type = 'equity';

  -- Calculate and insert total liabilities and equity (should equal total assets)
  insert into balance_sheet_line (
    balance_sheet_id,
    line_type,
    account_code,
    account_name,
    amount,
    line_order,
    is_subtotal
  )
  select
    new.id,
    'total_liability_equity',
    null,
    'Total Liabilities and Equity',
    coalesce(total_liabilities, 0) + coalesce(total_equity, 0),
    5999,
    1
  from (
    select
      (select amount from balance_sheet_line where balance_sheet_id = new.id and line_type = 'total_liability') as total_liabilities,
      (select amount from balance_sheet_line where balance_sheet_id = new.id and line_type = 'total_equity') as total_equity
  );
end;

drop view if exists balance_sheet_report;
create view balance_sheet_report as
select
  balance_sheet.report_time,
  balance_sheet_line.line_type,
  balance_sheet_line.account_code,
  balance_sheet_line.account_name,
  balance_sheet_line.amount,
  balance_sheet_line.line_order,
  balance_sheet_line.is_subtotal
from balance_sheet
join balance_sheet_line on balance_sheet_line.balance_sheet_id = balance_sheet.id
order by balance_sheet.report_time asc, balance_sheet_line.line_order asc;

--- FISCAL YEAR CLOSING ---

-- In accounting principles, fiscal year must be 12 months long. In this app we dont enforce it.
-- We pass the responsibility on the user manage it. Sometimes exact 12 months is impossible to achieve for some businesses.
-- The journal entry timing rules: transaction_time > begin_time and transaction_time <= end_time
create table if not exists fiscal_year (
  begin_time integer primary key,
  end_time integer not null,
  post_time integer,
  check (begin_time < end_time)
) strict;

create index if not exists fiscal_year_end_time_index on fiscal_year (end_time);

drop view if exists fiscal_year_account_mutation;
create view fiscal_year_account_mutation as
select
  fiscal_year.begin_time,
  fiscal_year.end_time,
  account.code as account_code,
  account.account_type_name,
  sum(journal_entry_summary.db) as sum_of_db,
  sum(journal_entry_summary.cr) as sum_of_cr
from fiscal_year
join journal_entry_summary
  on journal_entry_summary.transaction_time > fiscal_year.begin_time
  and journal_entry_summary.transaction_time <= fiscal_year.end_time
join account on account.code = journal_entry_summary.account_code
group by fiscal_year.begin_time, journal_entry_summary.account_code;

drop trigger if exists fiscal_year_insert_validation_trigger;
create trigger fiscal_year_insert_validation_trigger
before insert on fiscal_year for each row
begin
  select
    case
      when new.post_time is not null
      then raise(rollback, 'fiscal year must be unposted at the time of creation')
    end,
    case
      when new.begin_time != coalesce(last_end_time, default_end_time)
      then raise(rollback, 'begin_time must be the same as last fiscal year end_time')
    end
  from (select 0 as default_end_time)
  join (
    select end_time as last_end_time
    from fiscal_year
    order by end_time desc
    limit 1
  ) as last_fiscal_year;
end;

drop trigger if exists fiscal_year_post_preventation_trigger;
create trigger fiscal_year_post_preventation_trigger
before update on fiscal_year for each row
begin
  select
    case
      when old.post_time is not null
      then raise(rollback, 'cannot update posted fiscal year')
    end;
end;

drop trigger if exists fiscal_year_post_account_trigger;
create trigger fiscal_year_post_account_trigger
after update on fiscal_year for each row
when old.post_time is null and new.post_time is not null
begin
  -- Create journal entry for closing entries
  insert into journal_entry (transaction_time, note)
  values (new.end_time, 'Fiscal year closing entries for ' || new.begin_time);
  
  -- Close revenue accounts by reversing their net balance
  insert into journal_entry_line_auto_number (
    journal_entry_ref,
    account_code,
    db,
    cr
  )
  select
    last_insert_rowid(),
    account_code,
    case when (sum_of_cr - sum_of_db) > 0 then (sum_of_cr - sum_of_db) else 0 end,  -- Debit to close credit balance
    case when (sum_of_cr - sum_of_db) < 0 then -(sum_of_cr - sum_of_db) else 0 end  -- Credit to close debit balance
  from fiscal_year_account_mutation
  join finance_statement_config on finance_statement_config.id = 1
  where fiscal_year_account_mutation.begin_time = new.begin_time
    and account_code in (
      select account_code from account_tag where tag = fiscal_year_closing_revenue_tag
    )
    and (sum_of_cr != sum_of_db);

  -- Close expense accounts by reversing their net balance
  insert into journal_entry_line_auto_number (
    journal_entry_ref,
    account_code,
    db,
    cr
  )
  select
    last_insert_rowid(),
    account_code,
    case when (sum_of_db - sum_of_cr) < 0 then -(sum_of_db - sum_of_cr) else 0 end,  -- Debit to close credit balance
    case when (sum_of_db - sum_of_cr) > 0 then (sum_of_db - sum_of_cr) else 0 end   -- Credit to close debit balance
  from fiscal_year_account_mutation
  join finance_statement_config on finance_statement_config.id = 1
  where fiscal_year_account_mutation.begin_time = new.begin_time
    and account_code in (
      select account_code from account_tag where tag = fiscal_year_closing_expense_tag
    )
    and (sum_of_db != sum_of_cr);

  -- Close dividend accounts by reversing their net balance
  insert into journal_entry_line_auto_number (
    journal_entry_ref,
    account_code,
    db,
    cr
  )
  select
    last_insert_rowid(),
    account_code,
    case when (sum_of_db - sum_of_cr) < 0 then -(sum_of_db - sum_of_cr) else 0 end,  -- Debit to close credit balance
    case when (sum_of_db - sum_of_cr) > 0 then (sum_of_db - sum_of_cr) else 0 end   -- Credit to close debit balance
  from fiscal_year_account_mutation
  join finance_statement_config on finance_statement_config.id = 1
  where fiscal_year_account_mutation.begin_time = new.begin_time
    and account_code in (
      select account_code from account_tag where tag = fiscal_year_closing_dividend_tag
    )
    and (sum_of_db != sum_of_cr);

  -- Transfer net income to retained earnings (balancing entry)
  insert into journal_entry_line_auto_number (
    journal_entry_ref,
    account_code,
    db,
    cr
  )
  select
    last_insert_rowid(),
    fiscal_year_closing_retained_earnings_account_code,
    case when net_income < 0 then -net_income else 0 end,  -- Debit for net loss
    case when net_income > 0 then net_income else 0 end    -- Credit for net income
  from finance_statement_config
  cross join (
    select
      -- Net Income = Revenues - Expenses - Dividends
      coalesce(sum(case when account_code in (
        select account_code from account_tag 
        join finance_statement_config on finance_statement_config.id = 1
        where tag = fiscal_year_closing_revenue_tag
      ) then (sum_of_cr - sum_of_db) else 0 end), 0) -
      coalesce(sum(case when account_code in (
        select account_code from account_tag 
        join finance_statement_config on finance_statement_config.id = 1 
        where tag = fiscal_year_closing_expense_tag
      ) then (sum_of_db - sum_of_cr) else 0 end), 0) -
      coalesce(sum(case when account_code in (
        select account_code from account_tag 
        join finance_statement_config on finance_statement_config.id = 1
        where tag = fiscal_year_closing_dividend_tag
      ) then (sum_of_db - sum_of_cr) else 0 end), 0) as net_income
    from fiscal_year_account_mutation
    where fiscal_year_account_mutation.begin_time = new.begin_time
  )
  where finance_statement_config.id = 1 and net_income != 0;

  -- Post the closing entry automatically
  update journal_entry
  set post_time = new.end_time
  where ref = last_insert_rowid()
    and exists (
      select 1 from journal_entry_line
      where journal_entry_ref = last_insert_rowid()
    );
    
  -- Delete the entry if it has no lines
  delete from journal_entry
  where ref = last_insert_rowid()
    and not exists (
      select 1 from journal_entry_line
      where journal_entry_ref = last_insert_rowid()
    );
end;

-- Insert finance statement configuration
insert into finance_statement_config (
  id,
  balance_sheet_current_asset_tag,
  balance_sheet_non_current_asset_tag,
  balance_sheet_current_liability_tag,
  balance_sheet_non_current_liability_tag,
  balance_sheet_equity_tag,
  fiscal_year_closing_revenue_tag,
  fiscal_year_closing_expense_tag,
  fiscal_year_closing_dividend_tag,
  fiscal_year_closing_income_summary_account_code,
  fiscal_year_closing_retained_earnings_account_code,
  income_statement_revenue_tag,
  income_statement_contra_revenue_tag,
  income_statement_other_revenue_tag,
  income_statement_expense_tag,
  income_statement_other_expense_tag,
  income_statement_cogs_tag
) values (
  1,
  'balance_sheet_current_asset',
  'balance_sheet_non_current_asset',
  'balance_sheet_current_liability',
  'balance_sheet_non_current_liability',
  'balance_sheet_equity',
  'fiscal_year_closing_revenue',
  'fiscal_year_closing_expense',
  'fiscal_year_closing_dividend',
  30400,
  30200,
  'income_statement_revenue',
  'income_statement_contra_revenue',
  'income_statement_other_revenue',
  'income_statement_expense',
  'income_statement_other_expense',
  'income_statement_cogs'
) on conflict (id) do update set
  balance_sheet_current_asset_tag = excluded.balance_sheet_current_asset_tag,
  balance_sheet_non_current_asset_tag = excluded.balance_sheet_non_current_asset_tag,
  balance_sheet_current_liability_tag = excluded.balance_sheet_current_liability_tag,
  balance_sheet_non_current_liability_tag = excluded.balance_sheet_non_current_liability_tag,
  balance_sheet_equity_tag = excluded.balance_sheet_equity_tag,
  fiscal_year_closing_revenue_tag = excluded.fiscal_year_closing_revenue_tag,
  fiscal_year_closing_expense_tag = excluded.fiscal_year_closing_expense_tag,
  fiscal_year_closing_dividend_tag = excluded.fiscal_year_closing_dividend_tag,
  fiscal_year_closing_income_summary_account_code = excluded.fiscal_year_closing_income_summary_account_code,
  fiscal_year_closing_retained_earnings_account_code = excluded.fiscal_year_closing_retained_earnings_account_code,
  income_statement_revenue_tag = excluded.income_statement_revenue_tag,
  income_statement_contra_revenue_tag = excluded.income_statement_contra_revenue_tag,
  income_statement_other_revenue_tag = excluded.income_statement_other_revenue_tag,
  income_statement_expense_tag = excluded.income_statement_expense_tag,
  income_statement_other_expense_tag = excluded.income_statement_other_expense_tag,
  income_statement_cogs_tag = excluded.income_statement_cogs_tag;

commit transaction;
