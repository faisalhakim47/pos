/*
SQLite 3.49.0

MIGRATION 007: INVENTORY TRANSACTIONS
====================================

Implements inventory transaction management and processing:

DEPENDS ON: 004_product_management.sql, 005_warehouse_management.sql, 006_inventory_tracking.sql

TRANSACTION FEATURES:
• Transaction types with configurable behavior
• Multi-line inventory transactions
• Approval workflow support
• Automatic stock level updates
• Serial number and lot validation

This module handles all inventory movements including receipts, issues,
adjustments, and transfers with full audit trail capabilities.
*/

pragma journal_mode = wal;
pragma foreign_keys = on;

begin exclusive transaction;

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
  -- Timestamp-based status tracking instead of text status
  created_time integer not null,
  approved_time integer,
  posted_time integer,
  cancelled_time integer,
  approved_by_user text,
  created_by_user text not null,
  foreign key (transaction_type_code) references inventory_transaction_type (code) on update restrict on delete restrict,
  foreign key (currency_code) references currency (code) on update restrict on delete restrict,
  foreign key (journal_entry_ref) references journal_entry (ref) on update restrict on delete restrict
) strict;

create index if not exists inventory_transaction_transaction_type_code_index on inventory_transaction (transaction_type_code);
create index if not exists inventory_transaction_reference_number_index on inventory_transaction (reference_number);
create index if not exists inventory_transaction_transaction_date_index on inventory_transaction (transaction_date);
-- Indexes for timestamp-based status tracking
create index if not exists inventory_transaction_created_time_index on inventory_transaction (created_time);
create index if not exists inventory_transaction_approved_time_index on inventory_transaction (approved_time);
create index if not exists inventory_transaction_posted_time_index on inventory_transaction (posted_time);
create index if not exists inventory_transaction_cancelled_time_index on inventory_transaction (cancelled_time);

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

--- TRIGGERS FOR INVENTORY UPDATES ---

-- Update inventory stock when transactions are posted
drop trigger if exists inventory_transaction_post_trigger;
create trigger inventory_transaction_post_trigger
after update on inventory_transaction for each row
when old.posted_time is null and new.posted_time is not null
begin
  -- For each unique product/location/lot combination in this transaction
  -- Check if stock record exists and update, or insert new one

  -- Handle each transaction line
  insert or replace into inventory_stock (
    id,
    product_id,
    product_variant_id,
    warehouse_location_id,
    lot_id,
    quantity_on_hand,
    unit_cost,
    quantity_reserved,
    last_movement_time
  )
  select
    coalesce(existing.id, NULL) as id,
    grouped.product_id,
    grouped.product_variant_id,
    grouped.warehouse_location_id,
    grouped.lot_id,
    coalesce(existing.quantity_on_hand, 0) + grouped.total_quantity as quantity_on_hand,
    case
      when grouped.total_quantity > 0 then
        case
          when coalesce(existing.quantity_on_hand, 0) > 0 then
            ((coalesce(existing.quantity_on_hand, 0) * coalesce(existing.unit_cost, 0)) +
             (grouped.total_quantity * grouped.weighted_unit_cost)) /
            (coalesce(existing.quantity_on_hand, 0) + grouped.total_quantity)
          else grouped.weighted_unit_cost
        end
      else coalesce(existing.unit_cost, grouped.weighted_unit_cost)
    end as unit_cost,
    coalesce(existing.quantity_reserved, 0) as quantity_reserved,
    new.posted_time as last_movement_time
  from (
    select
      itl.product_id,
      itl.product_variant_id,
      itl.warehouse_location_id,
      itl.lot_id,
      sum(itl.quantity) as total_quantity,
      case
        when sum(itl.quantity) > 0 then sum(itl.quantity * itl.unit_cost) / sum(itl.quantity)
        else max(itl.unit_cost)
      end as weighted_unit_cost
    from inventory_transaction_line itl
    where itl.inventory_transaction_id = new.id
    group by itl.product_id, itl.product_variant_id, itl.warehouse_location_id, itl.lot_id
  ) grouped
  left join inventory_stock existing on
    existing.product_id = grouped.product_id
    and (existing.product_variant_id is grouped.product_variant_id or (existing.product_variant_id is null and grouped.product_variant_id is null))
    and existing.warehouse_location_id = grouped.warehouse_location_id
    and (existing.lot_id is grouped.lot_id or (existing.lot_id is null and grouped.lot_id is null));
