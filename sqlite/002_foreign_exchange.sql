/*
SQLite 3.49.0

MIGRATION 004: FOREIGN EXCHANGE OPERATIONS
==========================================

Implements comprehensive foreign exchange management and multi-currency operations:

DEPENDS ON: 001_core_accounting.sql

FOREIGN EXCHANGE OPERATIONS:
• Currency revaluation for foreign currency balances
• Unrealized gain/loss calculation and adjustment entries
• Historical exchange rate tracking and management
• Foreign currency transaction processing

REVALUATION SYSTEM:
• Automated foreign currency revaluation at period-end
• Mark-to-market adjustments for foreign currency accounts
• Unrealized FX gain/loss recognition
• Period-over-period FX impact analysis

EXCHANGE RATE MANAGEMENT:
• Multiple rate sources support (manual, API, central bank)
• Rate validation and historical tracking
• Cross-currency rate calculation
• Rate change impact analysis

MULTI-CURRENCY REPORTING:
• Financial statements in multiple currencies
• Currency translation adjustments
• Consolidated reporting in functional currency
• Foreign currency exposure analysis

This migration provides the framework for handling complex multi-currency
scenarios including foreign subsidiaries, international transactions,
and comprehensive FX risk management.
*/

pragma journal_mode = wal;
pragma foreign_keys = on;

begin exclusive transaction;

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

create table if not exists fx_revaluation_detail (
  id integer primary key,
  fx_revaluation_run_id integer not null,
  account_code integer not null,
  original_currency_code text not null,
  balance_original_currency integer not null,
  old_exchange_rate real not null,
  new_exchange_rate real not null,
  old_functional_balance integer not null,
  new_functional_balance integer not null,
  unrealized_gain_loss integer not null,
  foreign key (fx_revaluation_run_id) references fx_revaluation_run (id) on update restrict on delete restrict,
  foreign key (account_code) references account (code) on update restrict on delete restrict,
  foreign key (original_currency_code) references currency (code) on update restrict on delete restrict
) strict;

create index if not exists fx_revaluation_run_date_index on fx_revaluation_run (revaluation_date);
create index if not exists fx_revaluation_detail_run_id_index on fx_revaluation_detail (fx_revaluation_run_id);
create index if not exists fx_revaluation_detail_account_code_index on fx_revaluation_detail (account_code);

--- FOREIGN EXCHANGE RATE IMPORT ---

create table if not exists fx_rate_source (
  id integer primary key,
  name text not null unique,
  description text,
  base_url text,
  api_key_required integer not null default 0 check (api_key_required in (0, 1)),
  is_active integer not null default 1 check (is_active in (0, 1)),
  last_sync_time integer,
  created_time integer not null
) strict;

create table if not exists fx_rate_import_log (
  id integer primary key,
  source_id integer not null,
  import_time integer not null,
  rates_imported integer not null default 0,
  rates_updated integer not null default 0,
  rates_failed integer not null default 0,
  success_time integer, -- When import completed successfully
  partial_time integer, -- When import completed with some failures
  failed_time integer,  -- When import failed completely
  error_message text,
  foreign key (source_id) references fx_rate_source (id) on update restrict on delete restrict
) strict;

create index if not exists fx_rate_import_log_source_id_index on fx_rate_import_log (source_id);
create index if not exists fx_rate_import_log_import_time_index on fx_rate_import_log (import_time);

--- UNREALIZED GAIN/LOSS ACCOUNTS ---

-- Insert FX-related accounts if they don't exist
insert into account (code, name, account_type_name, currency_code) values
  (11500, 'Unrealized FX Gain/Loss - Assets', 'asset', 'USD'),
  (21500, 'Unrealized FX Gain/Loss - Liabilities', 'liability', 'USD'),
  (71000, 'Realized FX Gain', 'revenue', 'USD'),
  (71100, 'Realized FX Loss', 'expense', 'USD'),
  (71200, 'Unrealized FX Gain', 'revenue', 'USD'),
  (71300, 'Unrealized FX Loss', 'expense', 'USD'),
  (71400, 'Gain on Asset Disposal', 'revenue', 'USD'),
  (71500, 'Loss on Asset Disposal', 'expense', 'USD')
