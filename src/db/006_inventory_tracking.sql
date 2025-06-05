/*
SQLite 3.49.0

MIGRATION 006: INVENTORY TRACKING
=================================

Implements inventory tracking with lot and serial number management:

DEPENDS ON: 004_product_management.sql, 005_warehouse_management.sql

TRACKING FEATURES:
• Real-time stock levels by location
• Lot/batch tracking with expiration dates
• Serial number tracking for individual items
• Reserved quantity management
• Quantity availability calculations

This module provides the core inventory tracking capabilities including
lot and serial number management for complete traceability.
*/

pragma journal_mode = wal;
pragma foreign_keys = on;

begin exclusive transaction;

--- INVENTORY TRACKING AND STOCK LEVELS ---

create table if not exists inventory_lot (
  id integer primary key,
  product_id integer not null,
  lot_number text not null,
  expiration_date integer,
  received_date integer not null,
  vendor_lot_number text,
  is_active integer not null default 1 check (is_active in (0, 1)),
  foreign key (product_id) references product (id) on update restrict on delete restrict,
  unique (product_id, lot_number)
) strict;

create index if not exists inventory_lot_product_id_index on inventory_lot (product_id);
create index if not exists inventory_lot_lot_number_index on inventory_lot (lot_number);
create index if not exists inventory_lot_expiration_date_index on inventory_lot (expiration_date);

create table if not exists inventory_serial (
  id integer primary key,
  product_id integer not null,
  serial_number text not null,
  lot_id integer,
  warehouse_location_id integer,
  -- Timestamp-based status tracking instead of text status
  received_time integer not null,
  reserved_time integer,
  sold_time integer,
  damaged_time integer,
  returned_time integer,
  is_active integer not null default 1 check (is_active in (0, 1)),
  foreign key (product_id) references product (id) on update restrict on delete restrict,
  foreign key (lot_id) references inventory_lot (id) on update restrict on delete restrict,
  foreign key (warehouse_location_id) references warehouse_location (id) on update restrict on delete restrict,
  unique (product_id, serial_number)
) strict;

create index if not exists inventory_serial_product_id_index on inventory_serial (product_id);
create index if not exists inventory_serial_serial_number_index on inventory_serial (serial_number);
-- Indexes for timestamp-based status tracking
create index if not exists inventory_serial_received_time_index on inventory_serial (received_time);
create index if not exists inventory_serial_reserved_time_index on inventory_serial (reserved_time);
create index if not exists inventory_serial_sold_time_index on inventory_serial (sold_time);

-- Main inventory stock table - tracks quantity and value by location
create table if not exists inventory_stock (
  id integer primary key,
  product_id integer not null,
  product_variant_id integer,
  warehouse_location_id integer not null,
  lot_id integer,
  quantity_on_hand integer not null default 0 check (quantity_on_hand >= 0),
  quantity_reserved integer not null default 0 check (quantity_reserved >= 0),
  quantity_available integer generated always as (quantity_on_hand - quantity_reserved) stored,
  unit_cost integer not null default 0 check (unit_cost >= 0),
  total_value integer generated always as (quantity_on_hand * unit_cost) stored,
  last_movement_time integer not null,
  foreign key (product_id) references product (id) on update restrict on delete restrict,
  foreign key (product_variant_id) references product_variant (id) on update restrict on delete restrict,
  foreign key (warehouse_location_id) references warehouse_location (id) on update restrict on delete restrict,
  foreign key (lot_id) references inventory_lot (id) on update restrict on delete restrict,
  unique (product_id, product_variant_id, warehouse_location_id, lot_id)
) strict;

-- Handle NULL values in unique constraint with partial indexes
create unique index if not exists inventory_stock_unique_all_null on inventory_stock
  (product_id, warehouse_location_id)
  where product_variant_id is null and lot_id is null;

create unique index if not exists inventory_stock_unique_variant_null on inventory_stock
  (product_id, warehouse_location_id, lot_id)
  where product_variant_id is null and lot_id is not null;

create unique index if not exists inventory_stock_unique_lot_null on inventory_stock
  (product_id, warehouse_location_id, product_variant_id)
  where product_variant_id is not null and lot_id is null;

create unique index if not exists inventory_stock_unique_none_null on inventory_stock
  (product_id, warehouse_location_id, product_variant_id, lot_id)
  where product_variant_id is not null and lot_id is not null;

create index if not exists inventory_stock_product_id_index on inventory_stock (product_id);
create index if not exists inventory_stock_warehouse_location_id_index on inventory_stock (warehouse_location_id);
create index if not exists inventory_stock_quantity_available_index on inventory_stock (quantity_available);

