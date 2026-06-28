ALTER TABLE extras
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'extras'
    CHECK (category IN ('extras', 'hula_munch_bar', 'servicios_adicionales'));