on conflict (code) do update set
  name = excluded.name,
  account_type_name = excluded.account_type_name,
  currency_code = excluded.currency_code;

-- Add tags for FX accounts
insert into account_tag (account_code, tag) values
  (11500, 'balance_sheet_current_asset'),
  (11500, 'fx_revaluation'),
  (21500, 'balance_sheet_current_liability'),
  (21500, 'fx_revaluation'),
  (71000, 'income_statement_other_revenue'),
  (71000, 'fx_realized'),
  (71100, 'income_statement_other_expense'),
  (71100, 'fx_realized'),
  (71200, 'income_statement_other_revenue'),
  (71200, 'fx_unrealized'),
  (71300, 'income_statement_other_expense'),
  (71300, 'fx_unrealized')
on conflict (account_code, tag) do nothing;

--- FOREIGN EXCHANGE VIEWS ---

-- Accounts requiring FX revaluation
drop view if exists fx_revaluation_candidates;
create view fx_revaluation_candidates as
select
  a.code,
  a.name,
  a.currency_code,
  a.balance as balance_original_currency,
  fc.code as functional_currency_code,
  ler.rate as current_exchange_rate,
  ler.rate_date as rate_date,
  round(a.balance * ler.rate) as current_functional_balance
from account a
cross join (select code from currency where is_functional_currency = 1) fc
left join latest_exchange_rate ler on ler.from_currency_code = a.currency_code
  and ler.to_currency_code = fc.code
where a.currency_code != fc.code
  and a.balance != 0
  and ler.rate is not null;

-- FX exposure summary
drop view if exists fx_exposure_summary;
create view fx_exposure_summary as
select
  frc.currency_code,
  c.name as currency_name,
  c.symbol as currency_symbol,
  count(*) as account_count,
  sum(frc.balance_original_currency) as total_balance_original,
  sum(frc.current_functional_balance) as total_balance_functional,
  frc.current_exchange_rate,
  frc.rate_date
from fx_revaluation_candidates frc
join currency c on c.code = frc.currency_code
group by frc.currency_code, frc.current_exchange_rate, frc.rate_date
order by abs(sum(frc.current_functional_balance)) desc;

-- Historical FX rate trends
drop view if exists fx_rate_trends;
create view fx_rate_trends as
select
  er.from_currency_code,
  er.to_currency_code,
  er.rate,
  er.rate_date,
  er.source,
  lag(er.rate) over (partition by er.from_currency_code, er.to_currency_code order by er.rate_date) as previous_rate,
  case
    when lag(er.rate) over (partition by er.from_currency_code, er.to_currency_code order by er.rate_date) is not null
    then ((er.rate - lag(er.rate) over (partition by er.from_currency_code, er.to_currency_code order by er.rate_date)) /
          lag(er.rate) over (partition by er.from_currency_code, er.to_currency_code order by er.rate_date)) * 100
    else 0
  end as rate_change_percent
from exchange_rate er
order by er.from_currency_code, er.to_currency_code, er.rate_date desc;

--- DEFAULT FX RATE SOURCES ---

insert into fx_rate_source (name, description, base_url, api_key_required, is_active, created_time) values
  ('Manual Entry', 'Manually entered exchange rates', null, 0, 1, 1704067200),
  ('European Central Bank', 'ECB daily reference rates', 'https://www.ecb.europa.eu/stats/eurofxref/', 0, 1, 1704067200),
  ('Bank of England', 'BoE daily exchange rates', 'https://www.bankofengland.co.uk/boeapps/database/', 0, 1, 1704067200),
  ('Federal Reserve', 'Fed H.10 Foreign Exchange Rates', 'https://www.federalreserve.gov/releases/h10/', 0, 1, 1704067200),
  ('Exchange Rate API', 'Free currency exchange rate API', 'https://api.exchangerate-api.com/v4/latest/', 0, 0, 1704067200),
  ('Currency Layer', 'Real-time exchange rates API', 'https://currencylayer.com/', 1, 0, 1704067200),
  ('Open Exchange Rates', 'Real-time exchange rates', 'https://openexchangerates.org/', 1, 0, 1704067200)
on conflict (name) do update set
  description = excluded.description,
  base_url = excluded.base_url,
  api_key_required = excluded.api_key_required;

