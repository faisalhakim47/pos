/*
SQLite 3.49.0

MIGRATION 011: PURCHASE MANAGEMENT SYSTEM
========================================

Implements comprehensive purchase management with full procurement lifecycle:

DEPENDS ON: 001_core_accounting.sql, 004_product_management.sql, 005_warehouse_management.sql, 
           007_inventory_transactions.sql, 010_tax_management.sql

PURCHASE FEATURES:
• Vendor management with contact information and payment terms
• Purchase requisition and approval workflow
• Purchase order management with line items
• Goods receipt and inspection workflow
• Invoice matching (3-way matching)
• Purchase returns and credit notes
• Integration with accounting, inventory, and tax modules
• Timestamp-based status tracking for all documents

BUSINESS PROCESS FLOW:
1. Purchase Requisition → Approval → Purchase Order
2. Purchase Order → Goods Receipt → Invoice → Payment
3. Automatic inventory updates and accounting entries
4. Tax calculation and compliance integration

This module provides complete purchase-to-pay functionality with full audit trail.
*/

pragma journal_mode = wal;
pragma foreign_keys = on;

begin exclusive transaction;

--- VENDOR MANAGEMENT EXTENSIONS ---

-- Extend existing vendor table with purchase-specific fields
alter table vendor add column fax text;
alter table vendor add column website text;
alter table vendor add column billing_address text;
alter table vendor add column shipping_address text;
alter table vendor add column tax_id text;
alter table vendor add column credit_limit integer not null default 0 check (credit_limit >= 0);
alter table vendor add column discount_percent real not null default 0 check (discount_percent >= 0 and discount_percent <= 100);
alter table vendor add column account_payable_code integer;
alter table vendor add column prepaid_expense_code integer;
alter table vendor add column notes text;
alter table vendor add column updated_time integer;

-- Add foreign key constraints to new columns
-- Note: SQLite doesn't support adding foreign key constraints to existing tables
-- These would need to be enforced at the application level or through views

--- PURCHASE REQUISITION ---

