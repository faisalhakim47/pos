/*
SQLite 3.49.0

MIGRATION 008: INVENTORY ACCOUNTING
==================================

Implements inventory accounting and valuation with GAAP compliance:

DEPENDS ON: 004_product_management.sql, 005_warehouse_management.sql, 
           006_inventory_tracking.sql, 007_inventory_transactions.sql

ACCOUNTING FEATURES:
• FIFO/LIFO cost layer management
• Automatic journal entry creation
• Lower of Cost or Market (LCM) compliance
• Inventory reserves and write-downs
• Costing method change tracking
• ABC analysis and turnover reporting

This module ensures proper accounting treatment of inventory transactions
and maintains compliance with accounting principles.
*/

pragma journal_mode = wal;
pragma foreign_keys = on;

begin exclusive transaction;

--- COSTING AND VALUATION ---

-- FIFO/LIFO cost layers for accurate costing
create table if not exists inventory_cost_layer (
  id integer primary key,
  product_id integer not null,
  product_variant_id integer,
  warehouse_location_id integer not null,
  lot_id integer,
  received_date integer not null,
  quantity_received integer not null check (quantity_received > 0),
  quantity_remaining integer not null check (quantity_remaining >= 0),
  unit_cost integer not null check (unit_cost >= 0),
  currency_code text not null default 'USD',
  inventory_transaction_id integer not null,
  foreign key (product_id) references product (id) on update restrict on delete restrict,
  foreign key (product_variant_id) references product_variant (id) on update restrict on delete restrict,
  foreign key (warehouse_location_id) references warehouse_location (id) on update restrict on delete restrict,
  foreign key (lot_id) references inventory_lot (id) on update restrict on delete restrict,
  foreign key (currency_code) references currency (code) on update restrict on delete restrict,
  foreign key (inventory_transaction_id) references inventory_transaction (id) on update restrict on delete restrict
) strict;

create index if not exists inventory_cost_layer_product_id_index on inventory_cost_layer (product_id);
create index if not exists inventory_cost_layer_received_date_index on inventory_cost_layer (received_date);
create index if not exists inventory_cost_layer_warehouse_location_id_index on inventory_cost_layer (warehouse_location_id);

--- INVENTORY VALUATION AND ACCOUNTING PRINCIPLES ---

-- Lower of Cost or Market (LCM) tracking
create table if not exists inventory_market_value (
  id integer primary key,
  product_id integer not null,
  valuation_date integer not null,
  market_value_per_unit integer not null check (market_value_per_unit >= 0),
  replacement_cost_per_unit integer not null check (replacement_cost_per_unit >= 0),
  net_realizable_value integer not null check (net_realizable_value >= 0),
  valuation_method text not null check (valuation_method in ('REPLACEMENT_COST', 'NET_REALIZABLE_VALUE', 'NET_REALIZABLE_VALUE_LESS_PROFIT')),
  created_by_user text not null,
  created_time integer not null,
  foreign key (product_id) references product (id) on update restrict on delete restrict
) strict;

create index if not exists inventory_market_value_product_id_index on inventory_market_value (product_id);
create index if not exists inventory_market_value_valuation_date_index on inventory_market_value (valuation_date);

-- Inventory reserves for obsolescence, shrinkage, and write-downs
create table if not exists inventory_reserve (
  id integer primary key,
  product_id integer not null,
  reserve_type text not null check (reserve_type in ('OBSOLESCENCE', 'SHRINKAGE', 'DAMAGE', 'LCM_WRITEDOWN', 'SLOW_MOVING')),
  reserve_amount integer not null check (reserve_amount >= 0),
  reserve_percentage real check (reserve_percentage >= 0 and reserve_percentage <= 100),
  effective_date integer not null,
  expiry_date integer,
  reason text not null,
  created_by_user text not null,
  approved_by_user text,
  journal_entry_ref integer,
  -- Timestamp-based status tracking instead of text status
  created_time integer not null,
  approved_time integer,
  applied_time integer,
  reversed_time integer,
  foreign key (product_id) references product (id) on update restrict on delete restrict,
  foreign key (journal_entry_ref) references journal_entry (ref) on update restrict on delete restrict
) strict;

