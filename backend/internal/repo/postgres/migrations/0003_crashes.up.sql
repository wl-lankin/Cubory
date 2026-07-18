CREATE TABLE crashes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_version text NOT NULL,
  platform text NOT NULL,
  process text NOT NULL,
  message text NOT NULL,
  stack text,
  received_at timestamptz NOT NULL DEFAULT now()
);
