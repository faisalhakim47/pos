/*
SQLite 3.49.0

MIGRATION 010: TAX MANAGEMENT SYSTEM
===================================

Implements comprehensive tax management for sales, purchases, and compliance:

DEPENDS ON: 001_core_accounting.sql, 004_product_management.sql

TAX FEATURES:
• Tax codes and rates (VAT, GST, sales tax, etc.)
• Tax jurisdiction and region support
• Product/service taxability matrix
• Customer/vendor tax exemption
• Tax calculation for transactions (line and document level)
• Tax reporting and audit trail
• Integration with accounting for tax liability and payment

This module provides the foundation for tax compliance and automation.
*/

pragma journal_mode = wal;
pragma foreign_keys = on;

begin exclusive transaction;

--- TAX CODE AND RATE MANAGEMENT ---

create table if not exists tax_code (
  code text primary key,
  name text not null,
  description text,
  account_code integer references account(code) on update restrict on delete restrict, -- reference to chart of accounts
  is_active integer not null default 1 check (is_active in (0, 1))
) strict;

create table if not exists tax_rate (
  id integer primary key,
  tax_code_code text not null references tax_code(code) on update restrict on delete restrict,
  rate_percent real not null check (rate_percent >= 0),
  valid_from integer not null,
  valid_to integer,
  is_active integer not null default 1 check (is_active in (0, 1))
) strict;

create index if not exists tax_rate_tax_code_code_index on tax_rate (tax_code_code);

--- TAX JURISDICTION ---

create table if not exists tax_jurisdiction (
  id integer primary key,
  name text not null,
  region_code text,
  country_code text,
  is_active integer not null default 1 check (is_active in (0, 1))
) strict;

--- PRODUCT TAXABILITY MATRIX ---

create table if not exists product_taxability (
  id integer primary key,
  product_id integer not null references product(id) on update restrict on delete restrict,
  tax_code_code text not null references tax_code(code) on update restrict on delete restrict,
  jurisdiction_id integer references tax_jurisdiction(id) on update restrict on delete restrict,
  is_taxable integer not null default 1 check (is_taxable in (0, 1))
) strict;

create index if not exists product_taxability_product_id_index on product_taxability (product_id);
create index if not exists product_taxability_tax_code_code_index on product_taxability (tax_code_code);

--- CUSTOMER/VENDOR TAX EXEMPTION ---

create table if not exists entity_tax_exemption (
  id integer primary key,
  entity_type text not null check (entity_type in ('customer', 'vendor')),
  entity_id integer not null,
  tax_code_code text not null references tax_code(code) on update restrict on delete restrict,
  jurisdiction_id integer references tax_jurisdiction(id) on update restrict on delete restrict,
  exemption_reason text,
  valid_from integer not null,
  valid_to integer,
  is_active integer not null default 1 check (is_active in (0, 1))
) strict;

create index if not exists entity_tax_exemption_entity_id_index on entity_tax_exemption (entity_id);
create index if not exists entity_tax_exemption_tax_code_code_index on entity_tax_exemption (tax_code_code);

commit;
