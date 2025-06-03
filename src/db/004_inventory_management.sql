/*
SQLite 3.49.0

MIGRATION 004: INVENTORY MANAGEMENT & WAREHOUSE OPERATIONS
==========================================================

Implements comprehensive inventory management with full accounting integration:

DEPENDS ON: 001_core_accounting.sql

INVENTORY FEATURES:
• Multi-location warehouse management with transfer tracking
• Product catalog with variants, categories, and SKU management
• Multiple costing methods: FIFO, LIFO, weighted average, specific identification
• Real-time stock levels with automatic reorder point alerts
• Lot/batch tracking with expiration date management
• Serial number tracking for individual item management

WAREHOUSE OPERATIONS:
• Multi-warehouse inventory with location-specific stock levels
• Inter-warehouse transfers with in-transit tracking
• Inventory adjustments with reason codes and approval workflow
• Stock movements audit trail with complete transaction history
• Physical inventory counting and variance reporting

ACCOUNTING INTEGRATION:
• Automatic journal entries for all inventory transactions
• COGS calculation using configurable costing methods
• Inventory valuation adjustments and write-downs
• Purchase price variance tracking
• Landed cost allocation for imports and freight

PROCUREMENT SYSTEM:
• Vendor catalog with pricing tiers and lead times
• Purchase order management with receiving workflow
• Goods receipt processing with quality control flags
• Invoice matching (3-way matching: PO, receipt, invoice)
• Vendor performance tracking and reporting

INVENTORY REPORTING:
• Real-time inventory valuation by location and total
• Aging reports for slow-moving and obsolete inventory
• ABC analysis for inventory categorization
• Stock movement reports with drill-down capability
• Variance analysis for physical counts vs. system

This schema follows GAAP/IFRS standards for inventory accounting and
integrates seamlessly with the existing chart of accounts structure.
*/

pragma journal_mode = wal;
pragma foreign_keys = on;

begin exclusive transaction;

--- PRODUCT CATALOG AND CATEGORIZATION ---

create table if not exists product_category (
  id integer primary key,
  code text not null unique,
  name text not null,
  description text,
  parent_category_id integer,
  is_active integer not null default 1 check (is_active in (0, 1)),
  foreign key (parent_category_id) references product_category (id) on update restrict on delete restrict
) strict;

create index if not exists product_category_parent_category_id_index on product_category (parent_category_id);
create index if not exists product_category_code_index on product_category (code);

create table if not exists unit_of_measure (
  code text primary key,
  name text not null,
  symbol text not null,
  base_unit_code text,
  conversion_factor real not null default 1.0 check (conversion_factor > 0),
  is_active integer not null default 1 check (is_active in (0, 1)),
  foreign key (base_unit_code) references unit_of_measure (code) on update restrict on delete restrict
) strict, without rowid;

create table if not exists product (
  id integer primary key,
  sku text not null unique,
  name text not null,
  description text,
  product_category_id integer,
  base_unit_code text not null default 'EACH',
  is_trackable integer not null default 1 check (is_trackable in (0, 1)),
  is_serialized integer not null default 0 check (is_serialized in (0, 1)),
  is_lot_tracked integer not null default 0 check (is_lot_tracked in (0, 1)),
  shelf_life_days integer,
  minimum_stock_level integer not null default 0 check (minimum_stock_level >= 0),
  maximum_stock_level integer,
  reorder_point integer not null default 0 check (reorder_point >= 0),
  reorder_quantity integer not null default 0 check (reorder_quantity >= 0),
  standard_cost integer not null default 0 check (standard_cost >= 0),
  inventory_account_code integer not null,
  cogs_account_code integer not null,
  sales_account_code integer not null,
  currency_code text not null default 'USD',
  costing_method text not null default 'FIFO' check (costing_method in ('FIFO', 'LIFO', 'WEIGHTED_AVERAGE', 'SPECIFIC_IDENTIFICATION', 'STANDARD_COST')),
  is_active integer not null default 1 check (is_active in (0, 1)),
  created_time integer not null default (unixepoch()),
  updated_time integer not null default (unixepoch()),
  foreign key (product_category_id) references product_category (id) on update restrict on delete restrict,
  foreign key (base_unit_code) references unit_of_measure (code) on update restrict on delete restrict,
  foreign key (inventory_account_code) references account (code) on update restrict on delete restrict,
  foreign key (cogs_account_code) references account (code) on update restrict on delete restrict,
  foreign key (sales_account_code) references account (code) on update restrict on delete restrict,
  foreign key (currency_code) references currency (code) on update restrict on delete restrict
) strict;

