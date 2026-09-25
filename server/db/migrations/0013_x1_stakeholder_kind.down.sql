BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM memberships WHERE role::text = 'stakeholder'
    UNION ALL
    SELECT 1 FROM pending_invites WHERE role::text = 'stakeholder'
    UNION ALL
    SELECT 1 FROM permissions WHERE role::text = 'stakeholder'
  ) THEN
    RAISE EXCEPTION 'Cannot roll back stakeholder role while stakeholder assignments, invites, or permissions exist';
  END IF;
END $$;

ALTER TABLE memberships DROP COLUMN stakeholder_kind;
DROP TYPE stakeholder_kind;

CREATE TYPE role_without_stakeholder AS ENUM (
  'super_admin',
  'org_admin',
  'org_manager',
  'field',
  'sub_contractor',
  'homeowner',
  'viewer',
  'insurance_representative'
);

ALTER TABLE memberships
  ALTER COLUMN role TYPE role_without_stakeholder USING role::text::role_without_stakeholder;
ALTER TABLE pending_invites
  ALTER COLUMN role TYPE role_without_stakeholder USING role::text::role_without_stakeholder;
ALTER TABLE permissions
  ALTER COLUMN role TYPE role_without_stakeholder USING role::text::role_without_stakeholder;

DROP TYPE role;
ALTER TYPE role_without_stakeholder RENAME TO role;

COMMIT;