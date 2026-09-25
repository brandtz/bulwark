ALTER TABLE "properties" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "properties" ALTER COLUMN "status" SET DATA TYPE text USING "status"::text;--> statement-breakpoint
ALTER TABLE "properties" ALTER COLUMN "status" SET DEFAULT 'lead';--> statement-breakpoint
ALTER TABLE "status_pipeline_nodes" ADD COLUMN "requires_reason" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM status_pipeline_nodes old_node
		JOIN status_pipeline_nodes new_node
			ON new_node.pipeline_id = old_node.pipeline_id
		 AND new_node.slug = CASE old_node.slug
			 WHEN 'compliance_pending' THEN 'deliverable_pending'
			 WHEN 'compliance_complete' THEN 'deliverable_complete'
		 END
		JOIN status_pipelines pipeline ON pipeline.id = old_node.pipeline_id
		WHERE pipeline.entity_type = 'property'
			AND old_node.slug IN ('compliance_pending', 'compliance_complete')
	) THEN
		RAISE EXCEPTION 'Cannot rename property status slugs: a target slug already exists in a pipeline';
	END IF;
	IF EXISTS (
		SELECT 1
		FROM labels old_label
		JOIN labels new_label
			ON new_label.organization_id = old_label.organization_id
		 AND new_label.namespace = old_label.namespace
		 AND new_label.locale = old_label.locale
		 AND new_label.key = CASE old_label.key
			 WHEN 'compliance_pending' THEN 'deliverable_pending'
			 WHEN 'compliance_complete' THEN 'deliverable_complete'
		 END
		WHERE old_label.namespace = 'status.property'
			AND old_label.key IN ('compliance_pending', 'compliance_complete')
	) THEN
		RAISE EXCEPTION 'Cannot rename property status labels: a target override already exists';
	END IF;
END $$;--> statement-breakpoint
UPDATE properties
SET status = CASE status
	WHEN 'compliance_pending' THEN 'deliverable_pending'
	WHEN 'compliance_complete' THEN 'deliverable_complete'
	ELSE status
END
WHERE status IN ('compliance_pending', 'compliance_complete');--> statement-breakpoint
UPDATE status_pipeline_nodes node
SET slug = CASE node.slug
	WHEN 'compliance_pending' THEN 'deliverable_pending'
	WHEN 'compliance_complete' THEN 'deliverable_complete'
	ELSE node.slug
END,
label_key = CASE node.label_key
	WHEN 'status.property.compliance_pending' THEN 'status.property.deliverable_pending'
	WHEN 'status.property.compliance_complete' THEN 'status.property.deliverable_complete'
	ELSE node.label_key
END
FROM status_pipelines pipeline
WHERE pipeline.id = node.pipeline_id
	AND pipeline.entity_type = 'property'
	AND node.slug IN ('compliance_pending', 'compliance_complete');--> statement-breakpoint
UPDATE status_pipeline_nodes node
SET allowed_transitions = (
	SELECT jsonb_agg(
		CASE transition.value
			WHEN 'compliance_pending' THEN 'deliverable_pending'
			WHEN 'compliance_complete' THEN 'deliverable_complete'
			ELSE transition.value
		END ORDER BY transition.ordinality
	)
	FROM jsonb_array_elements_text(node.allowed_transitions)
		WITH ORDINALITY AS transition(value, ordinality)
)
WHERE node.pipeline_id IN (
	SELECT id FROM status_pipelines WHERE entity_type = 'property'
)
	AND node.allowed_transitions ?| ARRAY['compliance_pending', 'compliance_complete'];--> statement-breakpoint
UPDATE labels
SET key = CASE key
	WHEN 'compliance_pending' THEN 'deliverable_pending'
	WHEN 'compliance_complete' THEN 'deliverable_complete'
	ELSE key
END
WHERE namespace = 'status.property'
	AND key IN ('compliance_pending', 'compliance_complete');--> statement-breakpoint
DROP TYPE "public"."property_status";