end;

-- Validate lot tracking requirements
drop trigger if exists inventory_lot_validation_trigger;
create trigger inventory_lot_validation_trigger
before insert on inventory_transaction_line for each row
when new.product_id in (select id from product where is_lot_tracked = 1)
  and new.lot_id is null
begin
  select raise(abort, 'Lot ID is required for lot-tracked products');
end;

-- Validate serial number requirements
drop trigger if exists inventory_serial_validation_trigger;
create trigger inventory_serial_validation_trigger
before insert on inventory_transaction_line for each row
when new.product_id in (select id from product where is_serialized = 1)
  and (new.serial_numbers is null or json_array_length(new.serial_numbers) != abs(new.quantity))
begin
  select raise(abort, 'Serial numbers must be provided for serialized products and match quantity');
end;

-- Validate negative stock for non-allowed transactions
drop trigger if exists inventory_negative_stock_validation_trigger;
create trigger inventory_negative_stock_validation_trigger
before update on inventory_stock for each row
when new.quantity_on_hand < 0
  and not exists (
    select 1 from inventory_transaction it
    join inventory_transaction_line itl on itl.inventory_transaction_id = it.id
    join inventory_transaction_type itt on itt.code = it.transaction_type_code
    where itl.product_id = new.product_id
      and itl.warehouse_location_id = new.warehouse_location_id
      and (itl.lot_id is new.lot_id or (itl.lot_id is null and new.lot_id is null))
      and itt.code in ('ADJUSTMENT_NEGATIVE', 'PHYSICAL_COUNT', 'DAMAGE_WRITEOFF', 'OBSOLESCENCE_WRITEOFF', 'SALES_ISSUE', 'MANUFACTURING_ISSUE', 'TRANSFER_OUT')
      and it.posted_time is not null
      and it.transaction_date >= unixepoch() - 60  -- Allow recent transactions (within 1 minute)
  )
begin
  select raise(abort, 'Negative inventory not allowed for this transaction type');
end;

--- REPORTING VIEWS ---

-- Inventory movement audit trail
drop view if exists inventory_movement_audit;
create view inventory_movement_audit as
select
  it.reference_number,
  it.transaction_date,
  it.transaction_type_code,
  itt.name as transaction_type_name,
  p.id as product_id,
  p.sku,
  p.name as product_name,
  w.code as warehouse_code,
  wl.code as location_code,
  itl.quantity,
  itl.unit_cost,
  itl.total_cost,
  il.lot_number,
  itl.serial_numbers,
  it.created_by_user,
  case 
    when it.posted_time is not null then 'POSTED'
    when it.cancelled_time is not null then 'CANCELLED'
    when it.approved_time is not null then 'APPROVED'
    when it.created_time is not null then 'CREATED'
    else 'UNKNOWN'
  end as status,
  it.notes
from inventory_transaction it
join inventory_transaction_type itt on itt.code = it.transaction_type_code
join inventory_transaction_line itl on itl.inventory_transaction_id = it.id
join product p on p.id = itl.product_id
join warehouse_location wl on wl.id = itl.warehouse_location_id
join warehouse w on w.id = wl.warehouse_id
left join inventory_lot il on il.id = itl.lot_id
order by it.transaction_date desc, it.reference_number, itl.line_number;

--- DEFAULT DATA ---

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
  ('PHYSICAL_COUNT', 'Physical Count Adjustment', 'INCREASE', 'INCREASE', 1, 1),
  ('OBSOLESCENCE_WRITEOFF', 'Obsolescence Write-off', 'DECREASE', 'DECREASE', 1, 1),
  ('DAMAGE_WRITEOFF', 'Damage Write-off', 'DECREASE', 'DECREASE', 1, 1)
on conflict (code) do update set
  name = excluded.name,
  affects_quantity = excluded.affects_quantity,
  affects_value = excluded.affects_value,
  requires_approval = excluded.requires_approval,
  creates_journal_entry = excluded.creates_journal_entry;

commit transaction;