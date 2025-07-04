/*
SQLite 3.49.0

MIGRATION 003: ASSET REGISTER & DEPRECIATION MANAGEMENT
=======================================================

Implements comprehensive fixed asset management and depreciation tracking:

DEPENS ON: 001_core_accounting.sql

ASSET CATEGORIES:
• Predefined asset categories with default depreciation settings
• Configurable useful life and depreciation methods per category
• Direct linking to chart of accounts for asset, accumulated depreciation, and expense accounts

FIXED ASSET REGISTER:
• Complete asset lifecycle tracking from purchase to disposal
• Multiple depreciation methods: straight-line, declining balance, sum-of-years-digits, units of production
• Asset modifications tracking (improvements, repairs, maintenance)
• Status management: active, disposed, fully depreciated, impaired

DEPRECIATION SYSTEM:
• Automated depreciation schedule calculation and journal entry generation
• Period-based depreciation with flexible date ranges
• Support for asset usage tracking (units of production method)
• Asset impairment recognition and tracking

INTEGRATION FEATURES:
• Direct journal entry integration for purchase, depreciation, and disposal
• Real-time book value calculations
• Comprehensive asset register reporting views
• Validation triggers preventing invalid asset modifications

Includes default asset categories for buildings, machinery, office equipment,
vehicles, and other fixed assets with industry-standard depreciation settings.
*/

pragma journal_mode = wal;
pragma foreign_keys = on;

begin exclusive transaction;

--- ASSET REGISTER AND DEPRECIATION ---

-- Asset categories for classification and depreciation grouping
create table if not exists asset_category (
  id integer primary key,
  name text not null unique,
  description text,
  useful_life_years integer not null check (useful_life_years > 0),
  default_depreciation_method text not null check (default_depreciation_method in ('straight_line', 'declining_balance', 'sum_of_years_digits', 'units_of_production')),
  default_declining_balance_rate real check (default_declining_balance_rate > 0 and default_declining_balance_rate <= 1),
  asset_account_code integer not null,
  accumulated_depreciation_account_code integer not null,
  depreciation_expense_account_code integer not null,
  foreign key (asset_account_code) references account (code) on update restrict on delete restrict,
  foreign key (accumulated_depreciation_account_code) references account (code) on update restrict on delete restrict,
  foreign key (depreciation_expense_account_code) references account (code) on update restrict on delete restrict
) strict;

create index if not exists asset_category_name_index on asset_category (name);

-- Initial asset category data
insert or ignore into asset_category (name, description, useful_life_years, default_depreciation_method, default_declining_balance_rate, asset_account_code, accumulated_depreciation_account_code, depreciation_expense_account_code) values
  ('Buildings', 'Buildings and building improvements', 25, 'straight_line', null, 12200, 12210, 61100),
  ('Office Equipment', 'Office equipment and furniture', 5, 'declining_balance', 0.4, 12400, 12410, 61100),
  ('Vehicles', 'Company vehicles and transportation equipment', 8, 'straight_line', null, 12300, 12310, 61100),
  ('Computer Equipment', 'Computers, servers, and IT equipment', 3, 'straight_line', null, 12500, 12510, 61100),
  ('Manufacturing Equipment', 'Production machinery and equipment', 10, 'units_of_production', null, 12600, 12610, 61100);

