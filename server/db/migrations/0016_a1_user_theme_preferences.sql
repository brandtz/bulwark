CREATE TYPE "public"."user_density_preference" AS ENUM('comfortable', 'compact', 'touch', 'auto');--> statement-breakpoint
CREATE TYPE "public"."user_theme_preference" AS ENUM('light', 'dark', 'system');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_prefs" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"theme" "user_theme_preference" DEFAULT 'system' NOT NULL,
	"density" "user_density_preference" DEFAULT 'auto' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "org_branding" ADD COLUMN "on_accent" text DEFAULT '#FFFFFF' NOT NULL;--> statement-breakpoint
CREATE FUNCTION pg_temp.bulwark_color_luminance(hex text) RETURNS double precision
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
	digits text := replace(hex, '#', '');
	red double precision;
	green double precision;
	blue double precision;
BEGIN
	IF length(digits) = 3 THEN
		digits := substring(digits, 1, 1) || substring(digits, 1, 1)
			|| substring(digits, 2, 1) || substring(digits, 2, 1)
			|| substring(digits, 3, 1) || substring(digits, 3, 1);
	END IF;
	red := get_byte(decode(substring(digits, 1, 2), 'hex'), 0) / 255.0;
	green := get_byte(decode(substring(digits, 3, 2), 'hex'), 0) / 255.0;
	blue := get_byte(decode(substring(digits, 5, 2), 'hex'), 0) / 255.0;
	red := CASE WHEN red <= 0.04045 THEN red / 12.92 ELSE power((red + 0.055) / 1.055, 2.4) END;
	green := CASE WHEN green <= 0.04045 THEN green / 12.92 ELSE power((green + 0.055) / 1.055, 2.4) END;
	blue := CASE WHEN blue <= 0.04045 THEN blue / 12.92 ELSE power((blue + 0.055) / 1.055, 2.4) END;
	RETURN red * 0.2126 + green * 0.7152 + blue * 0.0722;
END $$;--> statement-breakpoint
UPDATE org_branding
SET on_accent = CASE
	WHEN 1.05 / (pg_temp.bulwark_color_luminance(accent_color) + 0.05) >= 4.5 THEN '#FFFFFF'
	WHEN (greatest(pg_temp.bulwark_color_luminance(accent_color), pg_temp.bulwark_color_luminance('#161B22')) + 0.05)
		/ (least(pg_temp.bulwark_color_luminance(accent_color), pg_temp.bulwark_color_luminance('#161B22')) + 0.05) >= 4.5 THEN '#161B22'
	ELSE '#000000'
END;--> statement-breakpoint
DROP FUNCTION pg_temp.bulwark_color_luminance(text);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_prefs" ADD CONSTRAINT "user_prefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
