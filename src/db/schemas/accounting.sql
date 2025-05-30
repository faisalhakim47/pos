-- SQLite 3.49.0
-- style: Use lower case for all SQL keywords
-- style: Use snake_case for table, column, table view, trigger names, anything.
-- logic: This application only handle one currency. Multi-currency is not supported.
-- logic: Use smallest currency denomination possible, e.g. cents, pennies, etc. Currency uses signed int 64. Truncation towards zero is acceptable.
-- logic: Ensure ALL insert and update statements are atomic. Use transactions to ensure atomicity.
-- logic: SQL Delete statements are not allowed in accounting schema. Use adjustment journal entries instead.

pragma journal_mode = wal;
pragma foreign_keys = on;

begin exclusive transaction;

--- SCHEMA AND BUSINESS LOGIC ---

create table if not exists account_type (
  name text primary key,
  increase_on_debit integer not null default 0 check (increase_on_debit in (0, 1)),
  increase_on_credit integer not null default 0 check (increase_on_credit in (0, 1)),
  check (increase_on_debit != increase_on_credit)
) without rowid;

-- account hierarchy is only one level deep.
create table if not exists account (
  code integer primary key,
  name text not null,
  account_type_name text not null,
  balance integer not null default 0,
  parent_account_code integer,
  foreign key (account_type_name) references account_type (name) on update restrict on delete restrict,
  foreign key (parent_account_code) references account (code) on update restrict on delete restrict
);

create index if not exists account_type_name_index on account (account_type_name);

create index if not exists account_name_index on account (name);
create index if not exists account_parent_account_code_index on account (parent_account_code);

drop trigger if exists account_insert_validation_trigger;
create trigger account_insert_validation_trigger
before insert on account for each row
begin
  select
    case when new.account_type_name not in (select name from account_type) then
      raise(rollback, 'account type must be one of the predefined account types')
    end
  from account;
end;

create table if not exists journal_entry (
  ref integer primary key,
  transaction_time integer not null,
  note text,
  reversal_of_journal_entry_ref integer,
  correction_of_journal_entry_ref integer,
  post_time integer,
  foreign key (reversal_of_journal_entry_ref) references journal_entry (ref) on update restrict on delete restrict,
  foreign key (correction_of_journal_entry_ref) references journal_entry (ref) on update restrict on delete restrict
);

create index if not exists journal_entry_transaction_time_index on journal_entry (transaction_time);

drop trigger if exists journal_entry_insert_validation_trigger;
create trigger journal_entry_insert_validation_trigger
before insert on journal_entry for each row
begin
  select
    case when new.post_time is not null then
      raise(rollback, 'post_time must be null')
    end;
end;

drop trigger if exists journal_entry_unpost_preventation_trigger;
create trigger journal_entry_unpost_preventation_trigger
before update on journal_entry for each row
begin
  select
    case when old.post_time is not null and old.post_time != new.post_time then
      raise(rollback, 'cannot unpost journal entry after journal entry is posted')
    end;
end;

create table if not exists journal_entry_line (
  journal_entry_ref integer not null,
  line_number integer not null default 0,
  account_code integer not null,
  debit integer not null default 0 check (debit >= 0),
  credit integer not null default 0 check (credit >= 0),
  primary key (journal_entry_ref, line_number),
  foreign key (journal_entry_ref) references journal_entry (ref) on update restrict on delete restrict,
  foreign key (account_code) references account (code) on update restrict on delete restrict
) without rowid;

create index if not exists journal_entry_line_journal_entry_ref_index on journal_entry_line (journal_entry_ref);
create index if not exists journal_entry_line_account_code_index on journal_entry_line (account_code);

drop trigger if exists journal_entry_line_insert_validation_trigger;
create trigger journal_entry_line_insert_validation_trigger
before insert on journal_entry_line for each row
begin
  select
    case when exists (select 1 from account as child where child.parent_account_code = new.account_code) then
      raise(rollback, 'cannot use parent account, please use specific account.')
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
  where journal_entry_ref = new.ref;
end;

