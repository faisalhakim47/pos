-- insert into journal_entry (entry_time, description)
-- values (strftime('%s', 'now'), 'Modal awal');
-- insert into account_mutation (journal_entry_id, debit_account_code, credit_account_code, amount)
-- select last_insert_rowid(), 1102, 3101, 1000000;

with new_journal_entry as
  insert into journal_entry (entry_time, description)
  values (strftime('%s', 'now'), 'Modal awal')
  returning id
insert into account_mutation (journal_entry_id, debit_account_code, credit_account_code, amount)
select id, 1102, 3101, 1000000
from new_journal_entry;

insert into product (name, sell_unit_price)
values
  ('Buku', 5000),
  ('Pensil', 1000);

insert into supplier (name)
values ('Penerbit Buku');

insert into purchase (purchase_time, supplier_id, payment_account_code)
values (strftime('%s', 'now'), 1, 1102);
with the_purchase as (
  select last_insert_rowid() as id
)
insert into purchase_item (purchase_id, product_id, quantity, price)
values
  ((select id from the_purchase), 1, 10, 40000),
  ((select id from the_purchase), 2, 10, 8000);

insert into customer (name)
values ('Pembeli Umum');

insert into cashier (name, password_hash)
values ('admin', 'admin');

insert into discount (name, begin_time, percentage, min_amount, max_amount)
values ('Diskon Pembukaan', strftime('%s', 'now') - 600, 2, 250, 1000);

insert into pos_session (cashier_id, opening_time, account_code, opening_balance)
values (1, strftime('%s', 'now'), 1101, 0);

insert into sale (sale_time, customer_id, pos_session_id)
values (strftime('%s', 'now'), 1, 1);
with last_sale as (
  select id from sale order by id desc limit 1
)
insert into sale_item (sale_id, product_id, quantity, price)
values
  ((select id from last_sale), 1, 2, 10000),
  ((select id from last_sale), 2, 2, 2000);

insert into sale (sale_time, customer_id, pos_session_id)
values (strftime('%s', 'now'), 1, 1);
with last_sale as (select id from sale order by id desc limit 1)
insert into sale_item (sale_id, product_id, quantity, price)
values
  ((select id from last_sale), 1, 1, 5000),
  ((select id from last_sale), 2, 1, 1000);
with last_sale as (select id from sale order by id desc limit 1)
insert into sale_discount (sale_id, discount_id, percentage, amount)
values ((select id from last_sale), 1, 2, 250);

update pos_session set closing_time = strftime('%s', 'now'), closing_balance = 30000, account_post_time = strftime('%s', 'now');
