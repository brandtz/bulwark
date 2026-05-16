#!/usr/bin/env node
/**
 * scripts/scan-secrets.mjs — W5-2 / ADR-0036
 *
 * # What this file does
 *   - Walks `git ls-files` output and greps each tracked file for
 *     credential-shaped patterns (Stripe keys, AWS keys, long
 *     hex/base64 tokens after `password|secret|apiKey|token`, DB
 *     connection strings with embedded credentials, etc).
 *   - Skips files in `/demo/`, `/boilerplate/`, `/tests/`,
 *     `/agents/` (handoffs/ADRs reference sample patterns in prose),
 *     `/docs/`, `.md` / `.sql` / `.json` files, and `.env.example`.
 *   - Exits 0 when no findings, 1 otherwise. Prints one line per hit
 *     in the form `path:line: <classification>` so downstream tooling
 *     can chain on it.
 *
 * # Decisions (ADR-0008, ADR-0036)
 *   - **Read-only.** No remediation, no rewriting. Ops + agents
 *     decide what to do with hits.
 *   - **No deps.** Pure node:fs / node:child_process so this script
 *     runs on any machine that can run the rest of the repo.
 *   - **Allow-list, not deny-list.** We accept that the
 *     classification list is approximate; the cost of a false
 *     positive is a one-line waiver on a code review.
 *   - **Not wired to CI yet.** Ops chooses whether to bolt this onto
 *     pre-commit / GitHub Actions. The handoff documents that
 *     decision as outstanding.
 *
 * # Usage
 *   pnpm node scripts/scan-secrets.mjs
 *   # CI mode (exit non-zero on hit):
 *   pnpm node scripts/scan-secrets.mjs --strict
 */
import { execSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { extname } from 'node:path'

const STRICT = process.argv.includes('--strict')

const SKIP_PREFIXES = [
  'demo/',
  'boilerplate/',
  'tests/',
  'agents/',
  'docs/',
  'public/',
  '.github/',
]
const SKIP_EXTS = new Set([
  '.md',
  '.sql',
  '.json',
  '.lock',
  '.yaml',
  '.yml',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.webp',
])
const SKIP_EXACT = new Set([
  '.env.example',
  '.gitignore',
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
])

/** [name, pattern, classification] */
const RULES = [
  ['stripe-secret', /\bsk_(test|live)_[A-Za-z0-9]{20,}\b/g, 'stripe-secret-key'],
  ['stripe-publishable', /\bpk_(test|live)_[A-Za-z0-9]{20,}\b/g, 'stripe-publishable-key'],
  ['aws-access-key', /\bAKIA[0-9A-Z]{16}\b/g, 'aws-access-key-id'],
  [
    'long-jwt',
    /\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    'jwt-like-token',
  ],
  [
    'connection-string-with-creds',
    /\b(postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s'"`]*:[^\s'"`@]+@/gi,
    'db-connection-with-credentials',
  ],
  [
    'literal-assigned-secret',
    /\b(?:apiKey|api_key|secret(?:Key|Value)?|authToken|auth_token|accessKey|access_key|password)\s*[:=]\s*['"][A-Za-z0-9_\-+/=]{16,}['"]/g,
    'hardcoded-credential-literal',
  ],
]

function listFiles() {
  const out = execSync('git ls-files', { encoding: 'utf8' })
  return out.split(/\r?\n/).filter(Boolean)
}

function shouldSkip(path) {
  if (SKIP_EXACT.has(path)) return true
  if (SKIP_PREFIXES.some((p) => path.startsWith(p))) return true
  if (SKIP_EXTS.has(extname(path).toLowerCase())) return true
  // Skip the scanner itself.
  if (path === 'scripts/scan-secrets.mjs') return true
  try {
    if (statSync(path).size > 1024 * 1024) return true // >1MB
  } catch {
    return true
  }
  return false
}

function* findHits(path, content) {
  const lines = content.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const [, pattern, classification] of RULES) {
      pattern.lastIndex = 0
      if (pattern.test(line)) {
        yield { path, line: i + 1, classification, snippet: line.trim().slice(0, 160) }
      }
    }
  }
}

function main() {
  const files = listFiles()
  const hits = []
  for (const file of files) {
    if (shouldSkip(file)) continue
    let content
    try {
      content = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const hit of findHits(file, content)) hits.push(hit)
  }
  if (hits.length === 0) {
    console.log('scan-secrets: OK (0 hits)')
    process.exit(0)
  }
  for (const h of hits) {
    console.log(`${h.path}:${h.line}: ${h.classification} :: ${h.snippet}`)
  }
  console.error(`scan-secrets: ${hits.length} hit(s)`)
  process.exit(STRICT ? 1 : 0)
}

main()
