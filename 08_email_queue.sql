-- 08_email_queue.sql
-- Cola de correos para envío masivo desde el panel admin

CREATE TABLE IF NOT EXISTS email_queue (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email      TEXT        NOT NULL,
  to_name       TEXT        NOT NULL,
  subject       TEXT        NOT NULL,
  body_html     TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'sent', 'failed')),
  category      TEXT        NOT NULL DEFAULT 'general',
  error_message TEXT,
  user_id       UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at       TIMESTAMPTZ
);

ALTER TABLE email_queue ENABLE ROW LEVEL SECURITY;

-- Solo admins pueden leer y gestionar la cola
CREATE POLICY "admin_all_email_queue" ON email_queue
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );
