-- Cubory - Grundschema (siehe docs/licensing-architecture.md)

CREATE EXTENSION IF NOT EXISTS citext;

-- ── Nutzer ────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              citext UNIQUE NOT NULL,
  email_verified_at  timestamptz,
  password_hash      text NOT NULL,
  name               text NOT NULL,
  trial_started_at   timestamptz NOT NULL DEFAULT now(),
  trial_ends_at      timestamptz NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  last_login_at      timestamptz,
  deleted_at         timestamptz
);

-- ── Pläne & Entitlements ──────────────────────────────────────────────────
CREATE TABLE plans (
  id           text PRIMARY KEY,
  name         text NOT NULL,
  max_devices  int  NOT NULL DEFAULT 3
);

CREATE TABLE entitlements (
  key         text PRIMARY KEY,
  description text NOT NULL
);

CREATE TABLE plan_entitlements (
  plan_id         text NOT NULL REFERENCES plans(id),
  entitlement_key text NOT NULL REFERENCES entitlements(key),
  PRIMARY KEY (plan_id, entitlement_key)
);

-- ── Lizenzen ──────────────────────────────────────────────────────────────
CREATE TYPE license_kind AS ENUM ('trial','free','monthly','yearly','lifetime','enterprise');

CREATE TABLE licenses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id),
  plan_id       text NOT NULL REFERENCES plans(id),
  kind          license_kind NOT NULL,
  status        text NOT NULL DEFAULT 'active',
  starts_at     timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_active_license_per_user
  ON licenses(user_id) WHERE status = 'active';

-- ── Abos & Zahlungen ──────────────────────────────────────────────────────
CREATE TABLE subscriptions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES users(id),
  license_id               uuid NOT NULL REFERENCES licenses(id),
  provider                 text NOT NULL DEFAULT 'stripe',
  provider_customer_id     text NOT NULL,
  provider_subscription_id text UNIQUE,
  interval                 text NOT NULL,
  status                   text NOT NULL,
  cancel_at_period_end     boolean NOT NULL DEFAULT false,
  current_period_end       timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id),
  subscription_id     uuid REFERENCES subscriptions(id),
  provider            text NOT NULL DEFAULT 'stripe',
  provider_payment_id text UNIQUE NOT NULL,
  amount_cents        int NOT NULL,
  currency            text NOT NULL,
  status              text NOT NULL,
  paid_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE invoices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id),
  payment_id          uuid REFERENCES payments(id),
  provider_invoice_id text UNIQUE NOT NULL,
  number              text NOT NULL,
  pdf_url             text,
  amount_cents        int NOT NULL,
  currency            text NOT NULL,
  issued_at           timestamptz NOT NULL
);

-- ── Geräte ────────────────────────────────────────────────────────────────
CREATE TABLE devices (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id),
  name             text NOT NULL,
  os               text NOT NULL,
  fingerprint_hash text NOT NULL,
  app_version      text NOT NULL,
  activated_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  deactivated_at   timestamptz,
  UNIQUE (user_id, fingerprint_hash)
);
CREATE INDEX devices_fingerprint_idx ON devices(fingerprint_hash);

-- ── Sessions & Refresh-Tokens ─────────────────────────────────────────────
CREATE TABLE sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id),
  device_id  uuid REFERENCES devices(id),
  ip         inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE refresh_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id),
  token_hash text UNIQUE NOT NULL,
  family_id  uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_family_idx ON refresh_tokens(family_id);

-- ── E-Mail-Flows ──────────────────────────────────────────────────────────
CREATE TABLE email_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id),
  purpose    text NOT NULL,
  token_hash text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);

-- ── Webhooks & Audit ──────────────────────────────────────────────────────
CREATE TABLE webhook_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          text NOT NULL DEFAULT 'stripe',
  provider_event_id text UNIQUE NOT NULL,
  type              text NOT NULL,
  payload           jsonb NOT NULL,
  processed_at      timestamptz,
  error             text,
  received_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES users(id),
  actor      text NOT NULL,
  action     text NOT NULL,
  detail     jsonb,
  ip         inet,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_user_idx ON audit_logs(user_id, created_at DESC);

-- ── Seed: Pläne & Entitlements ────────────────────────────────────────────
INSERT INTO plans (id, name, max_devices) VALUES
  ('free',       'Cubory Free',       2),
  ('pro',        'Cubory Pro',        3),
  ('enterprise', 'Cubory Enterprise', 25);

INSERT INTO entitlements (key, description) VALUES
  ('measurements',     'Messwerkzeuge'),
  ('section_views',    'Schnittansichten'),
  ('exploded_views',   'Explosionsansichten'),
  ('export',           'Export'),
  ('batch',            'Batch-Export'),
  ('hires_screenshot', 'Hochauflösende Screenshots'),
  ('annotations',      'Anmerkungswerkzeuge'),
  ('commercial',       'Kommerzielle Nutzung'),
  ('cloud',            'Cloud-Features');

INSERT INTO plan_entitlements (plan_id, entitlement_key)
SELECT p.id, e.key FROM plans p CROSS JOIN entitlements e
WHERE p.id IN ('pro', 'enterprise');
