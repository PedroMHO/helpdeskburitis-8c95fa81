ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated can receive own channel" ON realtime.messages;
CREATE POLICY "authenticated can receive own channel"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (realtime.topic() = ('notifications:' || auth.uid()::text))
  OR (realtime.topic() = 'technician_status')
  OR (realtime.topic() LIKE 'tickets%')
);