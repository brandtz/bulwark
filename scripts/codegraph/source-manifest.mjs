/**
 * Content-addressed inputs and outputs for the approximate repository index.
 * The source manifest is written last so partial builds cannot appear current.
 * Missing or unreadable cache files are rebuildable, never a freshness signal.
 */
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const SKIP_DIRS = new Set(['node_modules', '.nuxt', '.output', 'dist', 'test-results', 'playwright-report'])

async function walk(dir, filter, out = []) {
  let entries
  try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return out }
  entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))
  for (const entry of entries) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) await walk(file, filter, out)
    } else if (filter(file)) {
      out.push(file)
    }
  }
  return out
}

const rel = (root, file) => path.relative(root, file).split(path.sep).join('/')
const hash = (content) => createHash('sha256').update(content).digest('hex')

export const OUTPUT_FILES = ['graph.json', 'INDEX.md', 'routes.md', 'components.md', 'services.md', 'coverage.md', 'work-packages.md']

async function getOutputManifest(root) {
  const entries = {}
  for (const name of OUTPUT_FILES) entries[name] = hash(await fs.readFile(path.join(root, 'agents', 'codegraph', name)))
  return entries
}

export async function writeSourceManifest(root, sources) {
  const outputs = await getOutputManifest(root)
  await fs.writeFile(path.join(root, 'agents', 'codegraph', 'source-manifest.json'), JSON.stringify({ version: 1, sources, outputs }, null, 1))
}

export async function readCurrentGraph(root, sources) {
  try {
    const directory = path.join(root, 'agents', 'codegraph')
    const manifest = JSON.parse(await fs.readFile(path.join(directory, 'source-manifest.json'), 'utf8'))
    if (manifest?.version !== 1 || !manifestsEqual(manifest.sources, sources ?? await getSourceManifest(root))) return null
    if (!manifestsEqual(manifest.outputs, await getOutputManifest(root))) return null
    const graph = JSON.parse(await fs.readFile(path.join(directory, 'graph.json'), 'utf8'))
    if (!Array.isArray(graph?.nodes) || !Array.isArray(graph?.edges) || !graph.stats) return null
    return graph
  } catch {
    return null
  }
}

export async function getSourceManifest(root) {
  const roots = [
    [path.join(root, 'app'), (file) => /\.(vue|ts)$/.test(file)],
    [path.join(root, 'shared'), (file) => file.endsWith('.ts')],
    [path.join(root, 'server'), (file) => file.endsWith('.ts')],
    [path.join(root, 'tests'), (file) => file.endsWith('.ts')],
    [path.join(root, 'agents', 'design', 'return'), (file) => /(?:SPEC\.md|(?:desktop|mobile|dark|states|tablet|INDEX)\.html)$/.test(file)],
    [path.join(root, 'agents', 'design', '01-SCREEN-INVENTORY.md'), (file) => file.endsWith('.md')],
    [path.join(root, 'agents', 'program'), (file) => file.endsWith('.json')],
    [path.join(root, 'scripts', 'codegraph'), (file) => file.endsWith('.mjs')],
    [path.join(root, 'package.json'), (file) => file.endsWith('package.json')],
  ]
  const files = []
  for (const [dir, filter] of roots) {
    if ((await fs.stat(dir).catch(() => null))?.isFile()) files.push(dir)
    else await walk(dir, filter, files)
  }
  const entries = {}
  for (const file of [...new Set(files)].sort()) entries[rel(root, file)] = hash(await fs.readFile(file))
  return entries
}

export function manifestsEqual(left, right) {
  const a = JSON.stringify(left ?? {})
  const b = JSON.stringify(right ?? {})
  return a === b
}