--- EXCHANGE RATE VALIDATION TRIGGERS ---

-- Prevent invalid exchange rates
drop trigger if exists exchange_rate_validation_trigger;
create trigger exchange_rate_validation_trigger
before insert on exchange_rate for each row
begin
  select
    case
      when new.from_currency_code = new.to_currency_code
      then raise(rollback, 'from_currency_code and to_currency_code cannot be the same')
    end,
    case
      when new.rate <= 0
      then raise(rollback, 'exchange rate must be positive')
    end,
    case
      when new.rate > 1000000
      then raise(rollback, 'exchange rate seems unreasonably high')
    end,
    case
      when new.rate_date > 1735689600 -- 2025-01-01 00:00:00 UTC (reasonable future limit)
      then raise(rollback, 'exchange rate date cannot be in the future')
    end;
end;

-- Validate exchange rate updates
drop trigger if exists exchange_rate_update_validation_trigger;
create trigger exchange_rate_update_validation_trigger
before update on exchange_rate for each row
begin
  select
    case
      when new.from_currency_code != old.from_currency_code or
           new.to_currency_code != old.to_currency_code or
           new.rate_date != old.rate_date
      then raise(rollback, 'cannot modify currency codes or rate date of existing exchange rate')
    end,
    case
      when new.rate <= 0
      then raise(rollback, 'exchange rate must be positive')
    end,
    case
      when new.rate > 1000000
      then raise(rollback, 'exchange rate seems unreasonably high')
    end;
end;

--- SAMPLE EXCHANGE RATES ---
-- Insert some sample exchange rates for testing (rates as of 2024-01-01)
insert into exchange_rate (from_currency_code, to_currency_code, rate_date, rate, source, created_time) values
  ('EUR', 'USD', 1704067200, 1.1050, 'Manual Entry', 1704067200), -- 2024-01-01 00:00:00 UTC
  ('GBP', 'USD', 1704067200, 1.2680, 'Manual Entry', 1704067200),
  ('JPY', 'USD', 1704067200, 0.0071, 'Manual Entry', 1704067200),
  ('CAD', 'USD', 1704067200, 0.7456, 'Manual Entry', 1704067200),
  ('AUD', 'USD', 1704067200, 0.6789, 'Manual Entry', 1704067200),
  ('CHF', 'USD', 1704067200, 1.0876, 'Manual Entry', 1704067200),
  ('CNY', 'USD', 1704067200, 0.1398, 'Manual Entry', 1704067200),
  ('SEK', 'USD', 1704067200, 0.0952, 'Manual Entry', 1704067200),
  ('NOK', 'USD', 1704067200, 0.0943, 'Manual Entry', 1704067200),
  ('DKK', 'USD', 1704067200, 0.1481, 'Manual Entry', 1704067200)
on conflict (from_currency_code, to_currency_code, rate_date) do update set
  rate = excluded.rate,
  source = excluded.source;

-- Multi-Currency Account Balance View
drop view if exists account_balance_multicurrency;
create view account_balance_multicurrency as
select
  a.code,
  a.name,
  a.currency_code,
  a.balance as balance_original_currency,
  case
    when a.currency_code = fc.code then a.balance
    when er.rate is not null then round(a.balance * er.rate)
    else null
  end as balance_functional_currency,
  fc.code as functional_currency_code
from account a
cross join (select code from currency where is_functional_currency = 1) fc
left join latest_exchange_rate er on er.from_currency_code = a.currency_code and er.to_currency_code = fc.code;

-- Multi-Currency Trial Balance View
drop view if exists trial_balance_multicurrency;
create view trial_balance_multicurrency as
select
  a.code,
  a.name,
  a.currency_code,
  a.balance as balance_original_currency,
  case
    when a.currency_code = fc.code then a.balance
    when er.rate is not null then round(a.balance * er.rate)
    else null
  end as balance_functional_currency,
  case
    when a.currency_code = fc.code then
      case
        when a.balance > 0 and at.normal_balance = 'db' then a.balance
        when a.balance < 0 and at.normal_balance = 'cr' then -a.balance
        else 0
      end
    when er.rate is not null then
      case
        when a.balance > 0 and at.normal_balance = 'db' then round(a.balance * er.rate)
        when a.balance < 0 and at.normal_balance = 'cr' then -round(a.balance * er.rate)
        else 0
      end
    else null
  end as debit_balance_functional,
  case
    when a.currency_code = fc.code then
      case
        when a.balance > 0 and at.normal_balance = 'cr' then a.balance
        when a.balance < 0 and at.normal_balance = 'db' then -a.balance
        else 0
      end
    when er.rate is not null then
      case
        when a.balance > 0 and at.normal_balance = 'cr' then round(a.balance * er.rate)
        when a.balance < 0 and at.normal_balance = 'db' then -round(a.balance * er.rate)
        else 0
      end
    else null
  end as credit_balance_functional,
  fc.code as functional_currency_code