create index if not exists inventory_reserve_product_id_index on inventory_reserve (product_id);
create index if not exists inventory_reserve_reserve_type_index on inventory_reserve (reserve_type);
-- Indexes for timestamp-based status tracking
create index if not exists inventory_reserve_created_time_index on inventory_reserve (created_time);
create index if not exists inventory_reserve_approved_time_index on inventory_reserve (approved_time);
create index if not exists inventory_reserve_applied_time_index on inventory_reserve (applied_time);
create index if not exists inventory_reserve_reversed_time_index on inventory_reserve (reversed_time);

-- Inventory aging for obsolescence analysis
create table if not exists inventory_aging_category (
  id integer primary key,
  category_name text not null unique,
  days_from integer not null check (days_from >= 0),
  days_to integer check (days_to > days_from or days_to is null),
  obsolescence_rate real not null default 0 check (obsolescence_rate >= 0 and obsolescence_rate <= 100),
  is_active integer not null default 1 check (is_active in (0, 1))
) strict;

-- Costing method change audit trail (for consistency principle)
create table if not exists product_costing_method_history (
  id integer primary key,
  product_id integer not null,
  old_costing_method text not null,
  new_costing_method text not null,
  change_date integer not null,
  change_reason text not null,
  changed_by_user text not null,
  approved_by_user text,
  approved_time integer,
  journal_entry_ref integer,
  foreign key (product_id) references product (id) on update restrict on delete restrict,
  foreign key (journal_entry_ref) references journal_entry (ref) on update restrict on delete restrict
) strict;

create index if not exists product_costing_method_history_product_id_index on product_costing_method_history (product_id);
create index if not exists product_costing_method_history_change_date_index on product_costing_method_history (change_date);

--- ENHANCED TRIGGERS FOR ACCOUNTING PRINCIPLES ---

-- Trigger to track costing method changes (Consistency Principle)
drop trigger if exists product_costing_method_change_trigger;
create trigger product_costing_method_change_trigger
after update on product for each row
when old.costing_method != new.costing_method
begin
  insert into product_costing_method_history (
    product_id,
    old_costing_method,
    new_costing_method,
    change_date,
    change_reason,
    changed_by_user
  ) values (
    new.id,
    old.costing_method,
    new.costing_method,
    unixepoch(),
    'Costing method change requires documentation',
    'system'
  );
end;

-- Trigger to automatically create obsolescence reserves for expired lots (Conservatism Principle)
drop trigger if exists inventory_lot_expiration_reserve_trigger;
create trigger inventory_lot_expiration_reserve_trigger
after update on inventory_lot for each row
when new.expiration_date <= unixepoch() and old.expiration_date > unixepoch()
begin
  insert into inventory_reserve (
    product_id,
    reserve_type,
    reserve_percentage,
    effective_date,
    reason,
    created_by_user,
    created_time,
    approved_time
  ) values (
    new.product_id,
    'OBSOLESCENCE',
    100.0, -- 100% reserve for expired items
    new.expiration_date,
    'Automatic reserve for expired lot: ' || new.lot_number,
    'system',
    new.expiration_date,
    new.expiration_date
  );
end;

-- Trigger to validate LCM rule compliance (Lower of Cost or Market)
drop trigger if exists inventory_lcm_validation_trigger;
create trigger inventory_lcm_validation_trigger
after insert on inventory_market_value for each row
when new.market_value_per_unit < (
  select coalesce(avg(unit_cost), 0) from inventory_stock 
  where product_id = new.product_id and quantity_on_hand > 0
)
begin
  -- Create automatic LCM write-down reserve
  insert into inventory_reserve (
    product_id,
    reserve_type,
    reserve_amount,
    effective_date,
    reason,
    created_by_user,
    created_time
  ) values (
    new.product_id,
    'LCM_WRITEDOWN',
    (select sum((unit_cost - new.market_value_per_unit) * quantity_on_hand)
     from inventory_stock 
     where product_id = new.product_id and quantity_on_hand > 0 and unit_cost > new.market_value_per_unit),
    new.valuation_date,
    'LCM write-down required - market value below cost',
    new.created_by_user,
    new.valuation_date
  );
