/*
SQLite 3.49.0

MIGRATION 009: INVENTORY CONTROL
===============================

Implements inventory control procedures and automation:

DEPENDS ON: 004_product_management.sql, 005_warehouse_management.sql, 
           006_inventory_tracking.sql, 007_inventory_transactions.sql,
           008_inventory_accounting.sql

CONTROL FEATURES:
• Physical inventory adjustment automation
• Comprehensive journal entry automation
• Inventory cutoff controls for period-end
• Automated reserve creation and management
• Transaction validation and controls

This module provides automated controls and procedures to ensure
inventory accuracy and proper accounting treatment.
*/

pragma journal_mode = wal;
pragma foreign_keys = on;

begin exclusive transaction;

--- INVENTORY CUTOFF AND PERIOD-END CONTROLS ---

-- Inventory cut-off tracking for period-end accuracy
create table if not exists inventory_cutoff_control (
  id integer primary key,
  cutoff_date integer not null,
  warehouse_id integer not null,
  last_receipt_number text,
  last_shipment_number text,
  last_adjustment_number text,
  cutoff_performed_by text not null,
  cutoff_time integer not null,
  notes text,
  foreign key (warehouse_id) references warehouse (id) on update restrict on delete restrict
) strict;

create index if not exists inventory_cutoff_control_cutoff_date_index on inventory_cutoff_control (cutoff_date);
create index if not exists inventory_cutoff_control_warehouse_id_index on inventory_cutoff_control (warehouse_id);

--- PHYSICAL INVENTORY ADJUSTMENT AUTOMATION ---

-- Auto-create inventory transactions and journal entries when physical count discrepancies are adjusted
drop trigger if exists physical_inventory_adjustment_trigger;
create trigger physical_inventory_adjustment_trigger
after update on physical_inventory_count for each row
when old.adjusted_time is null and new.adjusted_time is not null
  and new.variance_quantity != 0
begin
  -- Create inventory transaction for the adjustment
  insert into inventory_transaction (
    transaction_type_code,
    reference_number,
    transaction_date,
    notes,
    total_value,
    currency_code,
    created_by_user,
    approved_by_user,
    created_time,
    approved_time
  )
  select
    'PHYSICAL_COUNT',
    'PI-ADJ-' || pi.count_number || '-' || new.id,
    pi.count_date,
    'Physical inventory adjustment for count #' || pi.count_number ||
    ' - Product: ' || p.sku ||
    ' - System: ' || new.system_quantity ||
    ' - Counted: ' || coalesce(new.counted_quantity, 0) ||
    ' - Variance: ' || new.variance_quantity,
    abs(new.variance_value),
    'USD',
    coalesce(new.verified_by_user, new.counted_by_user, 'system'),
    coalesce(new.verified_by_user, new.counted_by_user, 'system'),
    new.adjusted_time,
    new.adjusted_time
  from physical_inventory pi
  join product p on p.id = new.product_id
  where pi.id = new.physical_inventory_id;

  -- Create inventory transaction line for the adjustment
  insert into inventory_transaction_line (
    inventory_transaction_id,
    line_number,
    product_id,
    product_variant_id,
    warehouse_location_id,
    lot_id,
    quantity,
    unit_cost,
    reason_code,
    notes
  )
  select
    last_insert_rowid(),
    1,
    new.product_id,
    new.product_variant_id,
    new.warehouse_location_id,
    new.lot_id,
    new.variance_quantity,
    new.unit_cost,
    'PHYSICAL_COUNT_ADJUSTMENT',
    'Physical count variance adjustment'
  from physical_inventory pi
  where pi.id = new.physical_inventory_id;

  -- Create journal entry for the adjustment
  insert into journal_entry (
    ref,
    transaction_time,
    note
  )
  select
    coalesce((select max(ref) from journal_entry), 0) + 1,
    pi.count_date,
    'Physical inventory adjustment - Count #' || pi.count_number ||
    ' - Product: ' || p.sku || ' - Variance: ' || new.variance_quantity || ' units'
  from physical_inventory pi
  join product p on p.id = new.product_id
  where pi.id = new.physical_inventory_id;

  -- Add journal entry lines based on variance type
  -- For positive variance (found more than expected): DR Inventory, CR Inventory Adjustment Gain
  -- For negative variance (found less than expected): DR Inventory Adjustment Loss, CR Inventory
  insert into journal_entry_line_auto_number (
    journal_entry_ref,
    account_code,
    db,
    cr,
    db_functional,
    cr_functional
  )
  select
    coalesce((select max(ref) from journal_entry), 0),
    case
      when new.variance_quantity > 0 then p.inventory_account_code -- DR Inventory for positive variance
      else 51200 -- DR Inventory Adjustment Loss for negative variance (assuming account exists)
    end,
    case
      when new.variance_quantity > 0 then abs(new.variance_value)
      else abs(new.variance_value)
    end,
    0,
    case
      when new.variance_quantity > 0 then abs(new.variance_value)
      else abs(new.variance_value)
    end,
    0
  from product p
  where p.id = new.product_id;

  insert into journal_entry_line_auto_number (
    journal_entry_ref,
    account_code,
    db,
    cr,
    db_functional,
    cr_functional
  )
  select
    coalesce((select max(ref) from journal_entry), 0),
    case
      when new.variance_quantity > 0 then 41200 -- CR Inventory Adjustment Gain for positive variance (assuming account exists)
      else p.inventory_account_code -- CR Inventory for negative variance
    end,
    0,
    abs(new.variance_value),
    0,
    abs(new.variance_value)
  from product p
  where p.id = new.product_id;

  -- Post the journal entry immediately for physical count adjustments
  update journal_entry
  set post_time = new.adjusted_time
  where ref = coalesce((select max(ref) from journal_entry), 0);

  -- Link the journal entry to the inventory transaction and mark as posted
  update inventory_transaction
  set journal_entry_ref = coalesce((select max(ref) from journal_entry), 0),
      posted_time = new.adjusted_time
  where id = last_insert_rowid();