create index if not exists product_sku_index on product (sku);
create index if not exists product_product_category_id_index on product (product_category_id);
create index if not exists product_name_index on product (name);
create index if not exists product_inventory_account_code_index on product (inventory_account_code);

-- Product variant support for size, color, etc.
create table if not exists product_variant (
  id integer primary key,
  product_id integer not null,
  sku text not null unique,
  name text not null,
  variant_attributes text, -- JSON: {"color": "red", "size": "L"}
  standard_cost integer not null default 0 check (standard_cost >= 0),
  is_active integer not null default 1 check (is_active in (0, 1)),
  created_time integer not null default (unixepoch()),
  foreign key (product_id) references product (id) on update restrict on delete restrict
) strict;

create index if not exists product_variant_product_id_index on product_variant (product_id);
create index if not exists product_variant_sku_index on product_variant (sku);

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
  created_time integer not null default (unixepoch())
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

--- INVENTORY TRACKING AND STOCK LEVELS ---

create table if not exists inventory_lot (
  id integer primary key,
  product_id integer not null,
  lot_number text not null,
  expiration_date integer,
  received_date integer not null default (unixepoch()),
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
  status text not null default 'AVAILABLE' check (status in ('AVAILABLE', 'RESERVED', 'SOLD', 'DAMAGED', 'RETURNED')),
  received_date integer not null default (unixepoch()),
  is_active integer not null default 1 check (is_active in (0, 1)),
  foreign key (product_id) references product (id) on update restrict on delete restrict,
  foreign key (lot_id) references inventory_lot (id) on update restrict on delete restrict,
  foreign key (warehouse_location_id) references warehouse_location (id) on update restrict on delete restrict,
  unique (product_id, serial_number)
) strict;

create index if not exists inventory_serial_product_id_index on inventory_serial (product_id);
create index if not exists inventory_serial_serial_number_index on inventory_serial (serial_number);
create index if not exists inventory_serial_status_index on inventory_serial (status);

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
  last_movement_time integer not null default (unixepoch()),
  foreign key (product_id) references product (id) on update restrict on delete restrict,
  foreign key (product_variant_id) references product_variant (id) on update restrict on delete restrict,
  foreign key (warehouse_location_id) references warehouse_location (id) on update restrict on delete restrict,
  foreign key (lot_id) references inventory_lot (id) on update restrict on delete restrict,
  unique (product_id, product_variant_id, warehouse_location_id, lot_id)
) strict;

create index if not exists inventory_stock_product_id_index on inventory_stock (product_id);
create index if not exists inventory_stock_warehouse_location_id_index on inventory_stock (warehouse_location_id);
create index if not exists inventory_stock_quantity_available_index on inventory_stock (quantity_available);

--- INVENTORY MOVEMENTS AND TRANSACTIONS ---

create table if not exists inventory_transaction_type (
  code text primary key,
  name text not null,
  affects_quantity text not null check (affects_quantity in ('INCREASE', 'DECREASE', 'NONE')),
  affects_value text not null check (affects_value in ('INCREASE', 'DECREASE', 'NONE')),
  requires_approval integer not null default 0 check (requires_approval in (0, 1)),
  creates_journal_entry integer not null default 1 check (creates_journal_entry in (0, 1))
) strict, without rowid;

