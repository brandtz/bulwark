/**
 * server/services/_providers/scan.ts — malware scan drivers (WP-X3, ED-00E).
 *
 * - `clamav`: streams the bytes to a clamd daemon (CLAMD_HOST[:CLAMD_PORT],
 *   default port 3310) with the INSTREAM command — no client library needed.
 *   Response `stream: OK` = clean, `stream: <signature> FOUND` = infected;
 *   anything else (ERROR, size limit, timeout, connection refused) throws, so
 *   the job retries and the asset stays `pending` rather than being passed.
 * - `none`: no scanner configured; uploads are marked `skipped`.
 */
import { connect } from 'node:net'

export interface ScanVerdict {
  clean: boolean
  /** Signature name when infected. */
  signature?: string
}

export interface ScanDriver {
  name: 'clamav' | 'none'
  scan(bytes: Buffer): Promise<ScanVerdict>
}

export const noneScanDriver: ScanDriver = {
  name: 'none',
  async scan() {
    throw new Error('No scanner configured')
  },
}

const CHUNK = 64 * 1024
const TIMEOUT_MS = 30_000

/** Parse clamd's INSTREAM reply. Exported for tests. */
export function parseClamdReply(reply: string): ScanVerdict {
  const text = reply.replace(/\0/gu, '').trim()
  if (/^stream: OK$/u.test(text)) return { clean: true }
  const found = /^stream: (.+) FOUND$/u.exec(text)
  if (found) return { clean: false, signature: found[1]! }
  throw new Error(`clamd: ${text || 'empty reply'}`)
}

export function clamavScanDriver(host: string, port = 3310): ScanDriver {
  return {
    name: 'clamav',
    scan(bytes) {
      return new Promise<ScanVerdict>((resolve, reject) => {
        const socket = connect({ host, port })
        const chunks: Buffer[] = []
        const fail = (err: Error) => {
          socket.destroy()
          reject(err)
        }
        socket.setTimeout(TIMEOUT_MS, () => fail(new Error('clamd: timeout')))
        socket.on('error', fail)
        socket.on('data', (d) => chunks.push(d))
        socket.on('end', () => {
          try {
            resolve(parseClamdReply(Buffer.concat(chunks).toString('utf8')))
          } catch (err) {
            reject(err as Error)
          }
        })
        socket.on('connect', () => {
          socket.write('zINSTREAM\0')
          for (let off = 0; off < bytes.length; off += CHUNK) {
            const part = bytes.subarray(off, off + CHUNK)
            const len = Buffer.alloc(4)
            len.writeUInt32BE(part.length)
            socket.write(len)
            socket.write(part)
          }
          socket.write(Buffer.alloc(4)) // zero-length chunk ends the stream
        })
      })
    },
  }
}

/** CLAMD_HOST (host or host:port) → clamav; otherwise none. */
export function resolveScanDriver(env: Record<string, string | undefined> = process.env): ScanDriver {
  const raw = env.CLAMD_HOST?.trim()
  if (!raw) return noneScanDriver
  const [host, port] = raw.split(':')
  return clamavScanDriver(host!, port ? Number(port) : Number(env.CLAMD_PORT ?? 3310))
}
