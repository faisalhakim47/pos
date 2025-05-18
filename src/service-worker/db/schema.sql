-- SQLite Database
-- code style: use lower case for all SQL keywords
-- naming convention: use snake_case for table, column, table view, trigger names, anything.
-- naming convention: all term "price" mean total price, the unit price will be named explicitly

pragma journal_mode = wal;
pragma foreign_keys = on;

begin exclusive transaction;

create table if not exists account_type (
  name text primary key,
  increased_by integer not null -- 0 as debit, 1 as credit
);

insert into account_type (name, increased_by)
values
  ('Asset', 0),
  ('Expense', 0),
  ('Liability', 1),
  ('Equity', 1),
  ('Revenue', 1),
  ('Contra-Revenue', 0),
  ('Contra-Asset', 1)
on conflict do update set
  increased_by = excluded.increased_by;

create table if not exists account (
  code integer primary key,
  name text not null,
  account_type_name text not null,
  balance integer not null,
  foreign key (account_type_name) references account_type (name)
);

insert into account (code, name, account_type_name, balance)
values
  (1101, 'Cash on Hand', 'Asset', 0),
  (1102, 'Cash', 'Asset', 0),
  (1201, 'Merchandice Inventory', 'Asset', 0),
  (3101, 'Equity', 'Equity', 0),
  (4101, 'Sale', 'Revenue', 0),
  (4201, 'Discount', 'Contra-Revenue', 0),
  (5101, 'Cost of Goods Sold', 'Expense', 0),
  (5201, 'Cash Short and Over', 'Expense', 0)
on conflict do update set
  name = excluded.name,
  account_type_name = excluded.account_type_name;

create table if not exists journal_entry (
  id integer primary key,
  entry_time integer not null,
  description text
);

create table if not exists account_mutation (
  id integer primary key,
  journal_entry_id integer not null,
  debited_account_code integer not null,
  credited_account_code integer not null,
  amount integer not null,
  foreign key (journal_entry_id) references journal_entry (id),
  foreign key (debited_account_code) references account (code),
  foreign key (credited_account_code) references account (code)
);

create table if not exists account_setting (
  id integer primary key,
  merchandise_inventory_account_code integer not null,
  cog_sold_account_code integer not null,
  sales_account_code integer not null,
  sales_discount_account_code integer not null,
  cash_over_and_short_account_code integer not null,
  default_purchase_payment_account_code integer not null,
  default_sale_payment_account_code integer not null,
  foreign key (merchandise_inventory_account_code) references account (code),
  foreign key (cog_sold_account_code) references account (code),
  foreign key (sales_account_code) references account (code),
  foreign key (sales_discount_account_code) references account (code),
  foreign key (default_purchase_payment_account_code) references account (code),
  foreign key (default_sale_payment_account_code) references account (code)
);

insert into account_setting (
  id,
  merchandise_inventory_account_code,
  cog_sold_account_code,
  sales_account_code,
  sales_discount_account_code,
  cash_over_and_short_account_code,
  default_purchase_payment_account_code,
  default_sale_payment_account_code
)
values
  (1, 1201, 5101, 4101, 4201, 5201, 1102, 1101)
on conflict do nothing;

create table if not exists cashier (
  id integer primary key,
  name text not null,
  password_hash text not null
);

create table if not exists pos_session (
  id integer primary key,
  cashier_id integer not null,
  opening_time integer not null,
  closing_time integer,
  account_post_time integer default null,
  foreign key (cashier_id) references cashier (id)
);

create table if not exists pos_session_balance (
  pos_session_id integer not null,
  account_code integer not null,
  opening_balance integer not null,
  closing_balance integer not null,
  primary key (pos_session_id, account_code),
  foreign key (pos_session_id) references pos_session (id),
  foreign key (account_code) references account (code)
);