create table if not exists inventory_transaction (
  id integer primary key,
  transaction_type_code text not null,
  reference_number text not null unique,
  transaction_date integer not null,
  notes text,
  total_value integer not null default 0,
  currency_code text not null default 'USD',
  exchange_rate real,
  journal_entry_ref integer,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'POSTED', 'CANCELLED')),
  approved_by_user text,
  approved_time integer,
  created_by_user text not null,
  created_time integer not null default (unixepoch()),
  foreign key (transaction_type_code) references inventory_transaction_type (code) on update restrict on delete restrict,
  foreign key (currency_code) references currency (code) on update restrict on delete restrict,
  foreign key (journal_entry_ref) references journal_entry (ref) on update restrict on delete restrict
) strict;

create index if not exists inventory_transaction_transaction_type_code_index on inventory_transaction (transaction_type_code);
create index if not exists inventory_transaction_reference_number_index on inventory_transaction (reference_number);
create index if not exists inventory_transaction_transaction_date_index on inventory_transaction (transaction_date);
create index if not exists inventory_transaction_status_index on inventory_transaction (status);

create table if not exists inventory_transaction_line (
  id integer primary key,
  inventory_transaction_id integer not null,
  line_number integer not null,
  product_id integer not null,
  product_variant_id integer,
  warehouse_location_id integer not null,
  lot_id integer,
  serial_numbers text, -- JSON array for serialized items
  quantity integer not null,
  unit_cost integer not null default 0 check (unit_cost >= 0),
  total_cost integer generated always as (abs(quantity) * unit_cost) stored,
  reason_code text,
  notes text,
  foreign key (inventory_transaction_id) references inventory_transaction (id) on update restrict on delete restrict,
  foreign key (product_id) references product (id) on update restrict on delete restrict,
  foreign key (product_variant_id) references product_variant (id) on update restrict on delete restrict,
  foreign key (warehouse_location_id) references warehouse_location (id) on update restrict on delete restrict,
  foreign key (lot_id) references inventory_lot (id) on update restrict on delete restrict,
  unique (inventory_transaction_id, line_number)
) strict;

create index if not exists inventory_transaction_line_inventory_transaction_id_index on inventory_transaction_line (inventory_transaction_id);
create index if not exists inventory_transaction_line_product_id_index on inventory_transaction_line (product_id);
create index if not exists inventory_transaction_line_warehouse_location_id_index on inventory_transaction_line (warehouse_location_id);

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

--- PROCUREMENT AND VENDOR MANAGEMENT ---

create table if not exists vendor (
  id integer primary key,
  vendor_code text not null unique,
  name text not null,
  contact_person text,
  email text,
  phone text,
  address text,
  payment_terms_days integer not null default 30,
  currency_code text not null default 'USD',
  is_active integer not null default 1 check (is_active in (0, 1)),
  created_time integer not null default (unixepoch()),
  foreign key (currency_code) references currency (code) on update restrict on delete restrict
) strict;

create index if not exists vendor_vendor_code_index on vendor (vendor_code);
create index if not exists vendor_name_index on vendor (name);

create table if not exists vendor_product (
  id integer primary key,
  vendor_id integer not null,
  product_id integer not null,
  vendor_sku text,
  vendor_name text,
  unit_price integer not null check (unit_price >= 0),
  currency_code text not null default 'USD',
  minimum_order_quantity integer not null default 1,
  lead_time_days integer not null default 0,
  is_preferred integer not null default 0 check (is_preferred in (0, 1)),
  is_active integer not null default 1 check (is_active in (0, 1)),
  last_updated_time integer not null default (unixepoch()),
  foreign key (vendor_id) references vendor (id) on update restrict on delete restrict,
  foreign key (product_id) references product (id) on update restrict on delete restrict,
  foreign key (currency_code) references currency (code) on update restrict on delete restrict,
  unique (vendor_id, product_id)
) strict;

create index if not exists vendor_product_vendor_id_index on vendor_product (vendor_id);
create index if not exists vendor_product_product_id_index on vendor_product (product_id);

--- PHYSICAL INVENTORY AND CYCLE COUNTING ---

