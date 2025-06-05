/*
SQLite 3.49.0

MIGRATION 004: PRODUCT MANAGEMENT
=================================

Implements comprehensive product catalog management:

DEPENDS ON: 001_core_accounting.sql

PRODUCT FEATURES:
• Product categories with hierarchical structure
• Units of measure with conversion factors
• Product catalog with SKU management
• Product variants for size, color, etc.
• Integration with chart of accounts for inventory accounting

This module provides the foundation for inventory management by defining
the products that will be tracked in the system.
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
  created_time integer not null,
  updated_time integer not null,
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
  created_time integer not null,
  foreign key (product_id) references product (id) on update restrict on delete restrict
) strict;

create index if not exists product_variant_product_id_index on product_variant (product_id);
create index if not exists product_variant_sku_index on product_variant (sku);

--- VENDOR MANAGEMENT ---

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
  created_time integer not null,
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
  last_updated_time integer not null,
  foreign key (vendor_id) references vendor (id) on update restrict on delete restrict,
  foreign key (product_id) references product (id) on update restrict on delete restrict,
  foreign key (currency_code) references currency (code) on update restrict on delete restrict,
  unique (vendor_id, product_id)
) strict;

create index if not exists vendor_product_vendor_id_index on vendor_product (vendor_id);
create index if not exists vendor_product_product_id_index on vendor_product (product_id);

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

-- Insert default vendor
insert into vendor (vendor_code, name, contact_person, email, phone, payment_terms_days, created_time) values
  ('SUPPLIER001', 'Default Supplier', 'John Smith', 'supplier@example.com', '+1-555-0123', 30, unixepoch())
on conflict (vendor_code) do update set
  name = excluded.name,
  contact_person = excluded.contact_person,
  email = excluded.email,
  phone = excluded.phone,
  payment_terms_days = excluded.payment_terms_days;

commit transaction;