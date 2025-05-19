-- SQLite 3.49.0
-- code style: Use lower case for all SQL keywords
-- code style: Use snake_case for table, column, table view, trigger names, anything.
-- business logic: This application only handle one currency. Multi-currency is not supported.
-- business logic: Use smallest currency denomination possible, e.g. cents, pennies, etc. Rounding to that denomination is accepted.
-- business logic: Ensure ALL insert and update statements are atomic. Use transactions to ensure atomicity.

pragma journal_mode = wal;
pragma foreign_keys = on;

begin exclusive transaction;

--- SCHEMA AND BUSINESS LOGIC ---

create table if not exists fiscal_year (
  name text primary key,
  start_time integer not null,
  end_time integer not null
);

create table if not exists fiscal_period (
  name text primary key,
  fiscal_year_name text not null,
  start_time integer not null,
  end_time integer not null,
  foreign key (fiscal_year_name) references fiscal_year (name)
);

create index if not exists fiscal_period_fiscal_year_name_index on fiscal_period (fiscal_year_name);

create table if not exists account_type (
  name text primary key,
  increase_on_debit integer not null default 0,
  increase_on_credit integer not null default 0
);

drop trigger if exists account_type_insert_validation_trigger;
create trigger account_type_insert_validation_trigger
before insert on account_type for each row
begin
  select
    case when new.increase_on_debit != 0 and new.increase_on_debit != 1 then
      raise(rollback, 'increase_on_debit must be 0 or 1')
    end,
    case when new.increase_on_credit != 0 and new.increase_on_credit != 1 then
      raise(rollback, 'increase_on_credit must be 0 or 1')
    end,
    case when new.increase_on_debit = new.increase_on_credit then
      raise(rollback, 'increase_on_debit and increase_on_credit must be different')
    end;
end;

create table if not exists account (
  code integer primary key,
  name text not null,
  account_type_name text not null,
  balance integer not null default 0, -- derivative data
  prent_account_code integer,
  foreign key (account_type_name) references account_type (name),
  foreign key (prent_account_code) references account (code)
  index account_type_name_index (account_type_name)
);

create index if not exists account_name_index on account (name);
create index if not exists account_prent_account_code_index on account (prent_account_code);

create table if not exists account_balance (
  account_code integer not null,
  fiscal_period_name text not null,
  opening_balance integer not null default 0,
  closing_balance integer not null default 0,
  primary key (account_code, fiscal_period_name),
  foreign key (account_code) references account (code),
  foreign key (fiscal_period_name) references fiscal_period (name)
);

create index if not exists account_balance_account_code_index on account_balance (account_code);
create index if not exists account_balance_fiscal_period_name_index on account_balance (fiscal_period_name);

create table if not exists journal_entry (
  ref integer not null primary key,
  fiscal_period_name text not null,
  transaction_time integer not null,
  note text,
  reversal_of_journal_entry_ref integer,
  correction_of_journal_entry_ref integer,
  post_time integer,
  foreign key (fiscal_period_name) references fiscal_period (name),
);

create index if not exists journal_entry_fiscal_period_name_index on journal_entry (fiscal_period_name);

drop trigger if exists journal_entry_insert_validation_trigger;
create trigger journal_entry_insert_validation_trigger
before insert on journal_entry for each row
begin
  select
    case when new.transaction_time < fiscal_period.start_time or new.transaction_time > fiscal_period.end_time then
      raise(rollback, 'transaction_time must be within fiscal period')
    end,
    case when new.post_time is not null then
      raise(rollback, 'post_time must be null')
    end
  from fiscal_period
  where fiscal_period.name = new.fiscal_period_name;
end;

drop trigger if exists journal_entry_unpost_preventation_trigger;
create trigger journal_entry_unpost_preventation_trigger
before update on journal_entry for each row
when old.post_time is not null
begin
  select
    case when new.post_time is not null then
      raise(rollback, 'Cannot unpost journal entry after journal entry is posted')
    end,
    case when old.post_time != new.post_time then
      raise(rollback, 'Cannot change post_time of journal entry')
    end;
end;

create table if not exists journal_entry_line (
  journal_entry_ref integer not null,
  order integer not null default 0,
  account_code integer not null,
  debit integer not null default 0,
  credit integer not null default 0,
  primary key (journal_entry_ref, order),
  foreign key (journal_entry_ref) references journal_entry (ref),
  foreign key (account_code) references account (code)
);

create index if not exists journal_entry_line_journal_entry_ref_index on journal_entry_line (journal_entry_ref);
create index if not exists journal_entry_line_account_code_index on journal_entry_line (account_code);

drop trigger if exists journal_entry_line_insert_validation_trigger;
create trigger journal_entry_line_insert_validation_trigger
before insert on journal_entry_line for each row
begin
  select
    case when new.debit < 0 then
      raise(rollback, 'debit must be greater than 0')
    end,
    case when new.credit < 0 then
      raise(rollback, 'credit must be greater than 0')
    end,
    case when new.debit = 0 and new.credit = 0 then
      raise(rollback, 'debit and credit cannot both be 0')
    end;
end;

drop trigger if exists journal_entry_post_validation_trigger;
create trigger journal_entry_post_validation_trigger
before update on journal_entry for each row
when old.post_time is null and new.post_time is not null
begin
  select
    case when sum(debit) != sum(credit) then
      raise(rollback, 'debit and credit must balance')
    end
  from journal_entry_line
  where journal_entry_ref = new.ref
end;

drop trigger if exists journal_entry_post_account_trigger;
create trigger journal_entry_post_account_trigger
after update on journal_entry for each row
when old.post_time is null and new.post_time is not null
begin
  with mutation as (
    select
      account.code as code,
      account.name as name,
      account.account_type_name as account_type_name,
      case when account_type.increase_on_debit = 1 then
        account.balance + sum(journal_entry_line.debit) - sum(journal_entry_line.credit)
      else
        account.balance + sum(journal_entry_line.credit) - sum(journal_entry_line.debit)
      end as balance
    from journal_entry_line
    left join account on journal_entry_line.account_code = account.code
    left join account_type on account.account_type_name = account_type.name
    where journal_entry_ref = new.ref
    group by journal_entry_line.account_code
  )
  insert into account (code, name, account_type_name, balance)
  select
    mutation.code as code,
    mutation.name as name,
    mutation.account_type_name as account_type_name,
    mutation.balance as balance
  from mutation
  on conflict do update set
    balance = mutation.balance;
end;

drop trigger if exists journal_entry_delete_preventation_trigger;
create trigger journal_entry_delete_preventation_trigger
before delete on journal_entry_line for each row
begin
  select
    case when journal_entry.post_time is not null then
      raise(rollback, 'Cannot delete journal entry line after journal entry is posted')
    end
  from journal_entry
  where journal_entry.ref = old.journal_entry_ref;
end;

--- PRIMARY DATA ---

insert into account_type (name, increase_on_debit, increase_on_credit)
values
  ('Asset', 1, 0),
  ('Expense', 1, 0),
  ('Liability', 0, 1),
  ('Equity', 0, 1),
  ('Revenue', 0, 1),
  ('Contra-Revenue', 1, 0),
  ('Contra-Asset', 0, 1)
on conflict do update set
  increase_on_debit = excluded.increase_on_debit,
  increase_on_credit = excluded.increase_on_credit;

commit transaction;