drop trigger if exists journal_entry_post_account_trigger;
create trigger journal_entry_post_account_trigger
after update on journal_entry for each row
when old.post_time is null and new.post_time is not null
begin
  insert into account (code, name, account_type_name, balance)
  select
    account.code,
    account.name,
    account.account_type_name,
    case when account_type.increase_on_debit = 1 then
      account.balance + sum(journal_entry_line.debit) - sum(journal_entry_line.credit)
    else
      account.balance + sum(journal_entry_line.credit) - sum(journal_entry_line.debit)
    end
  from journal_entry_line
  left join account on journal_entry_line.account_code = account.code
  left join account_type on account.account_type_name = account_type.name
  where journal_entry_ref = new.ref
  group by journal_entry_line.account_code
  on conflict (code) do update set
    balance = excluded.balance;
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

create table if not exists fiscal_year_config (
  id integer primary key default 1 check (id = 1),
  revenue_account_code integer not null,
  contra_revenue_account_code integer not null,
  expense_account_code integer not null,
  income_summary_account_code integer not null,
  dividend_account_code integer not null,
  retained_earnings_account_code integer not null,
  foreign key (revenue_account_code) references account (code) on update restrict on delete restrict,
  foreign key (contra_revenue_account_code) references account (code) on update restrict on delete restrict,
  foreign key (expense_account_code) references account (code) on update restrict on delete restrict,
  foreign key (income_summary_account_code) references account (code) on update restrict on delete restrict,
  foreign key (dividend_account_code) references account (code) on update restrict on delete restrict,
  foreign key (retained_earnings_account_code) references account (code) on update restrict on delete restrict
);

drop trigger if exists fiscal_year_config_insert_validation_trigger;
create trigger fiscal_year_config_insert_validation_trigger
before insert on fiscal_year_config for each row
begin
  select
    case when revenue_account.parent_account_code is not null then
      raise(rollback, 'cannot use specific revenue account, please use parent account.')
    end,
    case when contra_revenue_account.parent_account_code is not null then
      raise(rollback, 'cannot use specific contra-revenue account, please use parent account.')
    end,
    case when expense_account.parent_account_code is not null then
      raise(rollback, 'cannot use specific expense account, please use parent account.')
    end
  from (
    select parent_account_code
    from account
    where code = new.revenue_account_code
  ) as revenue_account, (
    select parent_account_code
    from account
    where code = new.contra_revenue_account_code
  ) as contra_revenue_account, (
    select parent_account_code
    from account
    where code = new.expense_account_code
  ) as expense_account;
end;

drop trigger if exists fiscal_year_config_update_validation_trigger;
create trigger fiscal_year_config_update_validation_trigger
before update on fiscal_year_config for each row
begin
  select
    case when new.id != old.id then
      raise(rollback, 'fiscal year can only have one configuration')
    end;
end;

drop trigger if exists fiscal_year_config_delete_preventation_trigger;
create trigger fiscal_year_config_delete_preventation_trigger
before delete on fiscal_year_config for each row
begin
  select
    case when old.id != 1 then
      raise(rollback, 'fiscal year can only have one configuration')
    end;
end;

-- In accounting principles, fiscal year must be 12 months long. In this app we dont enforce it.
-- We pass the responsibility on the user manage it. Sometimes exact 12 months is impossible to achieve for some businesses.
-- The journal entry timing rules: transaction_time >= begin_time and transaction_time < end_time
create table if not exists fiscal_year (
  begin_time integer primary key,
  end_time integer not null,
  post_time integer,
  check (begin_time < end_time)
);

create view if not exists fiscal_year_account_mutation as
select
  account.code as account_code,
  account.parent_account_code as parent_account_code,
  begin_time,
  end_time,
  sum(journal_entry_line.debit) as debit,
  sum(journal_entry_line.credit) as credit
from fiscal_year
left join (
  select
    journal_entry.transaction_time,
    journal_entry_line.*
  from journal_entry_line
  left join journal_entry on journal_entry.ref = journal_entry_line.journal_entry_ref
  where journal_entry.post_time is not null
) as journal_entry_line
  on journal_entry_line.transaction_time >= fiscal_year.begin_time
  and journal_entry_line.transaction_time < fiscal_year.end_time
left join account on account.code = journal_entry_line.account_code
group by fiscal_year.begin_time, account.code;