from account a
join account_type at on a.account_type_name = at.name
cross join (select code from currency where is_functional_currency = 1) fc
left join latest_exchange_rate er on er.from_currency_code = a.currency_code and er.to_currency_code = fc.code
where a.balance != 0;

--- AUTOMATIC FX REVALUATION JOURNAL ENTRIES ---

-- Trigger to automatically create journal entries for FX revaluation
drop trigger if exists fx_revaluation_automatic_journal_trigger;
create trigger fx_revaluation_automatic_journal_trigger
after insert on fx_revaluation_run for each row
when new.total_unrealized_gain_loss != 0
begin
  -- Create journal entry for FX revaluation
  insert into journal_entry (
    transaction_time,
    note,
    transaction_currency_code
  ) values (
    new.revaluation_date,
    'Foreign Exchange Revaluation - Run ID: ' || new.id,
    (select code from currency where is_functional_currency = 1)
  );

  -- For unrealized gain/loss - first line
  insert into journal_entry_line_auto_number (
    journal_entry_ref,
    account_code,
    db,
    cr,
    db_functional,
    cr_functional
  )
  select
    last_insert_rowid(),
    case when new.total_unrealized_gain_loss > 0 then 11500 else 71300 end, -- Asset FX Account or FX Loss
    case when new.total_unrealized_gain_loss > 0 then new.total_unrealized_gain_loss 
         when new.total_unrealized_gain_loss < 0 then abs(new.total_unrealized_gain_loss) 
         else 0 end,
    case when new.total_unrealized_gain_loss > 0 then 0 
         when new.total_unrealized_gain_loss < 0 then 0 
         else 0 end,
    case when new.total_unrealized_gain_loss > 0 then new.total_unrealized_gain_loss 
         when new.total_unrealized_gain_loss < 0 then abs(new.total_unrealized_gain_loss) 
         else 0 end,
    case when new.total_unrealized_gain_loss > 0 then 0 
         when new.total_unrealized_gain_loss < 0 then 0 
         else 0 end
  where new.total_unrealized_gain_loss != 0;

  -- For unrealized gain/loss - offsetting line
  insert into journal_entry_line_auto_number (
    journal_entry_ref,
    account_code,
    db,
    cr,
    db_functional,
    cr_functional
  )
  select
    last_insert_rowid(),
    case when new.total_unrealized_gain_loss > 0 then 71200 else 21500 end, -- FX Gain or Liability FX Account
    case when new.total_unrealized_gain_loss < 0 then 0 
         when new.total_unrealized_gain_loss > 0 then 0 
         else 0 end,
    case when new.total_unrealized_gain_loss > 0 then new.total_unrealized_gain_loss 
         when new.total_unrealized_gain_loss < 0 then abs(new.total_unrealized_gain_loss) 
         else 0 end,
    case when new.total_unrealized_gain_loss < 0 then 0 
         when new.total_unrealized_gain_loss > 0 then 0 
         else 0 end,
    case when new.total_unrealized_gain_loss > 0 then new.total_unrealized_gain_loss 
         when new.total_unrealized_gain_loss < 0 then abs(new.total_unrealized_gain_loss) 
         else 0 end
  where new.total_unrealized_gain_loss != 0;

  -- Post the journal entry immediately
  update journal_entry
  set post_time = new.revaluation_date
  where ref = last_insert_rowid();

  -- Link back to revaluation run
  update fx_revaluation_run
  set journal_entry_ref = last_insert_rowid()
  where id = new.id;
end;

commit transaction;