create table if not exists pos_session_balance_mutation (
  pos_session_id integer not null,
  account_code integer not null,
  amount integer not null,
  primary key (pos_session_id, account_code),
  foreign key (pos_session_id) references pos_session (id),
  foreign key (account_code) references account (code)
);

create table if not exists product (
  id integer primary key,
  name text not null,
  category_name text,
  cog_account_code integer,
  -- historycal data applied from from account_setting
  cog integer not null default 0,
  -- cost of goods sold applied after account posting
  stock integer not null default 0,
  -- stock applied after account posting
  pending_stock_diff integer not null default 0,
  -- stock applied instantly on pos
  unit_price integer not null,
  uom text not null default 'unit',
  -- (unit of measurement) represent the smallest unit of the product
  num_of_sales integer not null default 0,
  num_of_purchases integer not null default 0,
  foreign key (cog_account_code) references account (code)
);

create table if not exists supplier (
  id integer primary key,
  name text not null,
  description text
);

create table if not exists supplier_product (
  product_id integer not null,
  supplier_id integer not null,
  alias text,
  conversion_unit integer not null default 1,
  -- conversion unit to smallest unit of measurement (uom) of the product, it always be larger than or equal to the smallest unit.
  primary key (product_id, supplier_id),
  foreign key (product_id) references product (id),
  foreign key (supplier_id) references supplier (id)
);

/**
 * Product identifiers are used to identify a product.
 * For example, a product with identifier '1234567890' is a product with barcode '1234567890'.
 */
create table if not exists product_identifier (
  product_id integer not null,
  identifier text not null,
  primary key (product_id, identifier),
  foreign key (product_id) references product (id)
);

create table if not exists purchase (
  id integer primary key,
  purchase_time integer not null,
  supplier_id integer not null,
  payment_account_code integer not null,
  account_post_time integer default null,
  foreign key (supplier_id) references supplier (id),
  foreign key (payment_account_code) references account (code)
);

create table if not exists purchase_item (
  purchase_id integer not null,
  product_id integer not null,
  quantity integer not null,
  price integer not null,
  primary key (purchase_id, product_id),
  foreign key (purchase_id) references purchase (id),
  foreign key (product_id) references product (id)
);

create table if not exists customer (
  id integer primary key,
  name text not null,
  category_name text
);

create table if not exists discount (
  id integer primary key,
  name text not null,
  begin_time integer not null,
  end_time integer,
  account_code integer,
  product_id integer,
  product_category_name text,
  customer_id integer,
  customer_category_name text,
  coupon_code text,
  percentage real not null default 0,
  min_amount integer not null default 0,
  max_amount integer not null default 0,
  foreign key (product_id) references product (id),
  foreign key (customer_id) references customer (id),
  foreign key (account_code) references account (code)
);

create table if not exists sale (
  id integer primary key,
  pos_session_id integer not null,
  customer_id integer not null,
  sale_time integer not null,
  payment_account_code integer not null,
  coupon_code text,
  foreign key (pos_session_id) references pos_session (id),
  foreign key (customer_id) references customer (id),
  foreign key (payment_account_code) references account (code)
);

create table if not exists sale_item (
  sale_id integer not null,
  product_id integer not null,
  quantity integer not null,
  price integer not null,
  primary key (sale_id, product_id),
  foreign key (sale_id) references sale (id),
  foreign key (product_id) references product (id)
);

create table if not exists sale_discount (
  sale_id integer not null,
  discount_id integer not null,
  percentage real not null,
  min_amount integer not null,
  max_amount integer not null,
  applied_amount integer not null,
  -- this is the final discount that will be applied to the sale
  primary key (sale_id, discount_id),
  foreign key (sale_id) references sale (id),
  foreign key (discount_id) references discount (id)
);

create view if not exists account_detail as
select
  account.code as code,
  account.name as name,
  account.balance as balance,
  account_type.name as account_type_name,
  account_type.increased_by as account_type_increased_by
from account
left join account_type on account_type.name = account.account_type_name;

commit transaction;