-- Fixed asset register
create table if not exists fixed_asset (
  id integer primary key,
  asset_number text not null unique,
  name text not null,
  description text,
  asset_category_id integer not null,

  -- Purchase information
  purchase_date integer not null, -- Unix timestamp
  purchase_cost integer not null check (purchase_cost > 0), -- In smallest currency unit
  supplier text,
  purchase_invoice_ref text,
  purchase_journal_entry_ref integer,

  -- Depreciation settings
  depreciation_method text not null check (depreciation_method in ('straight_line', 'declining_balance', 'sum_of_years_digits', 'units_of_production')),
  useful_life_years integer not null check (useful_life_years > 0),
  useful_life_units integer check (useful_life_units > 0), -- For units of production method
  salvage_value integer not null default 0 check (salvage_value >= 0),
  declining_balance_rate real check (declining_balance_rate > 0 and declining_balance_rate <= 1),

  -- Status timestamps (only one should be set at a time)
  active_time integer not null, -- When asset became active (usually purchase_date)
  disposed_time integer, -- When asset was disposed
  fully_depreciated_time integer, -- When asset became fully depreciated
  impaired_time integer, -- When asset was impaired
  location text,

  -- Disposal information
  disposal_date integer,
  disposal_proceeds integer check (disposal_proceeds >= 0),
  disposal_journal_entry_ref integer,

  -- Add depreciation recapture tracking columns
  accumulated_depreciation_at_disposal integer default 0,
  gain_loss_on_disposal integer default 0,

  foreign key (asset_category_id) references asset_category (id) on update restrict on delete restrict,
  foreign key (purchase_journal_entry_ref) references journal_entry (ref) on update restrict on delete restrict,
  foreign key (disposal_journal_entry_ref) references journal_entry (ref) on update restrict on delete restrict
) strict;

create index if not exists fixed_asset_asset_number_index on fixed_asset (asset_number);
create index if not exists fixed_asset_category_index on fixed_asset (asset_category_id);
create index if not exists fixed_asset_active_time_index on fixed_asset (active_time);
create index if not exists fixed_asset_disposed_time_index on fixed_asset (disposed_time);
create index if not exists fixed_asset_purchase_date_index on fixed_asset (purchase_date);

-- View to compute current asset status from timestamp fields
drop view if exists fixed_asset_with_status;
create view fixed_asset_with_status as
select
  fa.*,
  case
    when fa.disposed_time is not null then 'disposed'
    when fa.fully_depreciated_time is not null then 'fully_depreciated'
    when fa.impaired_time is not null then 'impaired'
    else 'active'
  end as status
from fixed_asset fa;

-- Asset modifications (improvements, betterments, repairs)
create table if not exists asset_modification (
  id integer primary key,
  fixed_asset_id integer not null,
  modification_date integer not null,
  modification_type text not null check (modification_type in ('improvement', 'betterment', 'major_repair', 'maintenance')),
  description text not null,
  cost integer not null check (cost > 0),
  capitalizable integer not null check (capitalizable in (0, 1)), -- Boolean: 1 if cost should be capitalized
  journal_entry_ref integer,

  foreign key (fixed_asset_id) references fixed_asset (id) on update restrict on delete restrict,
  foreign key (journal_entry_ref) references journal_entry (ref) on update restrict on delete restrict
) strict;

create index if not exists asset_modification_fixed_asset_index on asset_modification (fixed_asset_id);
create index if not exists asset_modification_date_index on asset_modification (modification_date);

-- Depreciation schedule and calculations
create table if not exists depreciation_period (
  id integer primary key,
  fixed_asset_id integer not null,
  period_start_date integer not null,
  period_end_date integer not null,
  depreciation_amount integer not null check (depreciation_amount >= 0),
  accumulated_depreciation integer not null check (accumulated_depreciation >= 0),
  book_value integer not null check (book_value >= 0),
  calculation_method text not null,
  calculation_details text, -- JSON or text describing calculation specifics
  journal_entry_ref integer,

  foreign key (fixed_asset_id) references fixed_asset (id) on update restrict on delete restrict,
  foreign key (journal_entry_ref) references journal_entry (ref) on update restrict on delete restrict
) strict;

create index if not exists depreciation_period_asset_index on depreciation_period (fixed_asset_id);
create index if not exists depreciation_period_date_index on depreciation_period (period_start_date, period_end_date);

-- Asset usage tracking (for units of production depreciation)
create table if not exists asset_usage (
  id integer primary key,
  fixed_asset_id integer not null,
  period_start_date integer not null,
  period_end_date integer not null,
  units_used integer not null check (units_used >= 0),
  cumulative_units integer not null check (cumulative_units >= 0),
  notes text,

  foreign key (fixed_asset_id) references fixed_asset (id) on update restrict on delete restrict
) strict;

create index if not exists asset_usage_asset_index on asset_usage (fixed_asset_id);
create index if not exists asset_usage_date_index on asset_usage (period_start_date, period_end_date);

