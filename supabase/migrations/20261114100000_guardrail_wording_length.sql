-- CEO feedback: a church's approved wording for an "Explain" topic (Communion, Baptism…) can be a
-- full statement with definitions and Scripture, longer than the old 4,000-character cap. The
-- assistant still answers guests in a short text drawn from it; the full statement is its source.
alter table public.church_doctrinal_positions
  drop constraint if exists church_doctrinal_positions_wording_check;

alter table public.church_doctrinal_positions
  add constraint church_doctrinal_positions_wording_check check (length(wording) <= 10000);
