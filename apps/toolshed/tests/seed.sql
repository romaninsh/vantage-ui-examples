-- Synthetic sample data (invented neighbours), seeded 2026-10-13.
-- 9 on loan (3 of them past due on 2026-10-13), 2 in repair, 14 available.
-- overdue starts false everywhere: the "Check overdue loans" action sets it.
INSERT INTO tool (name, category, status, borrower, due_on) VALUES
  ('Cordless drill (Makita 18V)',  'Power tools', 'on_loan',   'Helen Brierley',   '2026-10-17'),
  ('Hammer drill (Bosch)',         'Power tools', 'available', NULL,               NULL),
  ('Jigsaw',                       'Power tools', 'on_loan',   'Marcus Webb',      '2026-10-06'),
  ('Circular saw',                 'Power tools', 'repair',    NULL,               NULL),
  ('Orbital sander',               'Power tools', 'available', NULL,               NULL),
  ('Angle grinder',                'Power tools', 'available', NULL,               NULL),
  ('Wallpaper steamer',            'Decorating',  'on_loan',   'Aisha Khan',       '2026-10-15'),
  ('Paint roller set',             'Decorating',  'available', NULL,               NULL),
  ('Tile cutter',                  'Decorating',  'on_loan',   'Gareth Lloyd',     '2026-10-01'),
  ('Extension ladder (3.6 m)',     'Ladders',     'on_loan',   'Fiona McAllister', '2026-10-19'),
  ('Step ladder (5 tread)',        'Ladders',     'available', NULL,               NULL),
  ('Hedge trimmer (petrol)',       'Garden',      'on_loan',   'Dev Patel',        '2026-10-09'),
  ('Hedge trimmer (cordless)',     'Garden',      'available', NULL,               NULL),
  ('Lawn mower (push)',            'Garden',      'available', NULL,               NULL),
  ('Strimmer',                     'Garden',      'repair',    NULL,               NULL),
  ('Leaf blower',                  'Garden',      'on_loan',   'Siobhan Doyle',    '2026-10-20'),
  ('Lawn scarifier',               'Garden',      'available', NULL,               NULL),
  ('Pressure washer',              'Cleaning',    'on_loan',   'Ray Thompson',     '2026-10-14'),
  ('Carpet cleaner',               'Cleaning',    'available', NULL,               NULL),
  ('Wet and dry vacuum',           'Cleaning',    'available', NULL,               NULL),
  ('Socket set',                   'Hand tools',  'available', NULL,               NULL),
  ('Spirit level (1.2 m)',         'Hand tools',  'available', NULL,               NULL),
  ('Pipe wrench',                  'Hand tools',  'on_loan',   'Nadia Hussain',    '2026-10-16'),
  ('Sack truck',                   'Moving',      'available', NULL,               NULL),
  ('Wheelbarrow',                  'Moving',      'available', NULL,               NULL);