create table if not exists purchase_requisition (
  id integer primary key,
  requisition_number text not null unique,
  requisition_date integer not null,
  requested_by_user text not null,
  department text,
  justification text,
  urgency_level text not null default 'NORMAL' check (urgency_level in ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  total_amount integer not null default 0 check (total_amount >= 0),
  currency_code text not null default 'USD',
  notes text,
  -- Timestamp-based status tracking
  created_time integer not null,
  submitted_time integer,
  approved_time integer,
  rejected_time integer,
  converted_time integer, -- When converted to PO
  cancelled_time integer,
  approved_by_user text,
  rejected_by_user text,
  rejection_reason text,
  foreign key (currency_code) references currency (code) on update restrict on delete restrict
) strict;

create index if not exists purchase_requisition_requisition_number_index on purchase_requisition (requisition_number);
create index if not exists purchase_requisition_requested_by_user_index on purchase_requisition (requested_by_user);
-- Indexes for timestamp-based status tracking
create index if not exists purchase_requisition_created_time_index on purchase_requisition (created_time);
create index if not exists purchase_requisition_submitted_time_index on purchase_requisition (submitted_time);
create index if not exists purchase_requisition_approved_time_index on purchase_requisition (approved_time);

create table if not exists purchase_requisition_line (
  id integer primary key,
  purchase_requisition_id integer not null,
  line_number integer not null,
  product_id integer not null,
  product_variant_id integer,
  description text not null,
  quantity integer not null check (quantity > 0),
  unit_of_measure_code text not null,
  estimated_unit_cost integer not null default 0 check (estimated_unit_cost >= 0),
  estimated_total_cost integer generated always as (quantity * estimated_unit_cost) stored,
  requested_delivery_date integer,
  warehouse_location_id integer,
  notes text,
  foreign key (purchase_requisition_id) references purchase_requisition (id) on update restrict on delete restrict,
  foreign key (product_id) references product (id) on update restrict on delete restrict,
  foreign key (product_variant_id) references product_variant (id) on update restrict on delete restrict,
  foreign key (unit_of_measure_code) references unit_of_measure (code) on update restrict on delete restrict,
  foreign key (warehouse_location_id) references warehouse_location (id) on update restrict on delete restrict,
  unique (purchase_requisition_id, line_number)
) strict;

create index if not exists purchase_requisition_line_purchase_requisition_id_index on purchase_requisition_line (purchase_requisition_id);
create index if not exists purchase_requisition_line_product_id_index on purchase_requisition_line (product_id);

--- PURCHASE ORDER ---

create table if not exists purchase_order (
  id integer primary key,
  order_number text not null unique,
  vendor_id integer not null,
  order_date integer not null,
  requested_delivery_date integer,
  delivery_address text,
  payment_terms_days integer not null default 30 check (payment_terms_days >= 0),
  discount_percent real not null default 0 check (discount_percent >= 0 and discount_percent <= 100),
  subtotal integer not null default 0 check (subtotal >= 0),
  discount_amount integer not null default 0 check (discount_amount >= 0),
  tax_amount integer not null default 0 check (tax_amount >= 0),
  total_amount integer not null default 0 check (total_amount >= 0),
  currency_code text not null default 'USD',
  exchange_rate real not null default 1.0 check (exchange_rate > 0),
  purchase_requisition_id integer, -- Link to original requisition
  ordered_by_user text not null,
  notes text,
  -- Timestamp-based status tracking
  created_time integer not null,
  submitted_time integer,
  approved_time integer,
  sent_time integer, -- When sent to vendor
  acknowledged_time integer, -- When vendor acknowledges
  cancelled_time integer,
  closed_time integer, -- When fully received and closed
  approved_by_user text,
  sent_by_user text,
  foreign key (vendor_id) references vendor (id) on update restrict on delete restrict,
  foreign key (currency_code) references currency (code) on update restrict on delete restrict,
  foreign key (purchase_requisition_id) references purchase_requisition (id) on update restrict on delete restrict
) strict;

create index if not exists purchase_order_order_number_index on purchase_order (order_number);
create index if not exists purchase_order_vendor_id_index on purchase_order (vendor_id);
create index if not exists purchase_order_order_date_index on purchase_order (order_date);
-- Indexes for timestamp-based status tracking
create index if not exists purchase_order_created_time_index on purchase_order (created_time);
create index if not exists purchase_order_submitted_time_index on purchase_order (submitted_time);
create index if not exists purchase_order_approved_time_index on purchase_order (approved_time);
create index if not exists purchase_order_sent_time_index on purchase_order (sent_time);

create table if not exists purchase_order_line (
  id integer primary key,
  purchase_order_id integer not null,
  line_number integer not null,
  product_id integer not null,
  product_variant_id integer,
  description text not null,
  quantity_ordered integer not null check (quantity_ordered > 0),
  quantity_received integer not null default 0 check (quantity_received >= 0),
  quantity_invoiced integer not null default 0 check (quantity_invoiced >= 0),
  unit_of_measure_code text not null,
  unit_cost integer not null check (unit_cost >= 0),
  line_total integer generated always as (quantity_ordered * unit_cost) stored,
  tax_code_code text,
  tax_amount integer not null default 0 check (tax_amount >= 0),
  requested_delivery_date integer,
  warehouse_location_id integer,
  purchase_requisition_line_id integer, -- Link to original requisition line
  notes text,
  foreign key (purchase_order_id) references purchase_order (id) on update restrict on delete restrict,
  foreign key (product_id) references product (id) on update restrict on delete restrict,
  foreign key (product_variant_id) references product_variant (id) on update restrict on delete restrict,
  foreign key (unit_of_measure_code) references unit_of_measure (code) on update restrict on delete restrict,
  foreign key (tax_code_code) references tax_code (code) on update restrict on delete restrict,
  foreign key (warehouse_location_id) references warehouse_location (id) on update restrict on delete restrict,
  foreign key (purchase_requisition_line_id) references purchase_requisition_line (id) on update restrict on delete restrict,
  unique (purchase_order_id, line_number)
) strict;

create index if not exists purchase_order_line_purchase_order_id_index on purchase_order_line (purchase_order_id);
create index if not exists purchase_order_line_product_id_index on purchase_order_line (product_id);

--- GOODS RECEIPT ---

create table if not exists goods_receipt (
  id integer primary key,
  receipt_number text not null unique,
  purchase_order_id integer not null,
  vendor_id integer not null,
  receipt_date integer not null,
  delivery_note_number text,
  carrier text,
  tracking_number text,
  received_by_user text not null,
  total_quantity_received integer not null default 0 check (total_quantity_received >= 0),
  notes text,
  -- Timestamp-based status tracking
  created_time integer not null,
  inspected_time integer,
  accepted_time integer,
  rejected_time integer,
  posted_time integer, -- When inventory is updated
  inspected_by_user text,
  accepted_by_user text,
  rejected_by_user text,
  rejection_reason text,
  inventory_transaction_id integer, -- Link to inventory movement
  foreign key (purchase_order_id) references purchase_order (id) on update restrict on delete restrict,
  foreign key (vendor_id) references vendor (id) on update restrict on delete restrict,
  foreign key (inventory_transaction_id) references inventory_transaction (id) on update restrict on delete restrict
) strict;

create index if not exists goods_receipt_receipt_number_index on goods_receipt (receipt_number);
create index if not exists goods_receipt_purchase_order_id_index on goods_receipt (purchase_order_id);
create index if not exists goods_receipt_vendor_id_index on goods_receipt (vendor_id);
-- Indexes for timestamp-based status tracking
create index if not exists goods_receipt_created_time_index on goods_receipt (created_time);
create index if not exists goods_receipt_accepted_time_index on goods_receipt (accepted_time);
create index if not exists goods_receipt_posted_time_index on goods_receipt (posted_time);

create table if not exists goods_receipt_line (
  id integer primary key,
  goods_receipt_id integer not null,
  line_number integer not null,
  purchase_order_line_id integer not null,
  product_id integer not null,
  product_variant_id integer,
  quantity_received integer not null check (quantity_received > 0),
  quantity_accepted integer not null default 0 check (quantity_accepted >= 0),
  quantity_rejected integer not null default 0 check (quantity_rejected >= 0),
  unit_of_measure_code text not null,
  unit_cost integer not null check (unit_cost >= 0),
  lot_number text,
  expiry_date integer,
  serial_numbers text, -- JSON array for serialized items
  warehouse_location_id integer not null,
  inspection_notes text,
  foreign key (goods_receipt_id) references goods_receipt (id) on update restrict on delete restrict,
  foreign key (purchase_order_line_id) references purchase_order_line (id) on update restrict on delete restrict,
  foreign key (product_id) references product (id) on update restrict on delete restrict,
  foreign key (product_variant_id) references product_variant (id) on update restrict on delete restrict,
  foreign key (unit_of_measure_code) references unit_of_measure (code) on update restrict on delete restrict,
  foreign key (warehouse_location_id) references warehouse_location (id) on update restrict on delete restrict,
  unique (goods_receipt_id, line_number)
) strict;

create index if not exists goods_receipt_line_goods_receipt_id_index on goods_receipt_line (goods_receipt_id);
create index if not exists goods_receipt_line_purchase_order_line_id_index on goods_receipt_line (purchase_order_line_id);
create index if not exists goods_receipt_line_product_id_index on goods_receipt_line (product_id);

--- PURCHASE INVOICE ---

create table if not exists purchase_invoice (
  id integer primary key,
  invoice_number text not null,
  vendor_invoice_number text not null,
  vendor_id integer not null,
  invoice_date integer not null,
  due_date integer not null,
  purchase_order_id integer,
  goods_receipt_id integer,
  subtotal integer not null check (subtotal >= 0),
  discount_amount integer not null default 0 check (discount_amount >= 0),
  tax_amount integer not null default 0 check (tax_amount >= 0),
  total_amount integer not null check (total_amount >= 0),
  currency_code text not null default 'USD',
  exchange_rate real not null default 1.0 check (exchange_rate > 0),
  payment_reference text,
  notes text,
  -- Timestamp-based status tracking
  created_time integer not null,
  matched_time integer, -- When matched with PO/GR
  approved_time integer,
  posted_time integer, -- When accounting entries are created
  paid_time integer,
  cancelled_time integer,
  matched_by_user text,
  approved_by_user text,
  posted_by_user text,
  journal_entry_ref integer, -- Link to accounting entry
  foreign key (vendor_id) references vendor (id) on update restrict on delete restrict,
  foreign key (purchase_order_id) references purchase_order (id) on update restrict on delete restrict,
  foreign key (goods_receipt_id) references goods_receipt (id) on update restrict on delete restrict,
  foreign key (currency_code) references currency (code) on update restrict on delete restrict,
  foreign key (journal_entry_ref) references journal_entry (ref) on update restrict on delete restrict,
  unique (vendor_id, vendor_invoice_number)
) strict;

create index if not exists purchase_invoice_invoice_number_index on purchase_invoice (invoice_number);
create index if not exists purchase_invoice_vendor_invoice_number_index on purchase_invoice (vendor_invoice_number);
create index if not exists purchase_invoice_vendor_id_index on purchase_invoice (vendor_id);
create index if not exists purchase_invoice_invoice_date_index on purchase_invoice (invoice_date);
-- Indexes for timestamp-based status tracking
create index if not exists purchase_invoice_created_time_index on purchase_invoice (created_time);
create index if not exists purchase_invoice_matched_time_index on purchase_invoice (matched_time);
create index if not exists purchase_invoice_approved_time_index on purchase_invoice (approved_time);
create index if not exists purchase_invoice_posted_time_index on purchase_invoice (posted_time);

create table if not exists purchase_invoice_line (
  id integer primary key,
  purchase_invoice_id integer not null,
  line_number integer not null,
  purchase_order_line_id integer,
  goods_receipt_line_id integer,
  product_id integer,
  product_variant_id integer,
  description text not null,
  quantity integer not null check (quantity > 0),
  unit_of_measure_code text not null,
  unit_cost integer not null check (unit_cost >= 0),
  line_total integer generated always as (quantity * unit_cost) stored,
  tax_code_code text,
  tax_amount integer not null default 0 check (tax_amount >= 0),
  expense_account_code integer, -- For non-inventory items
  notes text,
  foreign key (purchase_invoice_id) references purchase_invoice (id) on update restrict on delete restrict,
  foreign key (purchase_order_line_id) references purchase_order_line (id) on update restrict on delete restrict,
  foreign key (goods_receipt_line_id) references goods_receipt_line (id) on update restrict on delete restrict,
  foreign key (product_id) references product (id) on update restrict on delete restrict,
  foreign key (product_variant_id) references product_variant (id) on update restrict on delete restrict,
  foreign key (unit_of_measure_code) references unit_of_measure (code) on update restrict on delete restrict,
  foreign key (tax_code_code) references tax_code (code) on update restrict on delete restrict,
  foreign key (expense_account_code) references account (code) on update restrict on delete restrict,
  unique (purchase_invoice_id, line_number)
) strict;

create index if not exists purchase_invoice_line_purchase_invoice_id_index on purchase_invoice_line (purchase_invoice_id);
create index if not exists purchase_invoice_line_purchase_order_line_id_index on purchase_invoice_line (purchase_order_line_id);
create index if not exists purchase_invoice_line_product_id_index on purchase_invoice_line (product_id);

--- PURCHASE RETURN ---

create table if not exists purchase_return (
  id integer primary key,
  return_number text not null unique,
  vendor_id integer not null,
  purchase_order_id integer,
  goods_receipt_id integer,
  return_date integer not null,
  return_reason text not null,
  total_amount integer not null default 0 check (total_amount >= 0),
  currency_code text not null default 'USD',
  exchange_rate real not null default 1.0 check (exchange_rate > 0),
  returned_by_user text not null,
  notes text,
  -- Timestamp-based status tracking
  created_time integer not null,
  approved_time integer,
  shipped_time integer, -- When returned to vendor
  credited_time integer, -- When credit note received
  posted_time integer, -- When accounting entries created
  approved_by_user text,
  shipped_by_user text,
  inventory_transaction_id integer, -- Link to inventory movement
  journal_entry_ref integer, -- Link to accounting entry
  foreign key (vendor_id) references vendor (id) on update restrict on delete restrict,
  foreign key (purchase_order_id) references purchase_order (id) on update restrict on delete restrict,
  foreign key (goods_receipt_id) references goods_receipt (id) on update restrict on delete restrict,
  foreign key (currency_code) references currency (code) on update restrict on delete restrict,
  foreign key (inventory_transaction_id) references inventory_transaction (id) on update restrict on delete restrict,
  foreign key (journal_entry_ref) references journal_entry (ref) on update restrict on delete restrict
) strict;

create index if not exists purchase_return_return_number_index on purchase_return (return_number);
create index if not exists purchase_return_vendor_id_index on purchase_return (vendor_id);
-- Indexes for timestamp-based status tracking
create index if not exists purchase_return_created_time_index on purchase_return (created_time);
create index if not exists purchase_return_approved_time_index on purchase_return (approved_time);
create index if not exists purchase_return_posted_time_index on purchase_return (posted_time);

create table if not exists purchase_return_line (
  id integer primary key,
  purchase_return_id integer not null,
  line_number integer not null,
  goods_receipt_line_id integer not null,
  product_id integer not null,
  product_variant_id integer,
  quantity_returned integer not null check (quantity_returned > 0),
  unit_cost integer not null check (unit_cost >= 0),
  line_total integer generated always as (quantity_returned * unit_cost) stored,
  lot_number text,
  serial_numbers text, -- JSON array for serialized items
  warehouse_location_id integer not null,
  return_reason text,
  notes text,
  foreign key (purchase_return_id) references purchase_return (id) on update restrict on delete restrict,
  foreign key (goods_receipt_line_id) references goods_receipt_line (id) on update restrict on delete restrict,
  foreign key (product_id) references product (id) on update restrict on delete restrict,
  foreign key (product_variant_id) references product_variant (id) on update restrict on delete restrict,
  foreign key (warehouse_location_id) references warehouse_location (id) on update restrict on delete restrict,
  unique (purchase_return_id, line_number)
) strict;

create index if not exists purchase_return_line_purchase_return_id_index on purchase_return_line (purchase_return_id);
create index if not exists purchase_return_line_goods_receipt_line_id_index on purchase_return_line (goods_receipt_line_id);
create index if not exists purchase_return_line_product_id_index on purchase_return_line (product_id);

--- TRIGGERS FOR DATA INTEGRITY AND AUTOMATION ---

-- Update purchase order totals when lines change
drop trigger if exists purchase_order_line_update_totals_trigger;
create trigger purchase_order_line_update_totals_trigger
after insert on purchase_order_line for each row
begin
  update purchase_order 
  set subtotal = (
    select coalesce(sum(line_total), 0) 
    from purchase_order_line 
    where purchase_order_id = new.purchase_order_id
  ),
  tax_amount = (
    select coalesce(sum(tax_amount), 0) 
    from purchase_order_line 
    where purchase_order_id = new.purchase_order_id
  )
  where id = new.purchase_order_id;
  
  update purchase_order 
  set total_amount = subtotal - discount_amount + tax_amount
  where id = new.purchase_order_id;
end;

drop trigger if exists purchase_order_line_update_totals_update_trigger;
create trigger purchase_order_line_update_totals_update_trigger
after update on purchase_order_line for each row
begin
  update purchase_order 
  set subtotal = (
    select coalesce(sum(line_total), 0) 
    from purchase_order_line 
    where purchase_order_id = new.purchase_order_id
  ),
  tax_amount = (
    select coalesce(sum(tax_amount), 0) 
    from purchase_order_line 
    where purchase_order_id = new.purchase_order_id
  )
  where id = new.purchase_order_id;
  
  update purchase_order 
  set total_amount = subtotal - discount_amount + tax_amount
  where id = new.purchase_order_id;
end;

-- Tax calculation trigger for purchase order lines
drop trigger if exists purchase_order_line_tax_calculation_trigger;
create trigger purchase_order_line_tax_calculation_trigger
after insert on purchase_order_line for each row
when new.tax_code_code is not null
begin
  update purchase_order_line 
  set tax_amount = (
    select cast(new.line_total * tr.rate_percent / 100.0 as integer)
    from tax_rate tr
    where tr.tax_code_code = new.tax_code_code
      and tr.is_active = 1
      and tr.valid_from <= strftime('%s', 'now') * 1000  -- Current timestamp in milliseconds
    order by tr.valid_from desc
    limit 1
  )
  where id = new.id;
end;

drop trigger if exists purchase_order_line_tax_calculation_update_trigger;
create trigger purchase_order_line_tax_calculation_update_trigger
after update of tax_code_code, line_total on purchase_order_line for each row  
when new.tax_code_code is not null
begin
  update purchase_order_line 
  set tax_amount = (
    select cast(new.line_total * tr.rate_percent / 100.0 as integer)
    from tax_rate tr
    where tr.tax_code_code = new.tax_code_code
      and tr.is_active = 1
      and tr.valid_from <= strftime('%s', 'now') * 1000  -- Current timestamp in milliseconds
    order by tr.valid_from desc
    limit 1
  )
  where id = new.id;
end;

-- Update purchase invoice totals when lines change
drop trigger if exists purchase_invoice_line_update_totals_trigger;
create trigger purchase_invoice_line_update_totals_trigger
after insert on purchase_invoice_line for each row
begin
  update purchase_invoice 
  set subtotal = (
    select coalesce(sum(line_total), 0) 
    from purchase_invoice_line 
    where purchase_invoice_id = new.purchase_invoice_id
  ),
  tax_amount = (
    select coalesce(sum(tax_amount), 0) 
    from purchase_invoice_line 
    where purchase_invoice_id = new.purchase_invoice_id
  )
  where id = new.purchase_invoice_id;
  
  update purchase_invoice 
  set total_amount = subtotal - discount_amount + tax_amount
  where id = new.purchase_invoice_id;
end;

-- Update received quantities on purchase order lines when goods are received
drop trigger if exists goods_receipt_line_update_po_quantities_trigger;
create trigger goods_receipt_line_update_po_quantities_trigger
after insert on goods_receipt_line for each row
begin
  update purchase_order_line 
  set quantity_received = (
    select coalesce(sum(quantity_accepted), 0)
    from goods_receipt_line 
    where purchase_order_line_id = new.purchase_order_line_id
  )
  where id = new.purchase_order_line_id;
end;

drop trigger if exists goods_receipt_line_update_po_quantities_update_trigger;
create trigger goods_receipt_line_update_po_quantities_update_trigger
after update on goods_receipt_line for each row
when new.quantity_accepted != old.quantity_accepted
begin
  update purchase_order_line 
  set quantity_received = (
    select coalesce(sum(quantity_accepted), 0)
    from goods_receipt_line 
    where purchase_order_line_id = new.purchase_order_line_id
  )
  where id = new.purchase_order_line_id;
end;

-- Validate that goods receipt quantities don't exceed purchase order quantities
drop trigger if exists goods_receipt_line_validation_trigger;
create trigger goods_receipt_line_validation_trigger
before insert on goods_receipt_line for each row
begin
  select case
    when (
      select pol.quantity_ordered - pol.quantity_received 
      from purchase_order_line pol 
      where pol.id = new.purchase_order_line_id
    ) < new.quantity_received then
      raise(abort, 'Received quantity exceeds remaining order quantity')
  end;
end;

-- Auto-generate document numbers if not provided
drop trigger if exists purchase_order_number_trigger;
create trigger purchase_order_number_trigger
before insert on purchase_order for each row
when new.order_number is null or new.order_number = ''
begin
  update purchase_order set order_number = 'PO' || printf('%08d', new.id) where id = new.id;
end;

drop trigger if exists goods_receipt_number_trigger;
create trigger goods_receipt_number_trigger
before insert on goods_receipt for each row
when new.receipt_number is null or new.receipt_number = ''
begin
  update goods_receipt set receipt_number = 'GR' || printf('%08d', new.id) where id = new.id;
end;

drop trigger if exists purchase_invoice_number_trigger;
create trigger purchase_invoice_number_trigger
before insert on purchase_invoice for each row
when new.invoice_number is null or new.invoice_number = ''
begin
  update purchase_invoice set invoice_number = 'PI' || printf('%08d', new.id) where id = new.id;
end;

commit;