drop trigger if exists fiscal_year_insert_validation_trigger;
create trigger fiscal_year_insert_validation_trigger
before insert on fiscal_year for each row
begin
  select
    case when new.post_time is not null then
      raise(rollback, 'post_time must be null')
    end,
    case when new.begin_time != coalesce(last_fiscal_year.end_time, default_fiscal_year.end_time) then
      raise(rollback, 'begin_time must be the same as last fiscal year end_time')
    end
  from (select 0 as end_time) as default_fiscal_year
  left join (
    select end_time
    from fiscal_year
    order by end_time desc
    limit 1
  ) as last_fiscal_year;
end;

drop trigger if exists fiscal_year_post_preventation_trigger;
create trigger fiscal_year_post_preventation_trigger
before update on fiscal_year for each row
begin
  select
    case when old.post_time is not null and old.post_time != new.post_time then
      raise(rollback, 'cannot change post_time of fiscal year closing')
    end;
end;

drop trigger if exists fiscal_year_post_account_trigger;
create trigger fiscal_year_post_account_trigger
after update on fiscal_year for each row
when old.post_time is null and new.post_time is not null
begin
  -- revenue accounts closing
  insert into journal_entry (transaction_time) values (new.end_time);
  insert into journal_entry_line (
    journal_entry_ref,
    line_number,
    account_code,
    debit,
    credit
  )
  select
    last_insert_rowid(),
    row_number() - 1,
    account_code,
    fiscal_year_account_mutation.credit - fiscal_year_account_mutation.debit,
    0
  from fiscal_year_account_mutation, fiscal_year_config
  where parent_account_code in (
    fiscal_year_config.revenue_account_code
  )
  union all
  select
    last_insert_rowid(),
    count(account_code),
    fiscal_year_config.income_summary_account_code,
    0,
    sum(fiscal_year_account_mutation.credit) - sum(fiscal_year_account_mutation.debit)
  from fiscal_year_account_mutation, fiscal_year_config
  where parent_account_code in (
    fiscal_year_config.revenue_account_code
  );
  -- expense accounts closing
  insert into journal_entry (transaction_time) values (new.end_time);
  insert into journal_entry_line (
    journal_entry_ref,
    line_number,
    account_code,
    debit,
    credit
  )
  select
    last_insert_rowid(),
    row_number() - 1,
    account_code,
    0,
    fiscal_year_account_mutation.debit - fiscal_year_account_mutation.credit
  from fiscal_year_account_mutation, fiscal_year_config
  where parent_account_code in (
    fiscal_year_config.expense_account_code,
    fiscal_year_config.contra_revenue_account_code
  )
  union all
  select
    last_insert_rowid(),
    count(account_code),
    fiscal_year_config.income_summary_account_code,
    sum(fiscal_year_account_mutation.debit) - sum(fiscal_year_account_mutation.credit),
    0
  from fiscal_year_account_mutation, fiscal_year_config
  where parent_account_code in (
    fiscal_year_config.expense_account_code,
    fiscal_year_config.contra_revenue_account_code
  );
  -- dividend account rolling
  insert into journal_entry (transaction_time) values (new.end_time);
  insert into journal_entry_line (
    journal_entry_ref,
    line_number,
    account_code,
    debit,
    credit
  )
  select
    last_insert_rowid(),
    0,
    fiscal_year_config.dividend_account_code,
    0,
    sum(fiscal_year_account_mutation.debit) - sum(fiscal_year_account_mutation.credit)
  from fiscal_year_account_mutation, fiscal_year_config
  where parent_account_code in (
    fiscal_year_config.dividend_account_code
  )
  union all
  select
    last_insert_rowid(),
    1,
    fiscal_year_config.retained_earnings_account_code,
    fiscal_year_account_mutation.debit - fiscal_year_account_mutation.credit,
    0
  from fiscal_year_account_mutation, fiscal_year_config
  where parent_account_code in (
    fiscal_year_config.dividend_account_code
  );
  -- income summary account closing
  insert into journal_entry (transaction_time) values (new.end_time);
  insert into journal_entry_line (
    journal_entry_ref,
    line_number,
    account_code,
    debit,
    credit
  )
  select
    last_insert_rowid(),
    0,
    fiscal_year_config.income_summary_account_code,
    (
      select sum(fiscal_year_account_mutation.credit) - sum(fiscal_year_account_mutation.debit)
      from fiscal_year_account_mutation, fiscal_year_config
      where account_code in (
        fiscal_year_config.revenue_account_code
      )
    ) - (
      select sum(fiscal_year_account_mutation.debit) - sum(fiscal_year_account_mutation.credit)
      from fiscal_year_account_mutation, fiscal_year_config
      where account_code in (
        fiscal_year_config.expense_account_code,
        fiscal_year_config.contra_revenue_account_code
      )
    ),
    0
  from fiscal_year_config
  union all
  select
    last_insert_rowid(),
    1,
    fiscal_year_config.retained_earnings_account_code,
    0,
    (
      select sum(fiscal_year_account_mutation.credit) - sum(fiscal_year_account_mutation.debit)
      from fiscal_year_account_mutation, fiscal_year_config
      where account_code in (
        fiscal_year_config.revenue_account_code
      )
    ) - (
      select sum(fiscal_year_account_mutation.debit) - sum(fiscal_year_account_mutation.credit)
      from fiscal_year_account_mutation, fiscal_year_config
      where account_code in (
        fiscal_year_config.expense_account_code,
        fiscal_year_config.contra_revenue_account_code
      )
    )
  from fiscal_year_account_mutation, fiscal_year_config;
  -- post fiscal year closing journal entries
  update journal_entry
  set post_time = new.post_time
  where transaction_time = new.end_time
    and post_time is null;