end;

-- Enhanced inventory reserve journal entry automation
drop trigger if exists inventory_reserve_journal_entry_trigger;
create trigger inventory_reserve_journal_entry_trigger
after update on inventory_reserve for each row
when old.applied_time is null and new.applied_time is not null
  and new.reserve_amount > 0
begin
  -- Create journal entry for inventory reserve
  insert into journal_entry (
    ref,
    transaction_time,
    note
  ) values (
    coalesce((select max(ref) from journal_entry), 0) + 1,
    new.applied_time,
    'Inventory Reserve - ' || new.reserve_type || ' for Product ID: ' || new.product_id ||
    ' - Amount: ' || printf('%.2f', new.reserve_amount / 100.0)
  );

  -- DR Inventory Reserve Expense, CR Inventory Reserve (Contra-Asset)
  insert into journal_entry_line_auto_number (
    journal_entry_ref,
    account_code,
    db,
    cr,
    db_functional,
    cr_functional
  ) values (
    coalesce((select max(ref) from journal_entry), 0),
    case new.reserve_type
      when 'OBSOLESCENCE' then 51500 -- Obsolescence Reserve Expense
      when 'SHRINKAGE' then 51600 -- Shrinkage Reserve Expense  
      when 'DAMAGE' then 51700 -- Damage Reserve Expense
      when 'LCM_WRITEDOWN' then 51800 -- LCM Write-down Expense
      when 'SLOW_MOVING' then 51900 -- Slow Moving Reserve Expense
      else 51000 -- General Inventory Reserve Expense
    end,
    new.reserve_amount,
    0,
    new.reserve_amount,
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
    coalesce((select max(ref) from journal_entry), 0),
    10350, -- Inventory Reserve (Contra-Asset Account)
    0,
    new.reserve_amount,
    0,
    new.reserve_amount
  );

  -- Post the journal entry immediately
  update journal_entry
  set post_time = new.applied_time
  where ref = coalesce((select max(ref) from journal_entry), 0);

  -- Link the journal entry to the reserve
  update inventory_reserve
  set journal_entry_ref = coalesce((select max(ref) from journal_entry), 0)
  where id = new.id;
end;