end;

--- COMPREHENSIVE INVENTORY JOURNAL ENTRY AUTOMATION ---

-- Create journal entries automatically for all inventory transactions when posted
drop trigger if exists inventory_transaction_journal_entry_trigger;
create trigger inventory_transaction_journal_entry_trigger
after update on inventory_transaction for each row
when old.posted_time is null and new.posted_time is not null
  and exists (
    select 1 from inventory_transaction_type itt
    where itt.code = new.transaction_type_code
    and itt.creates_journal_entry = 1
  )
  and new.journal_entry_ref is null
begin
  -- Create journal entry header
  insert into journal_entry (
    ref,
    transaction_time,
    note
  )
  select
    coalesce((select max(ref) from journal_entry), 0) + 1,
    new.transaction_date,
    itt.name || ' - Ref: ' || new.reference_number ||
    ' - Total Value: ' || printf('%.2f', new.total_value / 100.0) || ' ' || new.currency_code
  from inventory_transaction_type itt
  where itt.code = new.transaction_type_code;

  -- Get the journal entry reference that was just created
  update inventory_transaction
  set journal_entry_ref = coalesce((select max(ref) from journal_entry), 0)
  where id = new.id;

  -- Create journal entry lines based on transaction type
  -- PURCHASE_RECEIPT: DR Inventory, CR Accounts Payable (or Cash if direct purchase)
  insert into journal_entry_line_auto_number (
    journal_entry_ref,
    account_code,
    db,
    cr,
    db_functional,
    cr_functional
  )
  select
    coalesce((select max(ref) from journal_entry), 0),
    p.inventory_account_code, -- DR Inventory
    coalesce(sum(abs(itl.quantity * itl.unit_cost)), 0),
    0,
    coalesce(sum(abs(itl.quantity * itl.unit_cost)), 0),
    0
  from inventory_transaction_line itl
  join product p on p.id = itl.product_id
  where itl.inventory_transaction_id = new.id
    and new.transaction_type_code = 'PURCHASE_RECEIPT'
  group by p.inventory_account_code
  having sum(abs(itl.quantity * itl.unit_cost)) > 0;

  insert into journal_entry_line_auto_number (
    journal_entry_ref,
    account_code,
    db,
    cr,
    db_functional,
    cr_functional
  )
  select
    coalesce((select max(ref) from journal_entry), 0),
    20100, -- CR Accounts Payable (assuming standard account code)
    0,
    coalesce(sum(abs(itl.quantity * itl.unit_cost)), 0),
    0,
    coalesce(sum(abs(itl.quantity * itl.unit_cost)), 0)
  from inventory_transaction_line itl
  where itl.inventory_transaction_id = new.id
    and new.transaction_type_code = 'PURCHASE_RECEIPT'
  having sum(abs(itl.quantity * itl.unit_cost)) > 0;

  -- SALES_ISSUE: DR COGS, CR Inventory
  insert into journal_entry_line_auto_number (
    journal_entry_ref,
    account_code,
    db,
    cr,
    db_functional,
    cr_functional
  )
  select
    coalesce((select max(ref) from journal_entry), 0),
    p.cogs_account_code, -- DR Cost of Goods Sold
    coalesce(sum(abs(itl.quantity * itl.unit_cost)), 0),
    0,
    coalesce(sum(abs(itl.quantity * itl.unit_cost)), 0),
    0
  from inventory_transaction_line itl
  join product p on p.id = itl.product_id
  where itl.inventory_transaction_id = new.id
    and new.transaction_type_code = 'SALES_ISSUE'
  group by p.cogs_account_code
  having sum(abs(itl.quantity * itl.unit_cost)) > 0;

  insert into journal_entry_line_auto_number (
    journal_entry_ref,
    account_code,
    db,
    cr,
    db_functional,
    cr_functional
  )
  select
    coalesce((select max(ref) from journal_entry), 0),
    p.inventory_account_code, -- CR Inventory
    0,
    coalesce(sum(abs(itl.quantity * itl.unit_cost)), 0),
    0,
    coalesce(sum(abs(itl.quantity * itl.unit_cost)), 0)
  from inventory_transaction_line itl
  join product p on p.id = itl.product_id
  where itl.inventory_transaction_id = new.id
    and new.transaction_type_code = 'SALES_ISSUE'
  group by p.inventory_account_code
  having sum(abs(itl.quantity * itl.unit_cost)) > 0;

  -- ADJUSTMENT_POSITIVE: DR Inventory, CR Inventory Adjustment Gain
  insert into journal_entry_line_auto_number (
    journal_entry_ref,
    account_code,
    db,
    cr,
    db_functional,
    cr_functional
  )
  select
    coalesce((select max(ref) from journal_entry), 0),
    p.inventory_account_code, -- DR Inventory
    coalesce(sum(abs(itl.quantity * itl.unit_cost)), 0),
    0,
    coalesce(sum(abs(itl.quantity * itl.unit_cost)), 0),
    0
  from inventory_transaction_line itl
  join product p on p.id = itl.product_id
  where itl.inventory_transaction_id = new.id
    and new.transaction_type_code = 'ADJUSTMENT_POSITIVE'
  group by p.inventory_account_code
  having sum(abs(itl.quantity * itl.unit_cost)) > 0;

  insert into journal_entry_line_auto_number (
    journal_entry_ref,
    account_code,
    db,
    cr,
    db_functional,
    cr_functional
  )
  select
    coalesce((select max(ref) from journal_entry), 0),
    41200, -- CR Inventory Adjustment Gain (revenue account)
    0,
    coalesce(sum(abs(itl.quantity * itl.unit_cost)), 0),
    0,
    coalesce(sum(abs(itl.quantity * itl.unit_cost)), 0)
  from inventory_transaction_line itl
  where itl.inventory_transaction_id = new.id
    and new.transaction_type_code = 'ADJUSTMENT_POSITIVE'
  having sum(abs(itl.quantity * itl.unit_cost)) > 0;

  -- ADJUSTMENT_NEGATIVE: DR Inventory Adjustment Loss, CR Inventory
  insert into journal_entry_line_auto_number (
    journal_entry_ref,
    account_code,
    db,
    cr,
    db_functional,
    cr_functional
  )
  select
    coalesce((select max(ref) from journal_entry), 0),
    51200, -- DR Inventory Adjustment Loss (expense account)
    coalesce(sum(abs(itl.quantity * itl.unit_cost)), 0),
    0,
    coalesce(sum(abs(itl.quantity * itl.unit_cost)), 0),
    0
  from inventory_transaction_line itl
  where itl.inventory_transaction_id = new.id
    and new.transaction_type_code = 'ADJUSTMENT_NEGATIVE'
  having sum(abs(itl.quantity * itl.unit_cost)) > 0;

  insert into journal_entry_line_auto_number (
    journal_entry_ref,
    account_code,
    db,
    cr,
    db_functional,
    cr_functional
  )
  select
    coalesce((select max(ref) from journal_entry), 0),
    p.inventory_account_code, -- CR Inventory
    0,
    coalesce(sum(abs(itl.quantity * itl.unit_cost)), 0),
    0,
    coalesce(sum(abs(itl.quantity * itl.unit_cost)), 0)
  from inventory_transaction_line itl
  join product p on p.id = itl.product_id
  where itl.inventory_transaction_id = new.id
    and new.transaction_type_code = 'ADJUSTMENT_NEGATIVE'
  group by p.inventory_account_code
  having sum(abs(itl.quantity * itl.unit_cost)) > 0;

  -- MANUFACTURING_ISSUE: DR Work in Process, CR Raw Materials Inventory
  insert into journal_entry_line_auto_number (
    journal_entry_ref,
    account_code,
    db,
    cr,
    db_functional,
    cr_functional
  )
  select
    coalesce((select max(ref) from journal_entry), 0),
    13200, -- DR Work in Process Inventory
    coalesce(sum(abs(itl.quantity * itl.unit_cost)), 0),
    0,
    coalesce(sum(abs(itl.quantity * itl.unit_cost)), 0),
    0
  from inventory_transaction_line itl
  where itl.inventory_transaction_id = new.id
    and new.transaction_type_code = 'MANUFACTURING_ISSUE'
  having sum(abs(itl.quantity * itl.unit_cost)) > 0;

  insert into journal_entry_line_auto_number (
    journal_entry_ref,
    account_code,
    db,
    cr,
    db_functional,
    cr_functional
  )
  select
    coalesce((select max(ref) from journal_entry), 0),
    p.inventory_account_code, -- CR Raw Materials Inventory
    0,
    coalesce(sum(abs(itl.quantity * itl.unit_cost)), 0),
    0,
    coalesce(sum(abs(itl.quantity * itl.unit_cost)), 0)
  from inventory_transaction_line itl
  join product p on p.id = itl.product_id
  where itl.inventory_transaction_id = new.id
    and new.transaction_type_code = 'MANUFACTURING_ISSUE'
  group by p.inventory_account_code
  having sum(abs(itl.quantity * itl.unit_cost)) > 0;

  -- MANUFACTURING_RECEIPT: DR Finished Goods Inventory, CR Work in Process
  insert into journal_entry_line_auto_number (
    journal_entry_ref,
    account_code,
    db,
    cr,
    db_functional,
    cr_functional
  )
  select
    coalesce((select max(ref) from journal_entry), 0),
    p.inventory_account_code, -- DR Finished Goods Inventory
    coalesce(sum(abs(itl.quantity * itl.unit_cost)), 0),
    0,
    coalesce(sum(abs(itl.quantity * itl.unit_cost)), 0),
    0
  from inventory_transaction_line itl
  join product p on p.id = itl.product_id
  where itl.inventory_transaction_id = new.id
    and new.transaction_type_code = 'MANUFACTURING_RECEIPT'
  group by p.inventory_account_code
  having sum(abs(itl.quantity * itl.unit_cost)) > 0;

  insert into journal_entry_line_auto_number (
    journal_entry_ref,
    account_code,
    db,
    cr,
    db_functional,
    cr_functional
  )
  select
    coalesce((select max(ref) from journal_entry), 0),
    13200, -- CR Work in Process Inventory
    0,
    coalesce(sum(abs(itl.quantity * itl.unit_cost)), 0),
    0,
    coalesce(sum(abs(itl.quantity * itl.unit_cost)), 0)
  from inventory_transaction_line itl
  where itl.inventory_transaction_id = new.id
    and new.transaction_type_code = 'MANUFACTURING_RECEIPT'
  having sum(abs(itl.quantity * itl.unit_cost)) > 0;

  -- OBSOLESCENCE_WRITEOFF: DR Obsolescence Loss, CR Inventory
  insert into journal_entry_line_auto_number (
    journal_entry_ref,
    account_code,
    db,
    cr,
    db_functional,
    cr_functional
  )
  select
    coalesce((select max(ref) from journal_entry), 0),
    51300, -- DR Obsolescence Loss (expense account)
    coalesce(sum(abs(itl.quantity * itl.unit_cost)), 0),
    0,
    coalesce(sum(abs(itl.quantity * itl.unit_cost)), 0),
    0
  from inventory_transaction_line itl
  where itl.inventory_transaction_id = new.id
    and new.transaction_type_code = 'OBSOLESCENCE_WRITEOFF'
  having sum(abs(itl.quantity * itl.unit_cost)) > 0;

  insert into journal_entry_line_auto_number (
    journal_entry_ref,
    account_code,
    db,
    cr,
    db_functional,
    cr_functional
  )
  select
    coalesce((select max(ref) from journal_entry), 0),
    p.inventory_account_code, -- CR Inventory
    0,
    coalesce(sum(abs(itl.quantity * itl.unit_cost)), 0),
    0,
    coalesce(sum(abs(itl.quantity * itl.unit_cost)), 0)
  from inventory_transaction_line itl
  join product p on p.id = itl.product_id
  where itl.inventory_transaction_id = new.id
    and new.transaction_type_code = 'OBSOLESCENCE_WRITEOFF'
  group by p.inventory_account_code
  having sum(abs(itl.quantity * itl.unit_cost)) > 0;

  -- DAMAGE_WRITEOFF: DR Damage Loss, CR Inventory
  insert into journal_entry_line_auto_number (
    journal_entry_ref,
    account_code,
    db,
    cr,
    db_functional,
    cr_functional
  )
  select
    coalesce((select max(ref) from journal_entry), 0),
    51400, -- DR Damage Loss (expense account)
    coalesce(sum(abs(itl.quantity * itl.unit_cost)), 0),
    0,
    coalesce(sum(abs(itl.quantity * itl.unit_cost)), 0),
    0
  from inventory_transaction_line itl
  where itl.inventory_transaction_id = new.id
    and new.transaction_type_code = 'DAMAGE_WRITEOFF'
  having sum(abs(itl.quantity * itl.unit_cost)) > 0;

  insert into journal_entry_line_auto_number (
    journal_entry_ref,
    account_code,
    db,
    cr,
    db_functional,
    cr_functional
  )
  select
    coalesce((select max(ref) from journal_entry), 0),
    p.inventory_account_code, -- CR Inventory
    0,
    coalesce(sum(abs(itl.quantity * itl.unit_cost)), 0),
    0,
    coalesce(sum(abs(itl.quantity * itl.unit_cost)), 0)
  from inventory_transaction_line itl
  join product p on p.id = itl.product_id
  where itl.inventory_transaction_id = new.id
    and new.transaction_type_code = 'DAMAGE_WRITEOFF'
  group by p.inventory_account_code
  having sum(abs(itl.quantity * itl.unit_cost)) > 0;

  -- Post the journal entry immediately for automated transactions
  update journal_entry
  set post_time = new.posted_time
  where ref = coalesce((select max(ref) from journal_entry), 0);
end;

commit transaction;