DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM status_pipeline_nodes WHERE requires_reason
  ) THEN
    RAISE EXCEPTION 'Cannot roll back status reason requirements while any status requires a reason';
  END IF;
  IF EXISTS (
    SELECT 1 FROM properties WHERE status NOT IN (
      'lead', 'scheduled', 'assessed', 'quoted', 'accepted', 'in_progress',
      'completed', 'deliverable_pending', 'deliverable_complete', 'invoiced',
      'paid', 'on_hold', 'cancelled'
    )
  ) THEN
    RAISE EXCEPTION 'Cannot roll back property statuses while custom property statuses exist';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM status_pipeline_nodes node
    JOIN status_pipelines pipeline ON pipeline.id = node.pipeline_id
    WHERE pipeline.entity_type = 'property'
      AND node.slug NOT IN (
        'lead', 'scheduled', 'assessed', 'quoted', 'accepted', 'in_progress',
        'completed', 'deliverable_pending', 'deliverable_complete', 'invoiced',
        'paid', 'on_hold', 'cancelled'
      )
  ) THEN
    RAISE EXCEPTION 'Cannot roll back property pipeline statuses while custom slugs exist';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM labels old_label
    JOIN labels new_label
      ON new_label.organization_id = old_label.organization_id
     AND new_label.namespace = old_label.namespace
     AND new_label.locale = old_label.locale
     AND new_label.key = CASE old_label.key
       WHEN 'deliverable_pending' THEN 'compliance_pending'
       WHEN 'deliverable_complete' THEN 'compliance_complete'
     END
    WHERE old_label.namespace = 'status.property'
      AND old_label.key IN ('deliverable_pending', 'deliverable_complete')
  ) THEN
    RAISE EXCEPTION 'Cannot roll back property status labels: a legacy override already exists';
  END IF;
END $$;
--> statement-breakpoint
UPDATE properties
SET status = CASE status
  WHEN 'deliverable_pending' THEN 'compliance_pending'
  WHEN 'deliverable_complete' THEN 'compliance_complete'
  ELSE status
END
WHERE status IN ('deliverable_pending', 'deliverable_complete');
--> statement-breakpoint
UPDATE status_pipeline_nodes node
SET slug = CASE node.slug
  WHEN 'deliverable_pending' THEN 'compliance_pending'
  WHEN 'deliverable_complete' THEN 'compliance_complete'
  ELSE node.slug
END,
label_key = CASE node.label_key
  WHEN 'status.property.deliverable_pending' THEN 'status.property.compliance_pending'
  WHEN 'status.property.deliverable_complete' THEN 'status.property.compliance_complete'
  ELSE node.label_key
END
FROM status_pipelines pipeline
WHERE pipeline.id = node.pipeline_id
  AND pipeline.entity_type = 'property'
  AND node.slug IN ('deliverable_pending', 'deliverable_complete');
--> statement-breakpoint
UPDATE status_pipeline_nodes node
SET allowed_transitions = (
  SELECT jsonb_agg(
    CASE transition.value
      WHEN 'deliverable_pending' THEN 'compliance_pending'
      WHEN 'deliverable_complete' THEN 'compliance_complete'
      ELSE transition.value
    END ORDER BY transition.ordinality
  )
  FROM jsonb_array_elements_text(node.allowed_transitions)
    WITH ORDINALITY AS transition(value, ordinality)
)
WHERE node.pipeline_id IN (
  SELECT id FROM status_pipelines WHERE entity_type = 'property'
)
  AND node.allowed_transitions ?| ARRAY['deliverable_pending', 'deliverable_complete'];
--> statement-breakpoint
UPDATE labels
SET key = CASE key
  WHEN 'deliverable_pending' THEN 'compliance_pending'
  WHEN 'deliverable_complete' THEN 'compliance_complete'
  ELSE key
END
WHERE namespace = 'status.property'
  AND key IN ('deliverable_pending', 'deliverable_complete');
--> statement-breakpoint
CREATE TYPE "public"."property_status" AS ENUM(
  'lead', 'scheduled', 'assessed', 'quoted', 'accepted', 'in_progress',
  'completed', 'compliance_pending', 'compliance_complete', 'invoiced',
  'paid', 'on_hold', 'cancelled'
);
--> statement-breakpoint
ALTER TABLE "properties"
ALTER COLUMN "status" SET DATA TYPE "public"."property_status"
USING "status"::"public"."property_status";
--> statement-breakpoint
ALTER TABLE "properties"
ALTER COLUMN "status" SET DEFAULT 'lead';
--> statement-breakpoint
ALTER TABLE "status_pipeline_nodes" DROP COLUMN "requires_reason";