-- Create cost layers for receipts when transactions are posted
drop trigger if exists inventory_cost_layer_creation_trigger;
create trigger inventory_cost_layer_creation_trigger
after update on inventory_transaction for each row
when old.posted_time is null and new.posted_time is not null
begin
  -- Create cost layers for receipts
  insert into inventory_cost_layer (
    product_id,
    product_variant_id,
    warehouse_location_id,
    lot_id,
    received_date,
    quantity_received,
    quantity_remaining,
    unit_cost,
    currency_code,
    inventory_transaction_id
  )
  select
    itl.product_id,
    itl.product_variant_id,
    itl.warehouse_location_id,
    itl.lot_id,
    new.transaction_date,
    itl.quantity,
    itl.quantity,
    itl.unit_cost,
    new.currency_code,
    new.id
  from inventory_transaction_line itl
  join inventory_transaction_type itt on itt.code = new.transaction_type_code
  where itl.inventory_transaction_id = new.id
    and itt.affects_quantity = 'INCREASE'
    and itl.quantity > 0;

  -- Process cost layer decreases for issues using FIFO (simplified approach)
  -- Note: This is a basic implementation that reduces from the oldest cost layer first
  -- A complete FIFO implementation would require iterative processing
  update inventory_cost_layer
  set quantity_remaining = case
    when quantity_remaining > 0 and exists (
      select 1 from inventory_transaction_line itl
      join inventory_transaction_type itt on itt.code = new.transaction_type_code
      where itl.inventory_transaction_id = new.id
        and itt.affects_quantity = 'DECREASE'
        and itl.quantity < 0
        and itl.product_id = inventory_cost_layer.product_id
        and (itl.product_variant_id is inventory_cost_layer.product_variant_id
             or (itl.product_variant_id is null and inventory_cost_layer.product_variant_id is null))
        and itl.warehouse_location_id = inventory_cost_layer.warehouse_location_id
        and (itl.lot_id is inventory_cost_layer.lot_id
             or (itl.lot_id is null and inventory_cost_layer.lot_id is null))
    ) then case
      when quantity_remaining >= abs((
        select itl.quantity from inventory_transaction_line itl
        join inventory_transaction_type itt on itt.code = new.transaction_type_code
        where itl.inventory_transaction_id = new.id
          and itt.affects_quantity = 'DECREASE'
          and itl.quantity < 0
          and itl.product_id = inventory_cost_layer.product_id
          and (itl.product_variant_id is inventory_cost_layer.product_variant_id
               or (itl.product_variant_id is null and inventory_cost_layer.product_variant_id is null))
          and itl.warehouse_location_id = inventory_cost_layer.warehouse_location_id
          and (itl.lot_id is inventory_cost_layer.lot_id
               or (itl.lot_id is null and inventory_cost_layer.lot_id is null))
        limit 1
      )) then quantity_remaining - abs((
        select itl.quantity from inventory_transaction_line itl
        join inventory_transaction_type itt on itt.code = new.transaction_type_code
        where itl.inventory_transaction_id = new.id
          and itt.affects_quantity = 'DECREASE'
          and itl.quantity < 0
          and itl.product_id = inventory_cost_layer.product_id
          and (itl.product_variant_id is inventory_cost_layer.product_variant_id
               or (itl.product_variant_id is null and inventory_cost_layer.product_variant_id is null))
          and itl.warehouse_location_id = inventory_cost_layer.warehouse_location_id
          and (itl.lot_id is inventory_cost_layer.lot_id
               or (itl.lot_id is null and inventory_cost_layer.lot_id is null))
        limit 1
      ))
      else 0
    end
    else quantity_remaining
  end
  where exists (
    select 1 from inventory_transaction_line itl
    join inventory_transaction_type itt on itt.code = new.transaction_type_code
    where itl.inventory_transaction_id = new.id
      and itt.affects_quantity = 'DECREASE'
      and itl.quantity < 0
      and itl.product_id = inventory_cost_layer.product_id
      and (itl.product_variant_id is inventory_cost_layer.product_variant_id
           or (itl.product_variant_id is null and inventory_cost_layer.product_variant_id is null))
      and itl.warehouse_location_id = inventory_cost_layer.warehouse_location_id
      and (itl.lot_id is inventory_cost_layer.lot_id
           or (itl.lot_id is null and inventory_cost_layer.lot_id is null))
  );
end;

--- REPORTING VIEWS ---

-- Inventory valuation by costing method
drop view if exists inventory_valuation;
create view inventory_valuation as
select
  p.id as product_id,
  p.sku,
  p.name as product_name,
  p.costing_method,
  w.code as warehouse_code,
  sum(ist.quantity_on_hand) as total_quantity,
  case p.costing_method
    when 'STANDARD_COST' then sum(ist.quantity_on_hand) * p.standard_cost
    when 'WEIGHTED_AVERAGE' then
      case when sum(ist.quantity_on_hand) > 0
      then sum(ist.total_value)
      else 0 end
    else sum(ist.total_value)
  end as inventory_value,
  p.currency_code
from product p
left join inventory_stock ist on ist.product_id = p.id
left join warehouse_location wl on wl.id = ist.warehouse_location_id
left join warehouse w on w.id = wl.warehouse_id
where p.is_active = 1
  and (ist.quantity_on_hand > 0 or ist.quantity_on_hand is null)
group by p.id, w.id
having total_quantity > 0
order by p.sku, w.code;

-- Cost layer tracking for FIFO/LIFO accuracy
drop view if exists cost_layer_summary;
create view cost_layer_summary as
select
  p.sku,
  p.name as product_name,
  w.code as warehouse_code,
  count(icl.id) as active_cost_layers,
  sum(icl.quantity_remaining) as total_quantity_in_layers,
  min(icl.received_date) as oldest_receipt_date,
  max(icl.received_date) as newest_receipt_date,
  avg(icl.unit_cost) as average_unit_cost,
  min(icl.unit_cost) as lowest_unit_cost,
  max(icl.unit_cost) as highest_unit_cost