--- VALIDATION TRIGGERS ---

-- Validate reserved quantity constraints
drop trigger if exists inventory_stock_reserved_validation_trigger;
create trigger inventory_stock_reserved_validation_trigger
before update on inventory_stock for each row
when new.quantity_reserved > new.quantity_on_hand
begin
  select raise(abort, 'Reserved quantity cannot exceed quantity on hand');
end;

--- REPORTING VIEWS ---

-- Real-time inventory levels by product and location
drop view if exists inventory_summary;
create view inventory_summary as
select
  p.id as product_id,
  p.sku,
  p.name as product_name,
  pc.name as category_name,
  w.code as warehouse_code,
  w.name as warehouse_name,
  wl.code as location_code,
  wl.name as location_name,
  coalesce(sum(ist.quantity_on_hand), 0) as total_quantity_on_hand,
  coalesce(sum(ist.quantity_reserved), 0) as total_quantity_reserved,
  coalesce(sum(ist.quantity_available), 0) as total_quantity_available,
  coalesce(sum(ist.total_value), 0) as total_inventory_value,
  p.minimum_stock_level,
  p.reorder_point,
  case
    when coalesce(sum(ist.quantity_available), 0) <= 0 then 'OUT_OF_STOCK'
    when coalesce(sum(ist.quantity_available), 0) <= p.minimum_stock_level then 'CRITICAL_LOW'
    when coalesce(sum(ist.quantity_available), 0) <= p.reorder_point then 'REORDER'
    else 'ADEQUATE'
  end as stock_status,
  case p.costing_method
    when 'WEIGHTED_AVERAGE' then
      case when sum(ist.quantity_on_hand) > 0
      then sum(ist.total_value) / sum(ist.quantity_on_hand)
      else p.standard_cost end
    else p.standard_cost
  end as current_unit_cost
from product p
left join product_category pc on pc.id = p.product_category_id
cross join warehouse w
cross join warehouse_location wl on wl.warehouse_id = w.id
left join inventory_stock ist on ist.product_id = p.id
  and ist.warehouse_location_id = wl.id
where p.is_active = 1
  and w.is_active = 1
  and wl.is_active = 1
group by p.id, w.id, wl.id
order by p.sku, w.code, wl.code;

-- Low stock and reorder alerts
drop view if exists inventory_alerts;
create view inventory_alerts as
select
  p.id as product_id,
  p.sku,
  p.name as product_name,
  w.code as warehouse_code,
  sum(ist.quantity_available) as available_quantity,
  p.minimum_stock_level,
  p.reorder_point,
  p.reorder_quantity,
  case
    when sum(ist.quantity_available) <= 0 then 'OUT_OF_STOCK'
    when sum(ist.quantity_available) <= p.minimum_stock_level then 'CRITICAL_LOW'
    when sum(ist.quantity_available) <= p.reorder_point then 'REORDER_NEEDED'
  end as alert_type,
  p.reorder_quantity - sum(ist.quantity_available) as suggested_order_quantity
from product p
left join inventory_stock ist on ist.product_id = p.id
left join warehouse_location wl on wl.id = ist.warehouse_location_id
left join warehouse w on w.id = wl.warehouse_id
where p.is_active = 1
  and w.is_active = 1
group by p.id, w.id
having sum(ist.quantity_available) <= p.reorder_point
order by alert_type, p.sku;

-- Lot expiration tracking
drop view if exists lot_expiration_alert;
create view lot_expiration_alert as
select
  p.id as product_id,
  p.sku,
  p.name as product_name,
  il.lot_number,
  il.expiration_date,
  w.code as warehouse_code,
  sum(ist.quantity_on_hand) as quantity_on_hand,
  case
    when il.expiration_date <= unixepoch() then 'EXPIRED'
    when il.expiration_date <= unixepoch() + (7 * 24 * 3600) then 'EXPIRES_THIS_WEEK'
    when il.expiration_date <= unixepoch() + (30 * 24 * 3600) then 'EXPIRES_THIS_MONTH'
    else 'OK'
  end as expiration_status,
  (il.expiration_date - unixepoch()) / (24 * 3600) as days_until_expiry
from inventory_lot il
join product p on p.id = il.product_id
join inventory_stock ist on ist.lot_id = il.id
join warehouse_location wl on wl.id = ist.warehouse_location_id
join warehouse w on w.id = wl.warehouse_id
where il.expiration_date is not null
  and ist.quantity_on_hand > 0
  and il.is_active = 1
group by p.id, il.id, w.id
order by il.expiration_date;

commit transaction;