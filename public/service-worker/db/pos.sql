-- SQLite Database
-- note: all price means total price, the unit price will be named explicitly

pragma journal_mode = wal;
pragma foreign_keys = on;

begin exclusive transaction;



create table if not exists account_type (
  name text primary key,
  increased_by text not null -- 'credit' or 'debit'
);

insert into
  account_type (name, increased_by)
values
  ('Aset', 'debit'),
  ('Beban', 'debit'),
  ('Liabilitas', 'credit'),
  ('Ekuitas', 'credit'),
  ('Pendapatan', 'credit'),
  ('Kontra-Pendapatan', 'debit'),
  ('Kontra-Aset', 'credit') on conflict do nothing;

create table if not exists account (
  code integer primary key,
  name text not null,
  account_type_name text not null,
  balance integer not null,
  foreign key (account_type_name) references account_type (name)
);

insert into
  account (code, name, account_type_name, balance)
values
  (1101, 'Kas Kecil', 'Aset', 0),
  (1102, 'Kas Besar', 'Aset', 0),
  (1201, 'Persediaan Barang Dagang', 'Aset', 0),
  (3101, 'Modal', 'Ekuitas', 0),
  (4101, 'Penjualan', 'Pendapatan', 0),
  (4201, 'Potongan Penjualan', 'Kontra-Pendapatan', 0),
  (5101, 'Harga Pokok Penjualan', 'Beban', 0),
  (5201, 'Selisih Kasir', 'Beban', 0)
on conflict do update
set
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
  debit_account_code integer not null,
  credit_account_code integer not null,
  amount integer not null,
  foreign key (journal_entry_id) references journal_entry (id),
  foreign key (debit_account_code) references account (code),
  foreign key (credit_account_code) references account (code)
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

