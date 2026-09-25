/**
 * Isolated cache lifecycle tests using Node's built-in runner and temporary repos.
 * CLI scripts are copied so their repository-relative roots never touch live data.
 * Fixtures exercise content hashes, file enumeration, output repair and no-op sync.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { getSourceManifest, manifestsEqual, OUTPUT_FILES } from './source-manifest.mjs'

async function write(root, file, contents) {
  const target = path.join(root, file)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, contents)
}

async function fixture(context) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bulwark-codegraph-'))
  context.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.cp(path.dirname(fileURLToPath(import.meta.url)), path.join(root, 'scripts/codegraph'), { recursive: true })
  await write(root, 'agents/program/design-index.json', await fs.readFile(new URL('../../agents/program/design-index.json', import.meta.url), 'utf8'))
  await write(root, 'shared/contracts/services.ts', 'export interface BulwarkServices {\n}\n')
  await write(root, 'agents/program/work-packages.json', JSON.stringify({ packages: [] }))
  return root
}

function run(root, script, args = [], expectedStatus = 0) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/codegraph', script), ...args], { cwd: root, encoding: 'utf8' })
  assert.equal(result.status, expectedStatus, `${script} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`)
  return result.stdout
}

const readGraph = async (root) => JSON.parse(await fs.readFile(path.join(root, 'agents/codegraph/graph.json'), 'utf8'))

test('clean checkout without design root retains canonical IDs but never claims receipt', async (context) => {
  const root = await fixture(context)
  const registry = JSON.parse(await fs.readFile(new URL('../../agents/program/work-packages.json', import.meta.url), 'utf8'))
  const designs = [...new Set(registry.packages.flatMap((workPackage) => workPackage.designs ?? []))]
  const workPackage = { id: 'WP-TEST', status: 'todo', designs, files: [], tests: ['fixture'], acceptance: ['fixture'] }
  await write(root, 'agents/program/work-packages.json', JSON.stringify({ packages: [workPackage] }))
  run(root, 'build.mjs')
  run(root, 'check.mjs')
  await assert.rejects(fs.stat(path.join(root, 'agents/design')), { code: 'ENOENT' })
  const graph = await readGraph(root)
  for (const id of designs) {
    const design = graph.nodes.find((node) => node.id === `design:${id}`)
    assert.equal(design?.status, 'pending', id)
    assert.ok(design.title)
    assert.equal(design.spec, undefined)
  }
  assert.equal(graph.nodes.some((node) => node.type === 'design' && node.status === 'received'), false)
  await write(root, 'agents/program/work-packages.json', JSON.stringify({ packages: [{ ...workPackage, designs: ['SH-99'] }] }))
  run(root, 'build.mjs', ['--if-changed'])
  assert.match(run(root, 'check.mjs', [], 1), /unknown design SH-99/)
  await write(root, 'agents/program/work-packages.json', JSON.stringify({ packages: [{ ...workPackage, status: 'in-progress', designs: ['SH-01'] }] }))
  run(root, 'build.mjs', ['--if-changed'])
  assert.match(run(root, 'check.mjs', [], 1), /designs not received: SH-01/)
})

test('catalog-only permits active known designs without accepting or changing pending graph nodes', async (context) => {
  const root = await fixture(context)
  const dependency = { id: 'WP-DEP', status: 'done', designs: [], files: [], tests: ['fixture'], acceptance: ['fixture'] }
  const active = { ...dependency, id: 'WP-ACTIVE', status: 'in-progress', owner: 'fixture', designs: ['SH-00'], dependsOn: ['WP-DEP'], files: ['app/pages/notyetbuilt/**'] }
  for (const status of ['in-progress', 'review']) {
    await write(root, 'agents/program/work-packages.json', JSON.stringify({ packages: [dependency, { ...active, status }] }))
    run(root, 'build.mjs')
    const before = await fs.readFile(path.join(root, 'agents/codegraph/graph.json'), 'utf8')
    assert.match(run(root, 'check.mjs', [], 1), /designs not received: SH-00/)
    assert.match(run(root, 'check.mjs', ['--catalog-only']), /design-file acceptance NOT evaluated/)
    assert.equal(await fs.readFile(path.join(root, 'agents/codegraph/graph.json'), 'utf8'), before)
    assert.equal((await readGraph(root)).nodes.find((node) => node.id === 'design:SH-00')?.status, 'pending')
  }
  const invalid = [
    [{ ...active, designs: ['SH-99'] }, dependency, /unknown design SH-99/],
    [{ ...active, dependsOn: ['WP-MISSING'] }, dependency, /unknown dependency WP-MISSING/],
    [active, { ...dependency, status: 'todo' }, /depends on unfinished WP-DEP/],
  ]
  for (const [workPackage, prerequisite, message] of invalid) {
    await write(root, 'agents/program/work-packages.json', JSON.stringify({ packages: [prerequisite, workPackage] }))
    run(root, 'build.mjs')
    for (const args of [[], ['--catalog-only']]) assert.match(run(root, 'check.mjs', args, 1), message)
  }
})

test('catalog-only checks the real registry with all current statuses preserved', async (context) => {
  const root = await fixture(context)
  const registry = await fs.readFile(new URL('../../agents/program/work-packages.json', import.meta.url), 'utf8')
  await write(root, 'agents/program/work-packages.json', registry)
  run(root, 'build.mjs')
  assert.match(run(root, 'check.mjs', ['--catalog-only']), /design-file acceptance NOT evaluated/)
  assert.equal(await fs.readFile(path.join(root, 'agents/program/work-packages.json'), 'utf8'), registry)
  const graph = await readGraph(root)
  const designs = graph.nodes.filter((node) => node.type === 'design')
  assert.ok(designs.length)
  assert.ok(designs.every((node) => node.status === 'pending'))
  const activeWithoutDesignAhead = JSON.parse(registry).packages.some((workPackage) =>
    ['in-progress', 'review'].includes(workPackage.status) && workPackage.designs?.length && !workPackage.designAhead)
  if (activeWithoutDesignAhead) assert.match(run(root, 'check.mjs', [], 1), /designs not received/)
  else run(root, 'check.mjs')
})

test('catalog-only retains overlap, stale graph and done page coverage guards', async (context) => {
  const root = await fixture(context)
  const workPackage = { id: 'WP-FIRST', status: 'in-progress', owner: 'fixture', designs: [], files: ['app/pages/index.vue'], tests: ['fixture'], acceptance: ['fixture'] }
  await write(root, 'app/pages/index.vue', '<template><main /></template>')
  await write(root, 'agents/program/work-packages.json', JSON.stringify({ packages: [workPackage, { ...workPackage, id: 'WP-SECOND' }] }))
  run(root, 'build.mjs')
  for (const args of [[], ['--catalog-only']]) assert.match(run(root, 'check.mjs', args, 1), /both in-progress and overlap/)
  await write(root, 'agents/program/work-packages.json', JSON.stringify({ packages: [{ ...workPackage, status: 'done' }] }))
  run(root, 'build.mjs')
  for (const args of [[], ['--catalog-only']]) assert.match(run(root, 'check.mjs', args, 1), /has no e2e coverage/)
  await write(root, 'agents/program/work-packages.json', JSON.stringify({ packages: [workPackage] }))
  run(root, 'build.mjs')
  for (const args of [[], ['--catalog-only']]) run(root, 'check.mjs', args)
  await write(root, 'app/pages/index.vue', '<template><main>changed</main></template>')
  for (const args of [[], ['--catalog-only']]) run(root, 'check.mjs', args, 1)
})

test('catalog-only explicitly warns that done designs have not passed design-file acceptance', async (context) => {
  const root = await fixture(context)
  const workPackage = { id: 'WP-DONE', status: 'done', designs: ['SH-01'], files: [], tests: ['fixture'], acceptance: ['fixture'] }
  await write(root, 'agents/program/work-packages.json', JSON.stringify({ packages: [workPackage] }))
  run(root, 'build.mjs')
  assert.match(run(root, 'check.mjs', ['--catalog-only']), /WP-DONE is done: design-file acceptance NOT evaluated for SH-01/)
  assert.equal((await readGraph(root)).nodes.find((node) => node.id === 'design:SH-01')?.status, 'pending')
})

test('one-file edits, additions and deletions invalidate hashes regardless of timestamps', async (context) => {
  const root = await fixture(context)
  const file = 'app/pages/index.vue'
  await write(root, file, '<template><div data-testid="before" /></template>')
  run(root, 'build.mjs')
  const originalTime = (await fs.stat(path.join(root, file))).mtime
  await write(root, file, '<template><div data-testid="after" /></template>')
  await fs.utimes(path.join(root, file), originalTime, originalTime)
  run(root, 'check.mjs', [], 1)
  run(root, 'build.mjs', ['--if-changed'])
  assert.deepEqual((await readGraph(root)).nodes.find((node) => node.id === file).testIds, ['after'])
  run(root, 'check.mjs')
  const added = 'app/pages/added.vue'
  await write(root, added, '<template><div /></template>')
  run(root, 'check.mjs', [], 1)
  run(root, 'check.mjs', ['--repair'])
  assert.ok((await readGraph(root)).nodes.some((node) => node.id === added))
  await fs.unlink(path.join(root, added))
  run(root, 'check.mjs', [], 1)
  run(root, 'build.mjs', ['--if-changed'])
  assert.equal((await readGraph(root)).nodes.some((node) => node.id === added), false)
  run(root, 'check.mjs')
})

test('local SPEC, render and shell index presence controls received metadata', async (context) => {
  const root = await fixture(context)
  const screen = 'agents/design/return/design-return/A/screens/SH-01-login'
  const shell = 'agents/design/return/design-return/A/shell/INDEX.html'
  run(root, 'build.mjs')
  await write(root, `${screen}/SPEC.md`, '# SH-01 - Login\nRoute: /login\n')
  run(root, 'check.mjs', [], 1)
  run(root, 'build.mjs', ['--if-changed'])
  const design = async (id) => (await readGraph(root)).nodes.find((node) => node.id === `design:${id}`)
  assert.equal((await design('SH-01')).status, 'received')
  assert.deepEqual((await design('SH-01')).renders, [])
  for (const name of ['desktop.html', 'mobile.html', 'dark.html', 'states.html', 'tablet.html']) {
    await write(root, `${screen}/${name}`, '<main>fixture</main>')
    run(root, 'check.mjs', [], 1)
    run(root, 'build.mjs', ['--if-changed'])
    assert.deepEqual((await design('SH-01')).renders, [name])
    await fs.unlink(path.join(root, screen, name))
    run(root, 'check.mjs', [], 1)
    run(root, 'check.mjs', ['--repair'])
    assert.deepEqual((await design('SH-01')).renders, [])
  }
  await write(root, shell, '<main>shell fixture</main>')
  run(root, 'check.mjs', [], 1)
  run(root, 'build.mjs', ['--if-changed'])
  assert.equal((await design('SH-00')).status, 'received')
  await fs.unlink(path.join(root, shell))
  run(root, 'check.mjs', [], 1)
  run(root, 'check.mjs', ['--repair'])
  assert.equal((await design('SH-00')).status, 'pending')
  await fs.unlink(path.join(root, screen, 'SPEC.md'))
  run(root, 'check.mjs', [], 1)
  run(root, 'build.mjs', ['--if-changed'])
  assert.equal((await design('SH-01')).status, 'pending')
  run(root, 'check.mjs')
})

test('sync and repair recover missing or corrupt outputs and manifests', async (context) => {
  const root = await fixture(context)
  run(root, 'check.mjs', [], 1)
  run(root, 'check.mjs', ['--repair'])
  for (const command of [['build.mjs', '--if-changed'], ['check.mjs', '--repair']]) {
    for (const name of [...OUTPUT_FILES, 'source-manifest.json']) {
      for (const contents of [null, '{broken', '{}']) {
        const file = path.join(root, 'agents/codegraph', name)
        if (contents === null) await fs.unlink(file)
        else await fs.writeFile(file, contents)
        run(root, 'check.mjs', [], 1)
        run(root, command[0], command.slice(1))
        run(root, 'check.mjs')
      }
    }
  }
})

test('unchanged sync and repair do not write any generated files', async (context) => {
  const root = await fixture(context)
  run(root, 'build.mjs', ['--if-changed'])
  const snapshot = async () => Promise.all([...OUTPUT_FILES, 'source-manifest.json'].map(async (name) => {
    const file = path.join(root, 'agents/codegraph', name)
    return [name, await fs.readFile(file, 'utf8'), (await fs.stat(file)).mtimeMs]
  }))
  for (const name of [...OUTPUT_FILES, 'source-manifest.json']) {
    await fs.utimes(path.join(root, 'agents/codegraph', name), new Date(0), new Date(0))
  }
  const before = await snapshot()
  assert.match(run(root, 'build.mjs', ['--if-changed']), /no source changes/)
  run(root, 'check.mjs', ['--repair'])
  assert.deepEqual(await snapshot(), before)
})

test('manifest tracks render presence, contents and deletion without a design root', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bulwark-codegraph-'))
  context.after(() => fs.rm(root, { recursive: true, force: true }))
  assert.deepEqual(await getSourceManifest(root), {})
  for (const name of ['screens/SH-01/desktop.html', 'screens/SH-01/mobile.html', 'screens/SH-01/dark.html', 'screens/SH-01/states.html', 'screens/SH-01/tablet.html', 'shell/INDEX.html']) {
    const file = path.join(root, 'agents/design/return/design-return/A', name)
    const before = await getSourceManifest(root)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, 'first')
    const added = await getSourceManifest(root)
    assert.equal(manifestsEqual(before, added), false, name)
    await fs.writeFile(file, 'second')
    const edited = await getSourceManifest(root)
    assert.equal(manifestsEqual(added, edited), false, name)
    await fs.unlink(file)
    assert.deepEqual(await getSourceManifest(root), before)
  }
})