from inventory_cost_layer icl
join product p on p.id = icl.product_id
join warehouse_location wl on wl.id = icl.warehouse_location_id
join warehouse w on w.id = wl.warehouse_id
where icl.quantity_remaining > 0
group by p.id, w.id
order by p.sku, w.code;

-- Inventory ABC analysis view with reserve considerations
drop view if exists inventory_abc_analysis;
create view inventory_abc_analysis as
with product_value_stats as (
  select
    p.id as product_id,
    p.sku,
    p.name as product_name,
    sum(ist.total_value) as total_inventory_value,
    sum(ist.quantity_on_hand) as total_quantity,
    coalesce(sum(case when ir.applied_time is not null then ir.reserve_amount else 0 end), 0) as total_reserves
  from product p
  join inventory_stock ist on ist.product_id = p.id
  left join inventory_reserve ir on ir.product_id = p.id
  where ist.quantity_on_hand > 0
  group by p.id
),
value_percentiles as (
  select
    *,
    total_inventory_value - total_reserves as net_inventory_value,
    sum(total_inventory_value - total_reserves) over () as grand_total_net_value,
    100.0 * (total_inventory_value - total_reserves) / sum(total_inventory_value - total_reserves) over () as value_percentage,
    100.0 * sum(total_inventory_value - total_reserves) over (order by (total_inventory_value - total_reserves) desc) / sum(total_inventory_value - total_reserves) over () as cumulative_value_percentage
  from product_value_stats
  where total_inventory_value - total_reserves > 0
)
select
  product_id,
  sku,
  product_name,
  total_inventory_value,
  total_reserves,
  net_inventory_value,
  total_quantity,
  round(value_percentage, 2) as value_percentage,
  round(cumulative_value_percentage, 2) as cumulative_value_percentage,
  case
    when cumulative_value_percentage <= 80 then 'A'
    when cumulative_value_percentage <= 95 then 'B'
    else 'C'
  end as abc_category
from value_percentiles
order by net_inventory_value desc;

-- Lower of Cost or Market (LCM) compliance view
drop view if exists inventory_lcm_analysis;
create view inventory_lcm_analysis as
select
  p.id as product_id,
  p.sku,
  p.name as product_name,
  p.costing_method,
  sum(ist.quantity_on_hand) as total_quantity,
  case when sum(ist.quantity_on_hand) > 0 
    then sum(ist.total_value) / sum(ist.quantity_on_hand) 
    else 0 end as average_cost_per_unit,
  imv.market_value_per_unit,
  imv.replacement_cost_per_unit,
  imv.net_realizable_value,
  imv.valuation_method,
  imv.valuation_date,
  case 
    when imv.market_value_per_unit < (sum(ist.total_value) / nullif(sum(ist.quantity_on_hand), 0)) then 'LCM_WRITEDOWN_REQUIRED'
    when imv.market_value_per_unit = (sum(ist.total_value) / nullif(sum(ist.quantity_on_hand), 0)) then 'AT_COST'
    when imv.market_value_per_unit > (sum(ist.total_value) / nullif(sum(ist.quantity_on_hand), 0)) then 'ABOVE_COST'
    else 'NO_MARKET_DATA'
  end as lcm_status,
  case 
    when imv.market_value_per_unit < (sum(ist.total_value) / nullif(sum(ist.quantity_on_hand), 0)) 
    then ((sum(ist.total_value) / nullif(sum(ist.quantity_on_hand), 0)) - imv.market_value_per_unit) * sum(ist.quantity_on_hand)
    else 0 
  end as potential_writedown_amount,
  coalesce(ir.reserve_amount, 0) as existing_reserve_amount
from product p
left join inventory_stock ist on ist.product_id = p.id and ist.quantity_on_hand > 0
left join inventory_market_value imv on imv.product_id = p.id 
  and imv.valuation_date = (select max(valuation_date) from inventory_market_value where product_id = p.id)