insert into
  account_setting (
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
  (1, 1201, 5101, 4101, 4201, 5201, 1102, 1101) on conflict do nothing;

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
from
  account
  left join account_type on account_type.name = account.account_type_name;

drop trigger if exists discount_creation_validation_trigger;

create trigger discount_creation_validation_trigger before
insert
  on discount for each row begin
select
  case
    when new.min_amount > new.max_amount then raise(
      rollback,
      'min_amount must be less than or equal to max_amount'
    )
  end;

end;

drop trigger if exists account_mutation_trigger;

create trigger account_mutation_trigger
after
insert
  on account_mutation for each row begin with mutation as (
    select
      account.code as code,
      account.name as name,
      account.account_type_name as account_type_name,
      account.balance as balance,
      case
        when account_type.increased_by = 'debit' then 1
        else -1
      end * new.amount as mutation_amount
    from
      account_mutation
      left join account on account.code = account_mutation.debit_account_code
      left join account_type on account_type.name = account.account_type_name
    where
      account_mutation.id = new.id
    union
    select
      account.code as code,
      account.name as name,
      account.account_type_name as account_type_name,
      account.balance as balance,
      case
        when account_type.increased_by = 'credit' then 1
        else -1
      end * new.amount as mutation_amount
    from
      account_mutation
      left join account on account.code = account_mutation.credit_account_code
      left join account_type on account_type.name = account.account_type_name
    where
      account_mutation.id = new.id
  )
insert into
  account (code, name, account_type_name, balance)
select
  mutation.code,
  mutation.name,
  mutation.account_type_name,
  mutation.balance + mutation.mutation_amount -- we can add negative balance validation here if needed.
from
  mutation on conflict do
update
set
  balance = balance + mutation.balance + mutation.mutation_amount;

end;

drop trigger if exists purchase_creation_validation_trigger;

create trigger purchase_creation_validation_trigger before
insert
  on purchase for each row begin
select
  case
    when new.account_post_time is not null then raise(
      rollback,
      'account_post_time must be null'
    )
  end;

end;

drop trigger if exists purchase_account_posting_validation_trigger;

create trigger purchase_account_posting_validation_trigger before
update
  on purchase for each row
  when new.account_post_time is not null begin
select
  case
    when old.account_post_time is not null then raise(
      rollback,
      'account_post_time cannot be updated'
    )
  end;

end;

drop trigger if exists purchase_account_posting_trigger;

create trigger purchase_account_posting_trigger
after
update
  on purchase for each row
  when old.account_post_time is null
  and new.account_post_time is not null begin
insert into
  journal_entry (entry_time, description)
values
  (
    strftime('%s', 'now'),
    'pembelian barang dari: ' || (
      select
        supplier.name
      from
        supplier
      where
        supplier.id = new.supplier_id
    )
  );

insert into
  account_mutation (
    journal_entry_id,
    debit_account_code,
    credit_account_code,
    amount
  )
select
  last_insert_rowid(),
  case
    when product.cog_account_code is null then raise(rollback, 'product does not have account code')
    else product.cog_account_code
  end,
  new.payment_account_code,
  purchase_item.price
from
  purchase_item
  left join product on product.id = purchase_item.product_id
  left join account_setting on account_setting.id = 1
where
  purchase_item.purchase_id = new.id;

end;

drop trigger if exists purchase_inventory_trigger;

create trigger purchase_inventory_trigger
after
update
  on purchase for each row
  when old.account_post_time is null
  and new.account_post_time is not null begin
insert into
  product (
    id,
    name,
    unit_price,
    cog,
    stock,
    num_of_purchases
  )
select
  product.id,
  product.name,
  product.unit_price,
  product.cog,
  product.stock,
  count(purchase_item.purchase_id)
from
  purchase_item
  left join product on product.id = purchase_item.product_id
where
  purchase_item.purchase_id = new.id
group by
  product.id on conflict do
update
set
  cog = product.cog + purchase_item.price,
  stock = product.stock + purchase_item.quantity,
  num_of_purchases = product.num_of_purchases + count(purchase_item.purchase_id);

end;

drop trigger if exists sale_creation_trigger;

create trigger sale_creation_trigger
after
insert
  on sale for each row begin
insert into
  product (id, name, unit_price, pending_stock_diff)
select
  product.id,
  product.name,
  product.unit_price,
  product.pending_stock_diff - sale_item.quantity
from
  sale_item
  left join product on product.id = sale_item.product_id
where
  sale_item.sale_id = new.id;

end;

drop trigger if exists pos_session_creation_validation_trigger;

create trigger pos_session_creation_validation_trigger before
insert
  on pos_session for each row begin
select
  case
    when new.account_post_time is not null then raise(
      rollback,
      'account_post_time must be null'
    )
  end;

end;

drop trigger if exists pos_session_account_posting_validation_trigger;

create trigger pos_session_account_posting_validation_trigger before
update
  on pos_session for each row
  when new.account_post_time is not null begin
select
  case
    when old.account_post_time is not null then raise(
      rollback,
      'account_post_time cannot be null after it is set'
    )
  end;

end;

drop trigger if exists pos_session_account_posting_trigger;

create trigger pos_session_account_posting_trigger
after
update
  on pos_session for each row
  when old.account_post_time is null
  and new.account_post_time is not null begin
insert into
  journal_entry (entry_time, description)
values
  (
    strftime('%s', 'now'),
    'pembukuan kasir oleh: ' || (
      select
        cashier.name
      from
        cashier
      where
        cashier.id = new.cashier_id
    )
  );

insert into
  account_mutation (
    journal_entry_id,
    debit_account_code,
    credit_account_code,
    amount
  ) -- entri akun harga pokok penjualan
select
  last_insert_rowid(),
  account_setting.cog_sold_account_code,
  case
    when product.cog_account_code is null then raise(rollback, 'produk tidak memiliki akun')
    else product.cog_account_code
  end,
  case
    when product.stock <= 0 then raise(rollback, 'stok barang tidak tersedia')
    else case
      when product.stock < sum(sale_item.quantity) then raise(rollback, 'stok barang tidak mencukupi')
      else product_account.balance * sum(sale_item.quantity) / product.stock
    end
  end
from
  sale_item
  left join sale on sale.id = sale_item.sale_id
  left join product on product.id = sale_item.product_id
  left join account as product_account on product_account.code = product.cog_account_code
  left join account_setting on account_setting.id = 1
where
  sale.pos_session_id = new.id
group by
  product.id -- entri akun penjualan
union
select
  last_insert_rowid(),
  sale.payment_account_code,
  account_setting.sales_account_code,
  sum(sale_item.price)
from
  sale_item
  left join sale on sale.id = sale_item.sale_id
  left join account_setting on account_setting.id = 1
where
  sale.pos_session_id = new.id
group by
  sale.id -- entri akun potongan penjualan
union
select
  last_insert_rowid(),
  account_setting.sales_discount_account_code,
  account_setting.sales_account_code,
  sum(sale_discount.applied_amount)
from
  sale_discount
  left join sale on sale.id = sale_discount.sale_id
  left join account_setting on account_setting.id = 1
where
  sale.pos_session_id = new.id
group by
  sale.pos_session_id
union
-- entri akun selisih kasir
select
  last_insert_rowid(),
  case
    when diff_balance > 0 then account_setting.cash_over_and_short_account_code
    else account_setting.sales_account_code
  end,
  case
    when diff_balance > 0 then account_setting.sales_account_code
    else account_setting.cash_over_and_short_account_code
  end,
  abs(diff_balance)
from
  (
    select
      case
        when psb.account_code is null then raise(
          rollback,
          'payment account code is not match with pos session balance'
        )
        else psb.account_code
      end as account_code,
      (psb.closing_balance - psb.opening_balance) - sum(sale_item.price) as diff_balance
    from
      sale
      left join pos_session_balance psb on sale.pos_session_id = psb.pos_session_id
      and psb.account_code = sale.payment_account_code
      left join sale_item on sale_item.sale_id = sale.id
    where
      sale.pos_session_id = new.id
    group by
      sale.pos_session_id,
      sale.payment_account_code
  ) as pos_balance
  left join account_setting on account_setting.id = 1
where
  pos_balance.diff_balance != 0;

end;

drop trigger if exists pos_session_inventory_trigger;

create trigger pos_session_inventory_trigger
after
update
  on pos_session for each row
  when old.account_post_time is null
  and new.account_post_time is not null begin with sold as (
    select
      product.id as id,
      product.name as name,
      product.unit_price as unit_price,
      product.stock as stock,
      product.cog as cog,
      (
        product.cog * sold_item.quantity / product.stock
      ) as cog_sold,
      sold_item.quantity as stock_sold,
      sold_item.num_of_sales as num_of_sales
    from
      (
        select
          sale_item.product_id as product_id,
          sum(sale_item.quantity) as quantity,
          count(sale_item.sale_id) as num_of_sales
        from
          sale_item
          left join sale on sale.id = sale_item.sale_id
        where
          sale.pos_session_id = new.id
      ) as sold_item
      left join product on product.id = sold_item.product_id
    group by
      product.id
  )
insert into
  product (id, name, unit_price, cog, stock, num_of_sales)
select
  id,
  name,
  unit_price,
  cog,
  case
    when stock <= 0 then raise(rollback, 'stok barang tidak tersedia')
    else case
      when stock < stock_sold then raise(rollback, 'stok barang tidak mencukupi')
      else stock - stock_sold
    end
  end,
  num_of_sales
from
  sold on conflict do
update
set
  cog = product.cog - sold.cog_sold,
  stock = product.stock - sold.stock_sold,
  pending_stock_diff = product.pending_stock_diff + sold.stock_sold,
  num_of_sales = product.num_of_sales + sold.num_of_sales;

end;

commit transaction;