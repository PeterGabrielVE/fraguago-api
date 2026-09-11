-- =====================================================================
-- Row-Level Security (RLS) para aislamiento multi-tenant.
-- =====================================================================

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'Attendance','AuditLog','Concept','EmergencyContact','Measurement',
    'MedicalProfile','Member','Membership','MembershipPlan','Product',
    'Profile','Routine','Sale','SaleItem','Schedule','Service',
    'StockMovement','Trainer','Transaction','User'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I;', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
      USING ("gymId" = current_setting('app.current_gym_id', true))
      WITH CHECK ("gymId" = current_setting('app.current_gym_id', true));
    $f$, t);
  END LOOP;
END $$;