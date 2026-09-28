/**
 * tests/unit/scan-driver.test.ts — WP-X3 clamd INSTREAM driver (ED-00E).
 * A fake clamd on a local port checks the wire format and each reply shape.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:net'
import { clamavScanDriver, parseClamdReply, resolveScanDriver } from '~~/server/services/_providers/scan'
import { initialScanStatus } from '~~/server/services/storage/asset-scan'
import { isWithheld } from '~~/server/services/storage/asset-urls'

let server: Server | null = null
afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())))

/** Fake clamd: collects the INSTREAM payload and answers with `reply`. */
function fakeClamd(reply: (payload: Buffer) => string): Promise<{ port: number, received: () => Buffer }> {
  let received = Buffer.alloc(0)
  return new Promise((resolve) => {
    server = createServer((sock) => {
      let buf = Buffer.alloc(0)
      sock.on('data', (d) => {
        buf = Buffer.concat([buf, d])
        const cmd = 'zINSTREAM\0'
        if (buf.length < cmd.length) return
        // Walk the length-prefixed chunks; a zero length ends the stream.
        let off = cmd.length
        const parts: Buffer[] = []
        while (off + 4 <= buf.length) {
          const len = buf.readUInt32BE(off)
          if (len === 0) {
            received = Buffer.concat(parts)
            sock.end(reply(received) + '\0')
            return
          }
          if (off + 4 + len > buf.length) return
          parts.push(buf.subarray(off + 4, off + 4 + len))
          off += 4 + len
        }
      })
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server!.address() as { port: number }
      resolve({ port: addr.port, received: () => received })
    })
  })
}

describe('clamd driver (WP-X3)', () => {
  it('streams the bytes in length-prefixed chunks and reads a clean verdict', async () => {
    const bytes = Buffer.alloc(150_000, 7) // > one 64 KB chunk
    const clamd = await fakeClamd(() => 'stream: OK')
    await expect(clamavScanDriver('127.0.0.1', clamd.port).scan(bytes)).resolves.toEqual({ clean: true })
    expect(clamd.received().equals(bytes)).toBe(true)
  })

  it('reports the signature for an infected stream', async () => {
    const clamd = await fakeClamd(() => 'stream: Eicar-Test-Signature FOUND')
    await expect(clamavScanDriver('127.0.0.1', clamd.port).scan(Buffer.from('X5O!P%@AP'))).resolves.toEqual({ clean: false, signature: 'Eicar-Test-Signature' })
  })

  it('throws on errors or an unreachable daemon (the job retries; never "clean")', async () => {
    const clamd = await fakeClamd(() => 'INSTREAM size limit exceeded. ERROR')
    await expect(clamavScanDriver('127.0.0.1', clamd.port).scan(Buffer.from('x'))).rejects.toThrow(/clamd/)
    await expect(clamavScanDriver('127.0.0.1', 1).scan(Buffer.from('x'))).rejects.toThrow()
    expect(() => parseClamdReply('')).toThrow(/clamd/)
  })

  it('resolves from CLAMD_HOST and sets the initial row status accordingly', () => {
    expect(resolveScanDriver({}).name).toBe('none')
    expect(resolveScanDriver({ CLAMD_HOST: 'clamav:3310' }).name).toBe('clamav')
    expect(initialScanStatus(resolveScanDriver({}))).toBe('skipped')
    expect(initialScanStatus(resolveScanDriver({ CLAMD_HOST: 'clamav' }))).toBe('pending')
  })

  it('withholds pending assets from everyone but the uploader, and infected from all', () => {
    expect(isWithheld('pending', 'u1', 'u1')).toBe(false)
    expect(isWithheld('pending', 'u1', 'u2')).toBe(true)
    expect(isWithheld('pending', 'u1', null)).toBe(true)
    expect(isWithheld('infected', 'u1', 'u1')).toBe(true)
    expect(isWithheld('clean', 'u1', 'u2')).toBe(false)
    expect(isWithheld('skipped', null, null)).toBe(false)
    expect(isWithheld(undefined, null, null)).toBe(false)
  })
})