-- Asset impairment tracking
create table if not exists asset_impairment (
  id integer primary key,
  fixed_asset_id integer not null,
  impairment_date integer not null,
  impairment_amount integer not null check (impairment_amount > 0),
  reason text not null,
  recoverable_amount integer not null check (recoverable_amount >= 0),
  journal_entry_ref integer,

  foreign key (fixed_asset_id) references fixed_asset (id) on update restrict on delete restrict,
  foreign key (journal_entry_ref) references journal_entry (ref) on update restrict on delete restrict
) strict;

create index if not exists asset_impairment_asset_index on asset_impairment (fixed_asset_id);
create index if not exists asset_impairment_date_index on asset_impairment (impairment_date);

-- Triggers for asset register validation and automation

-- Validate disposal information
drop trigger if exists fixed_asset_disposal_validation_trigger;
create trigger fixed_asset_disposal_validation_trigger
before update on fixed_asset for each row
when new.disposed_time is not null and old.disposed_time is null
begin
  select
    case
      when new.disposal_date is null
      then raise(rollback, 'disposal_date is required when asset is disposed')
    end,
    case
      when new.disposal_date < new.purchase_date
      then raise(rollback, 'disposal_date cannot be before purchase_date')
    end,
    case
      when new.disposed_time < new.purchase_date
      then raise(rollback, 'disposed_time cannot be before purchase_date')
    end;
end;

-- Validate depreciation method parameters
drop trigger if exists fixed_asset_depreciation_validation_trigger;
create trigger fixed_asset_depreciation_validation_trigger
before insert on fixed_asset for each row
begin
  select
    case
      when new.depreciation_method = 'declining_balance' and new.declining_balance_rate is null
      then raise(rollback, 'declining_balance_rate is required for declining_balance depreciation method')
    end,
    case
      when new.depreciation_method = 'units_of_production' and new.useful_life_units is null
      then raise(rollback, 'useful_life_units is required for units_of_production depreciation method')
    end,
    case
      when new.salvage_value >= new.purchase_cost
      then raise(rollback, 'salvage_value must be less than purchase_cost')
    end;
end;

-- Also apply the same validation for updates
drop trigger if exists fixed_asset_depreciation_update_validation_trigger;
create trigger fixed_asset_depreciation_update_validation_trigger
before update on fixed_asset for each row
when new.salvage_value != old.salvage_value or new.purchase_cost != old.purchase_cost
begin
  select
    case
      when new.salvage_value >= new.purchase_cost
      then raise(rollback, 'salvage_value must be less than purchase_cost')
    end;
end;

-- Prevent modification of disposed assets
drop trigger if exists fixed_asset_disposed_modification_trigger;
create trigger fixed_asset_disposed_modification_trigger
before update on fixed_asset for each row
when old.disposed_time is not null
begin
  select
    case
      when new.disposed_time != old.disposed_time or
           new.purchase_cost != old.purchase_cost or
           new.useful_life_years != old.useful_life_years or
           new.depreciation_method != old.depreciation_method
      then raise(rollback, 'cannot modify key attributes of disposed assets')
    end;
end;

--- DEPRECIATION CALCULATION FUNCTIONS ---

-- Calculate straight-line depreciation for a period
drop view if exists calculate_straight_line_depreciation;
create view calculate_straight_line_depreciation as
select
  fa.id as fixed_asset_id,
  fa.asset_number,
  fa.name,
  (fa.purchase_cost - fa.salvage_value) / fa.useful_life_years as annual_depreciation,
  case
    when fa.useful_life_years > 0
    then cast((fa.purchase_cost - fa.salvage_value) / (fa.useful_life_years * 12.0) as integer)
    else 0
  end as monthly_depreciation
from fixed_asset_with_status fa
where fa.depreciation_method = 'straight_line'
  and fa.status = 'active';