end;

create table if not exists fiscal_period_report (
  id integer primary key autoincrement,
  report_time integer not null,
  prev_fiscal_period_report_id integer,
  foreign key (prev_fiscal_period_report_id) references fiscal_period_report (id) on update restrict on delete restrict
);

create table if not exists fiscal_period_balance (
  fiscal_period_report_id integer not null,
  account_code integer not null,
  balance integer not null,
  primary key (fiscal_period_report_id, account_code),
  foreign key (fiscal_period_report_id) references fiscal_period_report (id) on update restrict on delete restrict,
  foreign key (account_code) references account (code) on update restrict on delete restrict
) without rowid;

--- PRIMARY DATA ---

insert into account_type (name, increase_on_debit, increase_on_credit)
values
  ('Asset', 1, 0),
  ('Expense', 1, 0),
  ('Liability', 0, 1),
  ('Equity', 0, 1),
  ('Dividends', 1, 0),
  ('Revenue', 0, 1),
  ('Contra-Revenue', 1, 0),
  ('Contra-Asset', 0, 1)
on conflict do update set
  increase_on_debit = excluded.increase_on_debit,
  increase_on_credit = excluded.increase_on_credit;

insert into account (code, name, account_type_name, balance, parent_account_code)
values
  (1000, 'Asset', 'Asset', 0, null),
  (1010, 'Cash', 'Asset', 0, 1000),
  (3000, 'Equity', 'Equity', 0, null),
  (3010, 'Owner Equity', 'Equity', 0, 3000),
  (3020, 'Retained Earnings', 'Equity', 0, 3000),
  (3030, 'Income Summary', 'Equity', 0, 3000),
  (3040, 'Dividends', 'Dividends', 0, null),
  (4000, 'Revenue', 'Revenue', 0, null),
  (4200, 'Contra-Revenue', 'Contra-Revenue', 0, null),
  (5000, 'Expense', 'Expense', 0, null)
on conflict do update set
  name = excluded.name,
  account_type_name = excluded.account_type_name,
  parent_account_code = excluded.parent_account_code;

insert into fiscal_year_config (
  revenue_account_code,
  contra_revenue_account_code,
  expense_account_code,
  income_summary_account_code,
  dividend_account_code,
  retained_earnings_account_code
)
values (
  4000,
  4200,
  5000,
  3030,
  3040,
  3020
)
on conflict do update set
  revenue_account_code = excluded.revenue_account_code,
  contra_revenue_account_code = excluded.contra_revenue_account_code,
  expense_account_code = excluded.expense_account_code,
  income_summary_account_code = excluded.income_summary_account_code,
  dividend_account_code = excluded.dividend_account_code,
  retained_earnings_account_code = excluded.retained_earnings_account_code;

commit transaction;