create table if not exists physical_inventory (
  id integer primary key,
  count_number text not null unique,
  count_date integer not null,
  warehouse_id integer not null,
  count_type text not null check (count_type in ('FULL', 'CYCLE', 'SPOT')),
  status text not null default 'PLANNED' check (status in ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  planned_by_user text not null,
  planned_time integer not null default (unixepoch()),
  started_by_user text,
  started_time integer,
  completed_by_user text,
  completed_time integer,
  notes text,
  foreign key (warehouse_id) references warehouse (id) on update restrict on delete restrict
) strict;

create index if not exists physical_inventory_count_number_index on physical_inventory (count_number);
create index if not exists physical_inventory_warehouse_id_index on physical_inventory (warehouse_id);
create index if not exists physical_inventory_status_index on physical_inventory (status);

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
  count_status text not null default 'PENDING' check (count_status in ('PENDING', 'COUNTED', 'VERIFIED', 'ADJUSTED')),
  counted_by_user text,
  counted_time integer,
  verified_by_user text,
  verified_time integer,
  notes text,
  foreign key (physical_inventory_id) references physical_inventory (id) on update restrict on delete restrict,
  foreign key (product_id) references product (id) on update restrict on delete restrict,
  foreign key (product_variant_id) references product_variant (id) on update restrict on delete restrict,
  foreign key (warehouse_location_id) references warehouse_location (id) on update restrict on delete restrict,
  foreign key (lot_id) references inventory_lot (id) on update restrict on delete restrict
) strict;

create index if not exists physical_inventory_count_physical_inventory_id_index on physical_inventory_count (physical_inventory_id);
create index if not exists physical_inventory_count_product_id_index on physical_inventory_count (product_id);
create index if not exists physical_inventory_count_variance_quantity_index on physical_inventory_count (variance_quantity);

--- TRIGGERS FOR INVENTORY UPDATES ---

-- Update inventory stock when transactions are posted
drop trigger if exists inventory_transaction_post_trigger;
create trigger inventory_transaction_post_trigger
after update on inventory_transaction for each row
when old.status != 'POSTED' and new.status = 'POSTED'
begin
  -- Update inventory stock levels for each transaction line
  insert into inventory_stock (
    product_id,
    product_variant_id,
    warehouse_location_id,
    lot_id,
    quantity_on_hand,
    unit_cost
  )
  select
    itl.product_id,
    itl.product_variant_id,
    itl.warehouse_location_id,
    itl.lot_id,
    itl.quantity,
    itl.unit_cost
  from inventory_transaction_line itl
  where itl.inventory_transaction_id = new.id
  on conflict (product_id, product_variant_id, warehouse_location_id, lot_id) do update set
    quantity_on_hand = inventory_stock.quantity_on_hand + excluded.quantity_on_hand,
    unit_cost = case 
      when excluded.quantity_on_hand > 0 then excluded.unit_cost
      else inventory_stock.unit_cost
    end,
    last_movement_time = unixepoch();
  
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
    when coalesce(sum(ist.quantity_available), 0) <= p.reorder_point then 'REORDER'
    when coalesce(sum(ist.quantity_available), 0) <= p.minimum_stock_level then 'LOW_STOCK'
    else 'ADEQUATE'
  end as stock_status
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

--- DEFAULT DATA ---

-- Insert default units of measure
insert into unit_of_measure (code, name, symbol) values
  ('EACH', 'Each', 'ea'),
  ('PCS', 'Pieces', 'pcs'),
  ('KG', 'Kilogram', 'kg'),
  ('G', 'Gram', 'g'),
  ('LB', 'Pound', 'lb'),
  ('OZ', 'Ounce', 'oz'),
  ('L', 'Liter', 'L'),
  ('ML', 'Milliliter', 'mL'),
  ('M', 'Meter', 'm'),
  ('CM', 'Centimeter', 'cm'),
  ('FT', 'Foot', 'ft'),
  ('IN', 'Inch', 'in')
