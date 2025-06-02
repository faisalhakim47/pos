-- SQLite 3.49.0
-- style: Use lower case for all SQL keywords
-- style: Use snake_case for table, column, table view, trigger names, anything.
-- logic: This application only handle one currency. Multi-currency is not supported.
-- logic: All times are stored as Unix timestamp in seconds.
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
    case
      when new.post_time is not null
      then raise(rollback, 'journal entry must be unposted at the time of creation')
    end;
end;

drop trigger if exists journal_entry_update_preventation_trigger;
create trigger journal_entry_update_preventation_trigger
before update on journal_entry for each row
begin
  select
    case
      when old.post_time is not null
        and (
          old.post_time != new.post_time
          or old.transaction_time != new.transaction_time
          or old.reversal_of_journal_entry_ref != new.reversal_of_journal_entry_ref
          or old.correction_of_journal_entry_ref != new.correction_of_journal_entry_ref
        )
      then raise(rollback, 'make reversal/correction journal entry instead of updating posted journal entry')
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

drop trigger if exists journal_entry_post_validation_trigger;
create trigger journal_entry_post_validation_trigger
before update on journal_entry for each row
when old.post_time is null and new.post_time is not null
begin
  select
    case
      when sum(debit) <= 0
      then raise(rollback, 'sum of debit on journal entry must be greater than zero')
    end,
    case
      when sum(credit) <= 0
      then raise(rollback, 'sum of credit on journal entry must be greater than zero')
    end,
    case
      when sum(debit) != sum(credit)
      then raise(rollback, 'sum of debit and credit on journal entry must balance')
    end
  from journal_entry_line
  where journal_entry_ref = new.ref;
end;

drop trigger if exists journal_entry_post_account_trigger;
create trigger journal_entry_post_account_trigger
after update on journal_entry for each row
when old.post_time is null and new.post_time is not null
begin
  update account
  set balance = (
    select coalesce(sum(
      case
        when increase_on_debit = 1
        then debit - credit
        when increase_on_credit = 1
        then credit - debit
      end
    ), 0)
    from journal_entry_line
    join journal_entry on ref = journal_entry_ref
    join account_type on account_type.name = account.account_type_name
    where account_code = account.code
      and journal_entry.post_time is not null
  )
  where code in (
    select account_code
    from journal_entry_line
    where journal_entry_ref = new.ref
  );
end;

drop trigger if exists journal_entry_delete_preventation_trigger;
create trigger journal_entry_delete_preventation_trigger
before delete on journal_entry_line for each row
begin
  select
    case
      when journal_entry.post_time is not null
      then raise(rollback, 'make reversal/correction journal entry instead of deleting posted journal entry')
    end
  from journal_entry
  where journal_entry.ref = old.journal_entry_ref;
end;

create view if not exists journal_entry_summary as
select
  je.ref,
  je.transaction_time,
  jel.line_number,
  jel.account_code,
  jel.debit,
  jel.credit
from journal_entry_line as jel
join journal_entry as je on jel.journal_entry_ref = je.ref
where je.post_time is not null;

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

drop trigger if exists fiscal_year_config_delete_preventation_trigger;
create trigger fiscal_year_config_delete_preventation_trigger
before delete on fiscal_year_config for each row
begin
  select raise(rollback, 'fiscal year must have a configuration');
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
  fy.begin_time,
  fy.end_time,
  a.code as account_code,
  a.parent_account_code,
  sum(jes.debit) as sum_of_debit,
  sum(jes.credit) as sum_of_credit
from fiscal_year as fy
join journal_entry_summary as jes
  on jes.transaction_time >= fy.begin_time
  and jes.transaction_time < fy.end_time
join account as a on a.code = jes.account_code
group by fy.begin_time, jes.account_code;

drop trigger if exists fiscal_year_insert_validation_trigger;
create trigger fiscal_year_insert_validation_trigger
before insert on fiscal_year for each row
begin
  select
    case
      when new.post_time is not null
      then raise(rollback, 'fiscal year must be unposted at the time of creation')
    end,
    case
      when new.begin_time != coalesce(last_end_time, default_end_time)
      then raise(rollback, 'begin_time must be the same as last fiscal year end_time')
    end
  from (select 0 as default_end_time)
  join (
    select end_time as last_end_time
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
    case
      when old.post_time is not null
      then raise(rollback, 'cannot update posted fiscal year')
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
    0,
    account_code,
    sum_of_credit - sum_of_debit,
    0
  from fiscal_year_config, fiscal_year_account_mutation
  where parent_account_code = revenue_account_code and account_code is not null
  union all
  select
    last_insert_rowid(),
    1,
    income_summary_account_code,
    0,
    sum(sum_of_credit) - sum(sum_of_debit)
  from fiscal_year_config, fiscal_year_account_mutation
  where parent_account_code = revenue_account_code and account_code is not null;
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
  (3041, 'Owner Dividends', 'Dividends', 0, 3040),
  (4000, 'Revenue', 'Revenue', 0, null),
  (4100, 'Sales Revenue', 'Revenue', 0, 4000),
  (4200, 'Contra-Revenue', 'Contra-Revenue', 0, null),
  (4210, 'Sales Discounts', 'Contra-Revenue', 0, 4200),
  (5000, 'Expense', 'Expense', 0, null),
  (5020, 'Operating Expense', 'Expense', 0, 5000)
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
