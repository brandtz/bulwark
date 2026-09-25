CREATE TYPE "public"."stakeholder_kind" AS ENUM('insurer', 'lender', 'hoa', 'property_manager', 'adjuster');--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM pg_enum e
		JOIN pg_type t ON t.oid = e.enumtypid
		JOIN pg_namespace n ON n.oid = t.typnamespace
		WHERE n.nspname = 'public'
			AND t.typname = 'role'
			AND e.enumlabel = 'insurance_representative'
	) THEN
		EXECUTE 'ALTER TYPE public.role RENAME VALUE ''insurance_representative'' TO ''stakeholder''';
	ELSIF NOT EXISTS (
		SELECT 1
		FROM pg_enum e
		JOIN pg_type t ON t.oid = e.enumtypid
		JOIN pg_namespace n ON n.oid = t.typnamespace
		WHERE n.nspname = 'public'
			AND t.typname = 'role'
			AND e.enumlabel = 'stakeholder'
	) THEN
		EXECUTE 'ALTER TYPE public.role ADD VALUE ''stakeholder''';
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "stakeholder_kind" "stakeholder_kind";