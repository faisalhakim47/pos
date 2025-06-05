/*
SQLite 3.49.0

MIGRATION 005: WAREHOUSE MANAGEMENT
===================================

Implements warehouse and location management with physical inventory capabilities:

DEPENDS ON: 004_product_management.sql

WAREHOUSE FEATURES:
• Multi-warehouse support with location hierarchy
• Warehouse location management (zones, aisles, shelves, bins)
• Physical inventory counting and cycle counting
• Warehouse-specific configurations and constraints

This module provides the physical infrastructure for inventory storage
and tracking across multiple locations.
*/

pragma journal_mode = wal;
pragma foreign_keys = on;

begin exclusive transaction;

--- WAREHOUSE AND LOCATION MANAGEMENT ---

create table if not exists warehouse (
  id integer primary key,
  code text not null unique,
  name text not null,
  address text,
  contact_person text,
  phone text,
  email text,
  is_default integer not null default 0 check (is_default in (0, 1)),
  is_active integer not null default 1 check (is_active in (0, 1)),
  created_time integer not null
) strict;

create index if not exists warehouse_code_index on warehouse (code);

-- Ensure only one default warehouse
drop trigger if exists warehouse_default_validation_trigger;
create trigger warehouse_default_validation_trigger
before update on warehouse for each row
when new.is_default = 1 and old.is_default = 0
begin
  update warehouse set is_default = 0 where is_default = 1 and id != new.id;
end;

drop trigger if exists warehouse_default_insert_validation_trigger;
create trigger warehouse_default_insert_validation_trigger
before insert on warehouse for each row
when new.is_default = 1
begin
  update warehouse set is_default = 0 where is_default = 1;
end;

create table if not exists warehouse_location (
  id integer primary key,
  warehouse_id integer not null,
  code text not null,
  name text not null,
  zone text,
  aisle text,
  shelf text,
  bin text,
  is_active integer not null default 1 check (is_active in (0, 1)),
  foreign key (warehouse_id) references warehouse (id) on update restrict on delete restrict,
  unique (warehouse_id, code)
) strict;

create index if not exists warehouse_location_warehouse_id_index on warehouse_location (warehouse_id);
create index if not exists warehouse_location_code_index on warehouse_location (code);

--- PHYSICAL INVENTORY AND CYCLE COUNTING ---

create table if not exists physical_inventory (
  id integer primary key,
  count_number text not null unique,
  count_date integer not null,
  warehouse_id integer not null,
  count_type text not null check (count_type in ('FULL', 'CYCLE', 'SPOT')),
  -- Timestamp-based status tracking instead of text status
  planned_time integer not null,
  started_time integer,
  completed_time integer,
  cancelled_time integer,
  planned_by_user text not null,
  started_by_user text,
  completed_by_user text,
  notes text,
  foreign key (warehouse_id) references warehouse (id) on update restrict on delete restrict
) strict;

create index if not exists physical_inventory_count_number_index on physical_inventory (count_number);
create index if not exists physical_inventory_warehouse_id_index on physical_inventory (warehouse_id);
-- Indexes for timestamp-based status tracking
create index if not exists physical_inventory_planned_time_index on physical_inventory (planned_time);
create index if not exists physical_inventory_started_time_index on physical_inventory (started_time);
create index if not exists physical_inventory_completed_time_index on physical_inventory (completed_time);
create index if not exists physical_inventory_cancelled_time_index on physical_inventory (cancelled_time);

create table if not exists physical_inventory_count (
  id integer primary key,
  physical_inventory_id integer not null,
  product_id integer not null,
  product_variant_id integer,
  warehouse_location_id integer not null,
  lot_id integer,
  system_quantity integer not null default 0,
  counted_quantity integer,
  variance_quantity integer generated always as (coalesce(counted_quantity, 0) - system_quantity) stored,
  unit_cost integer not null default 0,
  variance_value integer generated always as (variance_quantity * unit_cost) stored,
  -- Timestamp-based status tracking instead of text status
  pending_time integer not null, -- when count was created/pending
  counted_time integer,
  verified_time integer,
  adjusted_time integer,
  counted_by_user text,
  verified_by_user text,
  notes text,
  foreign key (physical_inventory_id) references physical_inventory (id) on update restrict on delete restrict,
  foreign key (product_id) references product (id) on update restrict on delete restrict,
  foreign key (product_variant_id) references product_variant (id) on update restrict on delete restrict,
  foreign key (warehouse_location_id) references warehouse_location (id) on update restrict on delete restrict
) strict;

create index if not exists physical_inventory_count_physical_inventory_id_index on physical_inventory_count (physical_inventory_id);
create index if not exists physical_inventory_count_product_id_index on physical_inventory_count (product_id);
create index if not exists physical_inventory_count_variance_quantity_index on physical_inventory_count (variance_quantity);

--- DEFAULT DATA ---

-- Insert default warehouse
insert into warehouse (code, name, address, is_default, created_time) values
  ('MAIN', 'Main Warehouse', 'Main facility warehouse', 1, unixepoch())
on conflict (code) do update set
  name = excluded.name,
  address = excluded.address,
  is_default = excluded.is_default;

-- Insert default warehouse locations
insert into warehouse_location (warehouse_id, code, name, zone, aisle, shelf, bin)
select
  w.id,
  loc_data.code,
  loc_data.name,
  loc_data.zone,
  loc_data.aisle,
  loc_data.shelf,
  loc_data.bin
from warehouse w
cross join (
  select 'REC' as code, 'Receiving' as name, 'RECEIVING' as zone, null as aisle, null as shelf, null as bin
  union all select 'SHP', 'Shipping', 'SHIPPING', null, null, null
  union all select 'A01-01-01', 'Zone A, Aisle 1, Shelf 1, Bin 1', 'A', '01', '01', '01'
  union all select 'A01-01-02', 'Zone A, Aisle 1, Shelf 1, Bin 2', 'A', '01', '01', '02'
  union all select 'A01-02-01', 'Zone A, Aisle 1, Shelf 2, Bin 1', 'A', '01', '02', '01'
  union all select 'A01-02-02', 'Zone A, Aisle 1, Shelf 2, Bin 2', 'A', '01', '02', '02'
  union all select 'QC', 'Quality Control', 'QC', null, null, null
  union all select 'DMG', 'Damaged Goods', 'DAMAGED', null, null, null
) as loc_data
where w.code = 'MAIN'
on conflict (warehouse_id, code) do update set
  name = excluded.name,
  zone = excluded.zone,
  aisle = excluded.aisle,
  shelf = excluded.shelf,
  bin = excluded.bin;

commit transaction;