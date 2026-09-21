CREATE TABLE progress_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkpoint_date DATE NOT NULL,
  label TEXT NOT NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT progress_checkpoints_label_present CHECK (btrim(label) <> ''),
  CONSTRAINT progress_checkpoints_label_length CHECK (char_length(btrim(label)) <= 80),
  CONSTRAINT progress_checkpoints_notes_length CHECK (notes IS NULL OR char_length(notes) <= 2000)
);

CREATE INDEX progress_checkpoints_date_idx
  ON progress_checkpoints (checkpoint_date DESC, created_at DESC);