-- Calculate declining balance depreciation
drop view if exists calculate_declining_balance_depreciation;
create view calculate_declining_balance_depreciation as
select
  fa.id as fixed_asset_id,
  fa.asset_number,
  fa.name,
  fa.declining_balance_rate,
  coalesce(latest_dep.accumulated_depreciation, 0) as current_accumulated_depreciation,
  fa.purchase_cost - coalesce(latest_dep.accumulated_depreciation, 0) as current_book_value,
  cast((fa.purchase_cost - coalesce(latest_dep.accumulated_depreciation, 0)) * fa.declining_balance_rate as integer) as next_year_depreciation,
  case
    when fa.declining_balance_rate > 0
    then cast((fa.purchase_cost - coalesce(latest_dep.accumulated_depreciation, 0)) * fa.declining_balance_rate / 12.0 as integer)
    else 0
  end as next_month_depreciation
from fixed_asset_with_status fa
left join (
  select
    fixed_asset_id,
    accumulated_depreciation
  from depreciation_period dp1
  where dp1.id = (
    select max(dp2.id)
    from depreciation_period dp2
    where dp2.fixed_asset_id = dp1.fixed_asset_id
  )
) latest_dep on latest_dep.fixed_asset_id = fa.id
where fa.depreciation_method = 'declining_balance'
  and fa.status = 'active'
  and fa.declining_balance_rate is not null;

-- Calculate units of production depreciation
drop view if exists calculate_units_of_production_depreciation;
create view calculate_units_of_production_depreciation as
select
  fa.id as fixed_asset_id,
  fa.asset_number,
  fa.name,
  fa.useful_life_units,
  case
    when fa.useful_life_units > 0
    then cast((fa.purchase_cost - fa.salvage_value) / cast(fa.useful_life_units as real) as real)
    else 0
  end as depreciation_per_unit,
  coalesce(latest_usage.cumulative_units, 0) as total_units_used,
  coalesce(latest_dep.accumulated_depreciation, 0) as current_accumulated_depreciation
from fixed_asset_with_status fa
left join (
  select
    fixed_asset_id,
    accumulated_depreciation
  from depreciation_period dp1
  where dp1.id = (
    select max(dp2.id)
    from depreciation_period dp2
    where dp2.fixed_asset_id = dp1.fixed_asset_id
  )
) latest_dep on latest_dep.fixed_asset_id = fa.id
left join (
  select
    fixed_asset_id,
    cumulative_units
  from asset_usage au1
  where au1.id = (
    select max(au2.id)
    from asset_usage au2
    where au2.fixed_asset_id = au1.fixed_asset_id
  )
) latest_usage on latest_usage.fixed_asset_id = fa.id
where fa.depreciation_method = 'units_of_production'
  and fa.status = 'active'
  and fa.useful_life_units is not null;

-- Asset register summary view
drop view if exists asset_register_summary;
create view asset_register_summary as
select
  fa.id,
  fa.asset_number,
  fa.name,
  fa.description,
  ac.name as category_name,
  fa.purchase_date,
  fa.purchase_cost,
  fa.salvage_value,
  fa.useful_life_years,
  fa.depreciation_method,
  fa.status,
  fa.location,
  coalesce(sum(case when am.capitalizable = 1 then am.cost else 0 end), 0) as capitalized_modifications,
  fa.purchase_cost + coalesce(sum(case when am.capitalizable = 1 then am.cost else 0 end), 0) as total_cost_basis,
  coalesce(max(dp.accumulated_depreciation), 0) as accumulated_depreciation,
  fa.purchase_cost - coalesce(max(dp.accumulated_depreciation), 0) as book_value
from fixed_asset_with_status fa
join asset_category ac on fa.asset_category_id = ac.id
left join asset_modification am on fa.id = am.fixed_asset_id
left join depreciation_period dp on fa.id = dp.fixed_asset_id
group by fa.id, fa.asset_number, fa.name, fa.description, ac.name, fa.purchase_date,
         fa.purchase_cost, fa.salvage_value, fa.useful_life_years, fa.depreciation_method,
         fa.status, fa.location;

-- Assets pending depreciation view
drop view if exists assets_pending_depreciation;
create view assets_pending_depreciation as
select
  fa.id,
  fa.asset_number,
  fa.name,
  fa.description,
  ac.name as category_name,
  fa.purchase_date,
  fa.purchase_cost,
  fa.salvage_value,
  fa.useful_life_years,
  fa.depreciation_method,
  fa.status,
  coalesce(latest_dep.accumulated_depreciation, 0) as current_accumulated_depreciation,
  fa.purchase_cost - coalesce(latest_dep.accumulated_depreciation, 0) as current_book_value,
  -- Note: days_since_purchase calculation removed to avoid unixepoch dependency
  -- Use contextual time calculations in application layer instead
  null as days_since_purchase
