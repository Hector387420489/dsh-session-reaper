/**
 * Host half of the session-reaper bundle.
 *
 * Deletes exactly one persisted Session log, then emits the same
 * `api-session/removed` relay the Session controller uses so every connected
 * page drops that row immediately. The route is the only entry point: the
 * Client calls it, and nothing else may.
 */
import { rm } from 'node:fs/promises'
import { basename, dirname } from 'node:path'

/** Route the Client posts a deletion request to. */
const ROUTE = '/__dsh/session-reaper/delete'

/** Canonical Session identity: a `session-<uuid>` directory name. */
const SESSION_ID = /^session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A canonical persisted generation file inside a Session-owned directory. */
const LOG_FILE = /^session(\.v\d+)?\.jsonl(\.zstd)?$/

/** Largest accepted request body; the only field is a Session id. */
const MAX_BODY_BYTES = 4096

export const inject = ['webServer', 'sessionPersistence']

/**
 * Answer one request with a JSON body and close it.
 * @param response - Response that owns the lifecycle.
 * @param status - HTTP status code.
 * @param body - JSON-serializable payload.
 */
function respond(response, status, body) {
  const text = JSON.stringify(body)
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.end(text)
}

/**
 * Read a bounded JSON request body.
 * @param request - Incoming request.
 * @returns The parsed body, or `undefined` when it is absent, oversized, or malformed.
 */
async function readBody(request) {
  const chunks = []
  let size = 0
  try {
    for await (const chunk of request) {
      size += chunk.length
      if (size > MAX_BODY_BYTES) return undefined
      chunks.push(chunk)
    }
  } catch {
    return undefined
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (text === '') return undefined
  try {
    const parsed = JSON.parse(text)
    return typeof parsed === 'object' && parsed !== null ? parsed : undefined
  } catch {
    return undefined
  }
}

/**
 * Ask every activity provider whether the Session still has work in flight.
 * @param ctx - Plugin context.
 * @param sessionId - Candidate Session identity.
 * @returns The reported activity items; empty when nothing is running.
 */
async function runningWork(ctx, sessionId) {
  const reported = await ctx.parallel(
    'workspace/session-activity',
    { sessionId },
    () => Promise.resolve([]),
  )
  return Array.isArray(reported) ? reported : []
}

/**
 * Delete one Session whose log this Host has persisted and that nothing is using.
 * @param ctx - Plugin context.
 * @param sessionId - Candidate Session identity.
 * @returns A result record: `{ ok: true }` plus the removed directory, or a failure code and message.
 */
async function deleteSession(ctx, sessionId) {
  const live = ctx.get('sessions')
  if (live?.get(sessionId) !== undefined) {
    // An opened Session stays resident for the life of this process; only work
    // still in flight makes deletion unsafe.
    const activity = await runningWork(ctx, sessionId)
    if (activity.length > 0) {
      return {
        status: 409,
        body: {
          ok: false,
          code: 'running',
          message: 'Session still has running work. Stop it (or close its tab) first, then delete it.',
        },
      }
    }
  }

  let snapshot
  try {
    snapshot = await ctx.sessionPersistence.stat(sessionId)
  } catch (error) {
    return {
      status: 500,
      body: { ok: false, code: 'stat-failed', message: `Cannot read the Session snapshot: ${String(error?.message ?? error)}` },
    }
  }

  const file = snapshot?.location?.path
  if (typeof file !== 'string' || file === '') {
    return {
      status: 404,
      body: { ok: false, code: 'missing', message: 'No persisted log exists for this Session.' },
    }
  }

  // Only a Session-owned directory holding a canonical generation file may go.
  const directory = dirname(file)
  if (basename(directory) !== sessionId || !LOG_FILE.test(basename(file))) {
    return {
      status: 500,
      body: { ok: false, code: 'layout', message: `Refusing to delete an unexpected layout: ${file}` },
    }
  }

  try {
    await rm(directory, { recursive: true, force: true })
  } catch (error) {
    return {
      status: 500,
      body: { ok: false, code: 'delete-failed', message: `Cannot delete ${directory}: ${String(error?.message ?? error)}` },
    }
  }

  ctx.emit('api-session/removed', sessionId)
  return { status: 200, body: { ok: true, sessionId, removed: directory } }
}

/**
 * Register the deletion route for the lifetime of this plugin.
 * @param ctx - Plugin context.
 */
export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE,
    async handler(request, response) {
      if (request.method !== 'POST') {
        respond(response, 405, { ok: false, code: 'method', message: 'POST only.' })
        return
      }
      const body = await readBody(request)
      const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : ''
      if (!SESSION_ID.test(sessionId)) {
        respond(response, 400, { ok: false, code: 'id', message: 'A canonical session-<uuid> id is required.' })
        return
      }
      const result = await deleteSession(ctx, sessionId)
      respond(response, result.status, result.body)
    },
  }), 'session-reaper.route')
}
