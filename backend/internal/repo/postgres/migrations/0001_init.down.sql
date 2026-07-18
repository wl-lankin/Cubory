DROP TABLE IF EXISTS audit_logs, webhook_events, email_tokens, refresh_tokens,
  sessions, devices, invoices, payments, subscriptions, licenses,
  plan_entitlements, entitlements, plans, users CASCADE;
DROP TYPE IF EXISTS license_kind;
