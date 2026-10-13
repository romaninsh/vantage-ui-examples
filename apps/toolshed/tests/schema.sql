-- Toolshed: the Hartfield Tool Library's lending desk.
CREATE TABLE tool (
  id       INTEGER PRIMARY KEY,
  name     TEXT    NOT NULL,
  category TEXT    NOT NULL,
  status   TEXT    NOT NULL DEFAULT 'available'
                   CHECK (status IN ('available', 'on_loan', 'repair')),
  borrower TEXT,
  due_on   DATE,
  overdue  BOOLEAN NOT NULL DEFAULT 0,
  CHECK (status <> 'on_loan' OR (borrower IS NOT NULL AND due_on IS NOT NULL))
);
CREATE INDEX tool_name ON tool (name);