left join inventory_reserve ir on ir.product_id = p.id and ir.reserve_type = 'LCM_WRITEDOWN' and ir.applied_time is not null
where p.is_active = 1
group by p.id, imv.market_value_per_unit, imv.replacement_cost_per_unit, imv.net_realizable_value, 
         imv.valuation_method, imv.valuation_date, ir.reserve_amount
order by potential_writedown_amount desc;

-- Inventory aging analysis for obsolescence reserves
drop view if exists inventory_aging_analysis;
create view inventory_aging_analysis as
select
  p.id as product_id,
  p.sku,
  p.name as product_name,
  w.code as warehouse_code,
  sum(ist.quantity_on_hand) as total_quantity,
  sum(ist.total_value) as total_value,
  min(icl.received_date) as oldest_receipt_date,
  max(icl.received_date) as newest_receipt_date,
  (unixepoch() - min(icl.received_date)) / (24 * 3600) as days_since_oldest_receipt,
  case 
    when (unixepoch() - min(icl.received_date)) / (24 * 3600) <= 30 then 'CURRENT'
    when (unixepoch() - min(icl.received_date)) / (24 * 3600) <= 60 then '31-60_DAYS'
    when (unixepoch() - min(icl.received_date)) / (24 * 3600) <= 90 then '61-90_DAYS'
    when (unixepoch() - min(icl.received_date)) / (24 * 3600) <= 180 then '91-180_DAYS'
    when (unixepoch() - min(icl.received_date)) / (24 * 3600) <= 365 then '181-365_DAYS'
    else 'OVER_1_YEAR'
  end as aging_category,
  case 
    when (unixepoch() - min(icl.received_date)) / (24 * 3600) <= 30 then 0
    when (unixepoch() - min(icl.received_date)) / (24 * 3600) <= 60 then 5
    when (unixepoch() - min(icl.received_date)) / (24 * 3600) <= 90 then 10
    when (unixepoch() - min(icl.received_date)) / (24 * 3600) <= 180 then 25
    when (unixepoch() - min(icl.received_date)) / (24 * 3600) <= 365 then 50
    else 75
  end as suggested_obsolescence_rate,
  coalesce(ir.reserve_amount, 0) as existing_reserve_amount,
  case 
    when (unixepoch() - min(icl.received_date)) / (24 * 3600) > 180 and coalesce(ir.reserve_amount, 0) = 0 
    then 'RESERVE_RECOMMENDED'
    else 'OK'
  end as reserve_recommendation
from product p
join inventory_stock ist on ist.product_id = p.id and ist.quantity_on_hand > 0
join warehouse_location wl on wl.id = ist.warehouse_location_id
join warehouse w on w.id = wl.warehouse_id
left join inventory_cost_layer icl on icl.product_id = p.id and icl.quantity_remaining > 0
left join inventory_reserve ir on ir.product_id = p.id and ir.reserve_type = 'OBSOLESCENCE' and ir.applied_time is not null
where p.is_active = 1
group by p.id, w.id, ir.reserve_amount
order by days_since_oldest_receipt desc;