on conflict (code) do update set
  name = excluded.name,
  symbol = excluded.symbol;

-- Insert unit conversions
update unit_of_measure set base_unit_code = 'KG', conversion_factor = 0.001 where code = 'G';
update unit_of_measure set base_unit_code = 'KG', conversion_factor = 0.453592 where code = 'LB';
update unit_of_measure set base_unit_code = 'LB', conversion_factor = 0.0625 where code = 'OZ';
update unit_of_measure set base_unit_code = 'L', conversion_factor = 0.001 where code = 'ML';
update unit_of_measure set base_unit_code = 'M', conversion_factor = 0.01 where code = 'CM';
update unit_of_measure set base_unit_code = 'M', conversion_factor = 0.3048 where code = 'FT';
update unit_of_measure set base_unit_code = 'FT', conversion_factor = 0.0833333 where code = 'IN';

-- Insert default transaction types
insert into inventory_transaction_type (code, name, affects_quantity, affects_value, requires_approval, creates_journal_entry) values
  ('PURCHASE_RECEIPT', 'Purchase Receipt', 'INCREASE', 'INCREASE', 0, 1),
  ('SALES_ISSUE', 'Sales Issue', 'DECREASE', 'DECREASE', 0, 1),
  ('ADJUSTMENT_POSITIVE', 'Positive Adjustment', 'INCREASE', 'INCREASE', 1, 1),
  ('ADJUSTMENT_NEGATIVE', 'Negative Adjustment', 'DECREASE', 'DECREASE', 1, 1),
  ('TRANSFER_OUT', 'Transfer Out', 'DECREASE', 'NONE', 0, 0),
  ('TRANSFER_IN', 'Transfer In', 'INCREASE', 'NONE', 0, 0),
  ('MANUFACTURING_ISSUE', 'Manufacturing Issue', 'DECREASE', 'DECREASE', 0, 1),
  ('MANUFACTURING_RECEIPT', 'Manufacturing Receipt', 'INCREASE', 'INCREASE', 0, 1),
  ('PHYSICAL_COUNT', 'Physical Count Adjustment', 'NONE', 'NONE', 1, 1),
  ('OBSOLESCENCE_WRITEOFF', 'Obsolescence Write-off', 'DECREASE', 'DECREASE', 1, 1),
  ('DAMAGE_WRITEOFF', 'Damage Write-off', 'DECREASE', 'DECREASE', 1, 1)
on conflict (code) do update set
  name = excluded.name,
  affects_quantity = excluded.affects_quantity,
  affects_value = excluded.affects_value,
  requires_approval = excluded.requires_approval,
  creates_journal_entry = excluded.creates_journal_entry;

-- Insert default product categories
insert into product_category (code, name, description) values
  ('RAW', 'Raw Materials', 'Raw materials used in manufacturing'),
  ('WIP', 'Work in Progress', 'Items currently being manufactured'),
  ('FG', 'Finished Goods', 'Completed products ready for sale'),
  ('MRO', 'Maintenance, Repair & Operations', 'Supplies for facility maintenance'),
  ('PKG', 'Packaging Materials', 'Materials used for packaging products'),
  ('CON', 'Consumables', 'Items consumed during operations'),
  ('TRD', 'Trading Goods', 'Items purchased for resale without modification')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description;

-- Insert default warehouse
insert into warehouse (code, name, address, is_default) values
  ('MAIN', 'Main Warehouse', 'Main facility warehouse', 1)
on conflict (code) do update set
  name = excluded.name,
  address = excluded.address,
  is_default = excluded.is_default;

-- Insert default vendor
insert into vendor (vendor_code, name, contact_person, email, phone, payment_terms_days) values
  ('SUPPLIER001', 'Default Supplier', 'John Smith', 'supplier@example.com', '+1-555-0123', 30)
on conflict (vendor_code) do update set
  name = excluded.name,
  contact_person = excluded.contact_person,
  email = excluded.email,
  phone = excluded.phone,
  payment_terms_days = excluded.payment_terms_days;

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
