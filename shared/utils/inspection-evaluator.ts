/**
 * shared/utils/inspection-evaluator.ts — pure evaluator for inspection
 * templates (Wave 2 / W2-2 / EH-F / ADR-0019).
 *
 * # Why this lives in shared/utils
 *
 * Per ADR-0008 we want a single, pure, dependency-free evaluator that
 * both the mock service and the real service can call, and that the
 * unit suite can hammer directly without booting Nuxt/Drizzle. The
 * shape is intentionally narrow: `(template, responses) → issues`.
 * Adding a new evaluator-rule `kind` is one switch arm here plus an
 * enum extension on the contract. NO schema migration is required.
 *
 * # Determinism
 *
 * Output ordering is deterministic — sections walked in `sortOrder`,
 * fields walked in `sortOrder`, repeatable-section instances walked in
 * lexical key order. The compliance UI relies on this to render a
 * stable list across re-fetches.
 *
 * # Decisions cast down
 *   - Throwing on unknown evaluator-rule kinds. Rejected — an older
 *     app should keep working against a newer template; unknown kinds
 *     short-circuit to "ok" so forward compatibility is preserved
 *     (mirrors the discussion in `inspection_template_fields.ts`).
 *   - Hard-coding severity. Each rule carries its own optional
 *     `severity`; we default to 'error' when omitted because the
 *     existing wildfire failures all surface as hard non-compliance.
 */
import type {
  EvaluatorRule,
  EvaluatorSeverity,
  InspectionTemplateWithSections,
} from '../contracts/inspection-template'
import type { InspectionIssue, InspectionResponse } from '../contracts/inspection'

interface ResponseLookup {
  /** `${sectionInstanceKey}::${fieldSlug}` → response */
  by: Record<string, InspectionResponse>
  /** All distinct sectionInstanceKeys observed, grouped by sectionSlug. */
  instancesBySection: Record<string, string[]>
}

function indexResponses(responses: readonly InspectionResponse[]): ResponseLookup {
  const by: Record<string, InspectionResponse> = {}
  const instancesBySection: Record<string, string[]> = {}
  for (const r of responses) {
    by[`${r.sectionInstanceKey}::${r.fieldSlug}`] = r
    // sectionInstanceKey is either `<slug>` or `<slug>-<n>`; split on the
    // final hyphen-number suffix to find the section it belongs to.
    const baseMatch = r.sectionInstanceKey.match(/^(.+?)(?:-(\d+))?$/u)
    const base = baseMatch?.[1] ?? r.sectionInstanceKey
    if (!instancesBySection[base]) instancesBySection[base] = []
    if (!instancesBySection[base]!.includes(r.sectionInstanceKey)) {
      instancesBySection[base]!.push(r.sectionInstanceKey)
    }
  }
  for (const k of Object.keys(instancesBySection)) {
    instancesBySection[k]!.sort()
  }
  return { by, instancesBySection }
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

function asScalar(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return null
}

function runRule(rule: EvaluatorRule, value: unknown): { ok: boolean; defaultMessage: string } {
  switch (rule.kind) {
    case 'required':
      return {
        ok: !isEmpty(value),
        defaultMessage: 'This field is required.',
      }
    case 'must_be_true':
      return {
        ok: value === true,
        defaultMessage: 'Must be set to "Yes".',
      }
    case 'must_be_false':
      return {
        ok: value === false,
        defaultMessage: 'Must be set to "No".',
      }
    case 'must_be_one_of': {
      if (isEmpty(value)) {
        return { ok: false, defaultMessage: 'Must be one of: ' + rule.allowed.join(', ') }
      }
      if (Array.isArray(value)) {
        return {
          ok: value.every((v) => rule.allowed.includes(String(v))),
          defaultMessage: 'Each selection must be one of: ' + rule.allowed.join(', '),
        }
      }
      const s = asScalar(value)
      return {
        ok: s !== null && rule.allowed.includes(s),
        defaultMessage: 'Must be one of: ' + rule.allowed.join(', '),
      }
    }
    case 'min': {
      const n = typeof value === 'number' ? value : Number(value)
      return {
        ok: Number.isFinite(n) && n >= rule.value,
        defaultMessage: `Must be at least ${rule.value}.`,
      }
    }
    case 'max': {
      const n = typeof value === 'number' ? value : Number(value)
      return {
        ok: Number.isFinite(n) && n <= rule.value,
        defaultMessage: `Must be at most ${rule.value}.`,
      }
    }
    default:
      // Unknown rule kind — forward-compat short-circuit.
      return { ok: true, defaultMessage: '' }
  }
}

/**
 * Walk a template against its responses and return one issue per failing
 * (instance, field, rule) triple. Pure; no I/O.
 */
export function evaluateInspection(
  template: InspectionTemplateWithSections,
  responses: readonly InspectionResponse[],
): InspectionIssue[] {
  const lookup = indexResponses(responses)
  const issues: InspectionIssue[] = []

  const sortedSections = [...template.sections].sort((a, b) => a.sortOrder - b.sortOrder)
  for (const section of sortedSections) {
    // Resolve instance keys: repeatable sections may have multiple; non-
    // repeatable sections always have a single key === sectionSlug. If
    // the inspector never touched the section, fall back to the slug so
    // required-field rules still fire.
    const instanceKeys =
      section.isRepeatable
        ? lookup.instancesBySection[section.slug] ?? []
        : [section.slug]

    // Section-level conditional: skip whole section unless the predicate
    // field elsewhere holds the configured value. Per the schema header
    // we look up the predicate within the same instance when present.
    const sortedFields = [...section.fields].sort((a, b) => a.sortOrder - b.sortOrder)

    for (const key of instanceKeys) {
      if (section.conditionalOnFieldSlug && section.conditionalOnValue !== null) {
        const pred = lookup.by[`${key}::${section.conditionalOnFieldSlug}`]
          ?? lookup.by[`${section.slug}::${section.conditionalOnFieldSlug}`]
        const predValue = asScalar(pred?.valueJson)
        if (predValue !== section.conditionalOnValue) continue
      }

      for (const field of sortedFields) {
        if (field.conditionalOnFieldSlug && field.conditionalOnValue !== null) {
          const pred = lookup.by[`${key}::${field.conditionalOnFieldSlug}`]
          const predValue = asScalar(pred?.valueJson)
          if (predValue !== field.conditionalOnValue) continue
        }
        const response = lookup.by[`${key}::${field.slug}`]
        const value = response?.valueJson ?? null

        // Required-by-flag: synthetic 'required' rule when field.required
        // is true but no evaluatorRule explicitly handles emptiness.
        if (field.required && isEmpty(value)) {
          const severity: EvaluatorSeverity =
            field.evaluatorRule?.severity ?? 'error'
          issues.push({
            sectionInstanceKey: key,
            sectionSlug: section.slug,
            fieldSlug: field.slug,
            severity,
            message: `${field.label} is required.`,
          })
          continue
        }

        if (!field.evaluatorRule) continue
        if (isEmpty(value) && field.evaluatorRule.kind !== 'required') {
          // No data + no required-by-flag → skip rule.
          continue
        }
        const { ok, defaultMessage } = runRule(field.evaluatorRule, value)
        if (ok) continue
        const severity: EvaluatorSeverity = field.evaluatorRule.severity ?? 'error'
        issues.push({
          sectionInstanceKey: key,
          sectionSlug: section.slug,
          fieldSlug: field.slug,
          severity,
          message: field.evaluatorRule.message ?? defaultMessage,
        })
      }
    }
  }
  return issues
}