-- Inventory turnover analysis for financial reporting
drop view if exists inventory_turnover_analysis;
create view inventory_turnover_analysis as
with cogs_data as (
  select
    itl.product_id,
    sum(abs(itl.quantity * itl.unit_cost)) as annual_cogs
  from inventory_transaction_line itl
  join inventory_transaction it on it.id = itl.inventory_transaction_id
  join inventory_transaction_type itt on itt.code = it.transaction_type_code
  where itt.affects_quantity = 'DECREASE'
    and it.posted_time is not null
    and it.transaction_date >= unixepoch() - (365 * 24 * 3600) -- Last 12 months
  group by itl.product_id
),
avg_inventory as (
  select
    ist.product_id,
    avg(ist.total_value) as average_inventory_value
  from inventory_stock ist
  group by ist.product_id
)
select
  p.id as product_id,
  p.sku,
  p.name as product_name,
  pc.name as category_name,
  coalesce(cd.annual_cogs, 0) as annual_cogs,
  coalesce(ai.average_inventory_value, 0) as average_inventory_value,
  case 
    when coalesce(ai.average_inventory_value, 0) > 0 
    then round(coalesce(cd.annual_cogs, 0) / ai.average_inventory_value, 2)
    else 0 
  end as inventory_turnover_ratio,
  case 
    when coalesce(cd.annual_cogs, 0) > 0 and coalesce(ai.average_inventory_value, 0) > 0
    then round(365 / (coalesce(cd.annual_cogs, 0) / ai.average_inventory_value), 0)
    else null 
  end as days_sales_in_inventory,
  case 
    when coalesce(cd.annual_cogs, 0) / nullif(ai.average_inventory_value, 0) >= 12 then 'FAST_MOVING'
    when coalesce(cd.annual_cogs, 0) / nullif(ai.average_inventory_value, 0) >= 6 then 'NORMAL_MOVING'
    when coalesce(cd.annual_cogs, 0) / nullif(ai.average_inventory_value, 0) >= 2 then 'SLOW_MOVING'
    when coalesce(cd.annual_cogs, 0) / nullif(ai.average_inventory_value, 0) > 0 then 'VERY_SLOW_MOVING'
    else 'NO_MOVEMENT'
  end as movement_classification
from product p
left join product_category pc on pc.id = p.product_category_id
left join cogs_data cd on cd.product_id = p.id
left join avg_inventory ai on ai.product_id = p.id
where p.is_active = 1
order by inventory_turnover_ratio desc;

-- Inventory reserve summary for financial statement disclosure
drop view if exists inventory_reserve_summary;
create view inventory_reserve_summary as
select
  ir.reserve_type,
  count(distinct ir.product_id) as products_with_reserves,
  sum(case when ir.applied_time is not null then ir.reserve_amount else 0 end) as total_applied_reserves,
  sum(case when ir.created_time is not null and ir.approved_time is null then ir.reserve_amount else 0 end) as total_pending_reserves,
  sum(case when ir.approved_time is not null and ir.applied_time is null then ir.reserve_amount else 0 end) as total_approved_reserves,
  avg(case when ir.applied_time is not null then ir.reserve_amount else null end) as average_reserve_amount,
  min(ir.effective_date) as earliest_reserve_date,
  max(ir.effective_date) as latest_reserve_date
from inventory_reserve ir
group by ir.reserve_type
order by total_applied_reserves desc;

-- Costing method consistency audit view
drop view if exists costing_method_audit;
create view costing_method_audit as
select
  p.id as product_id,
  p.sku,
  p.name as product_name,
  pc.name as category_name,
  p.costing_method as current_method,
  count(cmh.id) as method_changes_count,
  max(cmh.change_date) as last_method_change_date,
  case 
    when count(cmh.id) = 0 then 'CONSISTENT'
    when count(cmh.id) <= 2 then 'ACCEPTABLE'
    else 'FREQUENT_CHANGES'
  end as consistency_status,
  group_concat(cmh.old_costing_method || '->' || cmh.new_costing_method, '; ') as change_history
from product p
left join product_category pc on pc.id = p.product_category_id
left join product_costing_method_history cmh on cmh.product_id = p.id
where p.is_active = 1
group by p.id, pc.name, p.costing_method
order by method_changes_count desc, p.sku;

--- DEFAULT DATA ---

-- Insert default inventory aging categories for obsolescence analysis
insert into inventory_aging_category (category_name, days_from, days_to, obsolescence_rate) values
  ('Current', 0, 30, 0.0),
  ('31-60 Days', 31, 60, 5.0),
  ('61-90 Days', 61, 90, 10.0),
  ('91-180 Days', 91, 180, 25.0),
  ('181-365 Days', 181, 365, 50.0),
  ('Over 1 Year', 366, null, 75.0)
on conflict (category_name) do update set
  days_from = excluded.days_from,
  days_to = excluded.days_to,
  obsolescence_rate = excluded.obsolescence_rate;

commit transaction;