from fixed_asset_with_status fa
join asset_category ac on fa.asset_category_id = ac.id
left join (
  select
    fixed_asset_id,
    accumulated_depreciation,
    period_end_date
  from depreciation_period dp1
  where dp1.id = (
    select max(dp2.id)
    from depreciation_period dp2
    where dp2.fixed_asset_id = dp1.fixed_asset_id
  )
) latest_dep on fa.id = latest_dep.fixed_asset_id
where fa.status = 'active';
  -- Note: time-based filtering removed to avoid unixepoch dependency
  -- Use contextual time filtering in application layer instead

-- Enhanced disposal trigger with gain/loss calculation
drop trigger if exists fixed_asset_disposal_enhanced_trigger;
create trigger fixed_asset_disposal_enhanced_trigger
after update on fixed_asset for each row
when old.disposal_date is null and new.disposal_date is not null
begin
  -- Calculate accumulated depreciation at disposal
  update fixed_asset
  set accumulated_depreciation_at_disposal = (
    select coalesce(sum(depreciation_amount), 0)
    from depreciation_period
    where fixed_asset_id = new.id
      and period_start_date <= new.disposal_date
  ),
  gain_loss_on_disposal = coalesce(new.disposal_proceeds, 0) - (new.purchase_cost - (
    select coalesce(sum(depreciation_amount), 0)
    from depreciation_period
    where fixed_asset_id = new.id
      and period_start_date <= new.disposal_date
  ))
  where id = new.id;
  
  -- Create journal entry for asset disposal (always create if disposal_date is set)
  insert into journal_entry (
    transaction_time,
    note
  ) values (
    new.disposal_date,
    'Asset Disposal - ' || new.name || ' (#' || new.asset_number || ')'
  );
  
  -- DR Cash (disposal proceeds) - only if proceeds > 0
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
    10100, -- Cash
    new.disposal_proceeds,
    0,
    new.disposal_proceeds,
    0
  where coalesce(new.disposal_proceeds, 0) > 0;
  
  -- DR Accumulated Depreciation (always if there's accumulated depreciation)
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
    ac.accumulated_depreciation_account_code,
    calc.accumulated_dep,
    0,
    calc.accumulated_dep,
    0
  from asset_category ac,
       (select coalesce(sum(depreciation_amount), 0) as accumulated_dep
        from depreciation_period
        where fixed_asset_id = new.id
          and period_start_date <= new.disposal_date) calc
  where ac.id = new.asset_category_id
    and calc.accumulated_dep > 0;
  
  -- CR Asset Cost (always)
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
    ac.asset_account_code,
    0,
    new.purchase_cost,
    0,
    new.purchase_cost
  from asset_category ac
  where ac.id = new.asset_category_id;
  
  -- Handle gain/loss on disposal (if any)
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
    case when calc.gain_loss > 0 then 40400 else 51500 end, -- Gain/Loss on Asset Disposal
    case when calc.gain_loss < 0 then abs(calc.gain_loss) else 0 end,
    case when calc.gain_loss > 0 then calc.gain_loss else 0 end,
    case when calc.gain_loss < 0 then abs(calc.gain_loss) else 0 end,
    case when calc.gain_loss > 0 then calc.gain_loss else 0 end
  from (select coalesce(new.disposal_proceeds, 0) - (new.purchase_cost - (
                 select coalesce(sum(depreciation_amount), 0)
                 from depreciation_period
                 where fixed_asset_id = new.id
                   and period_start_date <= new.disposal_date
               )) as gain_loss) calc
  where calc.gain_loss != 0;
  
  -- Post the journal entry immediately
  update journal_entry
  set post_time = new.disposal_date
  where ref = last_insert_rowid();
end;

-- Commit the transaction to finalize all schema changes
commit transaction;
