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
  created_time integer not null default (unixepoch()),
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
  created_time integer not null default (unixepoch())
) strict;

create table if not exists fx_rate_import_log (
  id integer primary key,
  source_id integer not null,
  import_time integer not null default (unixepoch()),
  rates_imported integer not null default 0,
  rates_updated integer not null default 0,
  rates_failed integer not null default 0,
  import_status text not null check (import_status in ('success', 'partial', 'failed')),
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
  (71300, 'Unrealized FX Loss', 'expense', 'USD')
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
  cast(a.balance * ler.rate as integer) as current_functional_balance
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

insert into fx_rate_source (name, description, base_url, api_key_required, is_active) values
  ('Manual Entry', 'Manually entered exchange rates', null, 0, 1),
  ('European Central Bank', 'ECB daily reference rates', 'https://www.ecb.europa.eu/stats/eurofxref/', 0, 1),
  ('Bank of England', 'BoE daily exchange rates', 'https://www.bankofengland.co.uk/boeapps/database/', 0, 1),
  ('Federal Reserve', 'Fed H.10 Foreign Exchange Rates', 'https://www.federalreserve.gov/releases/h10/', 0, 1),
  ('Exchange Rate API', 'Free currency exchange rate API', 'https://api.exchangerate-api.com/v4/latest/', 0, 0),
  ('Currency Layer', 'Real-time exchange rates API', 'https://currencylayer.com/', 1, 0),
  ('Open Exchange Rates', 'Real-time exchange rates', 'https://openexchangerates.org/', 1, 0)
on conflict (name) do update set
  description = excluded.description,
  base_url = excluded.base_url,
  api_key_required = excluded.api_key_required;

--- SAMPLE EXCHANGE RATES ---
-- Insert some sample exchange rates for testing (rates as of a typical day)
insert into exchange_rate (from_currency_code, to_currency_code, rate_date, rate, source) values
  ('EUR', 'USD', unixepoch('2024-01-01'), 1.1050, 'Manual Entry'),
  ('GBP', 'USD', unixepoch('2024-01-01'), 1.2680, 'Manual Entry'),
  ('JPY', 'USD', unixepoch('2024-01-01'), 0.0071, 'Manual Entry'),
  ('CAD', 'USD', unixepoch('2024-01-01'), 0.7456, 'Manual Entry'),
  ('AUD', 'USD', unixepoch('2024-01-01'), 0.6789, 'Manual Entry'),
  ('CHF', 'USD', unixepoch('2024-01-01'), 1.0876, 'Manual Entry'),
  ('CNY', 'USD', unixepoch('2024-01-01'), 0.1398, 'Manual Entry'),
  ('SEK', 'USD', unixepoch('2024-01-01'), 0.0952, 'Manual Entry'),
  ('NOK', 'USD', unixepoch('2024-01-01'), 0.0943, 'Manual Entry'),
  ('DKK', 'USD', unixepoch('2024-01-01'), 0.1481, 'Manual Entry')
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
    else round(a.balance * coalesce(er.rate, 1.0))
  end as balance_functional_currency,
  fc.code as functional_currency_code
from account a
cross join (select code from currency where is_functional_currency = 1) fc
left join latest_exchange_rate er on er.from_currency_code = a.currency_code and er.to_currency_code = fc.code
where a.balance != 0;

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
    else round(a.balance * coalesce(er.rate, 1.0))
  end as balance_functional_currency,
  case 
    when a.currency_code = fc.code then 
      case
        when a.balance > 0 and at.normal_balance = 'db' then a.balance
        when a.balance < 0 and at.normal_balance = 'cr' then -a.balance
        else 0
      end
    else 
      case
        when a.balance > 0 and at.normal_balance = 'db' then round(a.balance * coalesce(er.rate, 1.0))
        when a.balance < 0 and at.normal_balance = 'cr' then -round(a.balance * coalesce(er.rate, 1.0))
        else 0
      end
  end as debit_balance_functional,
  case 
    when a.currency_code = fc.code then 
      case
        when a.balance > 0 and at.normal_balance = 'cr' then a.balance
        when a.balance < 0 and at.normal_balance = 'db' then -a.balance
        else 0
      end
    else 
      case
        when a.balance > 0 and at.normal_balance = 'cr' then round(a.balance * coalesce(er.rate, 1.0))
        when a.balance < 0 and at.normal_balance = 'db' then -round(a.balance * coalesce(er.rate, 1.0))
        else 0
      end
  end as credit_balance_functional,
  fc.code as functional_currency_code
from account a
join account_type at on a.account_type_name = at.name
cross join (select code from currency where is_functional_currency = 1) fc
left join latest_exchange_rate er on er.from_currency_code = a.currency_code and er.to_currency_code = fc.code
where a.balance != 0;

commit transaction;
