ALTER TABLE "status_pipeline_nodes" DROP COLUMN IF EXISTS "wip_limit";
ALTER TABLE "properties" DROP COLUMN IF EXISTS "resume_on";
ALTER TABLE "properties" DROP COLUMN IF EXISTS "status_changed_at";
ALTER TABLE "properties" DROP COLUMN IF EXISTS "status_note";
ALTER TABLE "properties" DROP COLUMN IF EXISTS "status_reason";
ALTER TABLE "properties" DROP COLUMN IF EXISTS "assignee_user_id";
