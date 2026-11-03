# Logging

The server uses [Pino](https://getpino.io/) for structured logging. All application code uses the logger — `console.log/warn/error` are reserved for CLI scripts only.

## Usage

```ts
import { createLogger } from '../lib/logger.js'

const log = createLogger('myModule')

// Info with structured data
log.info({ storyCount: 12, threshold: 3 }, 'starting assessment')

// Error with automatic stack trace serialization
log.error({ err, storyId: 'abc' }, 'assessment failed')

// Warning
log.warn({ url }, 'no content extracted')

// Debug (only shown when LOG_LEVEL=debug)
log.debug({ storyId, rating }, 'pre-assessment result')
```

### Key rules

1. **First argument** is always the structured data object (`{ key: value }`)
2. **Second argument** is the message string (human-readable, lowercase)
3. **Errors** go in `{ err }` — Pino serializes stack traces automatically, no need for `err.message`
4. **Module prefix** is set once via `createLogger('name')` — don't repeat it in messages
5. **Numeric/ID values** go in the data object, not interpolated into the message
6. **Axios errors**: For error sites in HTTP-heavy code (crawl, RSS), prefer `{ reason: summarizeError(err) }` over `{ err }` to avoid serializing bulky response bodies. Import `summarizeError` from `server/src/utils/errors.ts`

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `LOG_LEVEL` | `info` (prod) / `debug` (dev) | Minimum log level |
| `LOG_DIR` | `logs/` | Directory for rotating log files |
| `LOG_RETENTION_DAYS` | `14` | Days of rotating files to keep (integer >= 1; anything else falls back to 14) |
| `LOG_FILE_RETRY_MS` | `600000` | How often to reconnect the rotating file after it fails |

## Output

### Development (pino-pretty)

```
14:32:05.123 INFO  (myModule): starting assessment
    storyCount: 12
    threshold: 3
```

### Production (JSON)

```json
{"level":30,"time":"2025-06-15T14:32:05.123Z","module":"myModule","storyCount":12,"threshold":3,"msg":"starting assessment"}
```

## Transports

Two destinations, on **separate paths** since 3-nov-2026:

1. **Stdout**: `pino.destination(1)` in production (JSON, captured by App Service), `pino-pretty` in dev.
2. **Rotating file**: `pino-roll` in its own transport, JSON, in `LOG_DIR` (production: `/home/LogFiles/app`), one file per day named `server.YYYY-MM-DD.N.log`, kept `LOG_RETENTION_DAYS` days (`opcionesDelArchivo` in `lib/logger.ts`).

They are combined with `pino.multistream`. **If the file fails, stdout and the server keep going.** The file transport's `error` handler removes it from the multistream (otherwise every later line allocates a discarded «the worker has exited» error) and reconnects it every `LOG_FILE_RETRY_MS` (10 min). It reports on the first failure, every hour while it lasts, and on recovery (30 s without failing after reconnecting), so a gap in the 14-day history does not go unnoticed. Before, both destinations shared one `thread-stream` transport: a failing file destroyed it, every later log line re-emitted the error, and with no handler the process died.

### Why the file name carries the date (A3 and A4, 3-nov-2026)

Without a date, pino-roll numbers files `server.1.log`, `server.2.log`… restarting at 1 every day, and its cleanup (`removeOtherLogFiles`) sorts **by number**. It kept the 14 highest numbers, `server.54` to `server.67` from July-August, forever, and every day deleted the recent ones, **including the file in use**:

- **A3:** the 14-day history the Privacy Policy promises never existed.
- **A4:** during a deploy two containers share `/home/LogFiles/app` (persistent network storage). At 00:00 on 3-nov the old container rolled to `server.9.log` and the cleanup deleted it while still open. At 00:57 the new container still saw it in the directory, picked it, and could not open it: `ENOENT: no such file or directory, open '/home/LogFiles/app/server.9.log'`, unhandled, exit code 1 (Azure startup log `StartupLogs/2026_11_03_lw1mdlwk0000UX_failure.log`). Azure retried and it came up, so the deploy showed green. Same `ContainerStartupFailure` on 19-oct 20:08 and 26-oct 01:35. That the share keeps listing a deleted-but-open file is an inference from the evidence, not observed directly; the crash path was reproduced locally with an unopenable file.

With the date, the cleanup sorts by date and then by number: it removes the oldest and never the file of the day.

**`count` is `days - 1`, and it came from measuring.** In a real rotation pino-roll reopens the new file and starts the cleanup at the same moment; the cleanup's `readdir` almost always runs before the new file exists, so `count` old files remain *plus* the new one (measured by rotating for real during an independent review, 3-nov). If the new file already exists, `count` remain in total. With `count: 13` that is 14 days or, at most, 13: «hasta 14 días», as the Policy says. With `count: 14` it was 15. `logger-archivo.test.ts` runs pino-roll's own `removeOldFiles` in both orders. (The README's «count 3 → 4 files» is about the other branch, without `removeOtherLogFiles`.)

**`LOG_RETENTION_DAYS` is validated** (`diasDeRetencion`): an integer >= 1, otherwise 14 with a warning. With a non-number, the old-format cleanup deleted everything (comparing against NaN is always false) and pino-roll stopped deleting.

### Files in the old format

The dated cleanup does not recognize `server.<n>.log`. `borrarRegistrosSinFecha` deletes those older than `LOG_RETENTION_DAYS` by modification time; `index.ts` runs it at startup and every hour (with the token cleanup), and logs a warning if the directory cannot be read for any reason other than not existing. On the first deploy it removes `server.54` to `server.67` (July-August 2026); the last undated file in use goes on the first pass after 14 days without writes. It touches only regular files named exactly `server.<n>.log`, and does nothing with invalid days.

**Not governed here:** what App Service captures from stdout (`/home/LogFiles/*_docker.log`, `StartupLogs/`) lives outside `LOG_DIR`; its retention is the App Service log configuration, not this code.

## Log Levels

| Level | When to use |
|---|---|
| `fatal` | Process is about to crash |
| `error` | Operation failed, needs attention |
| `warn` | Unexpected but recoverable (missing content, unknown IDs) |
| `info` | Normal operations (job started/completed, request served) |
| `debug` | Detailed diagnostic info (per-story results, batch details) |
| `trace` | Extremely verbose (rarely used) |

## Error Serialization

A custom `serializeError` function in `logger.ts` strips bulky axios internals from all logged errors. Without this, logging an axios error via `{ err }` serializes the full HTTP response body (potentially megabytes of HTML), socket objects, TLS session cache, and circular config references, which can cause OOM during the crawl job.

For axios errors, the serializer keeps only: `type`, `message`, `stack`, `code`, `status`, and `url`. Everything else (response body, request object, config) is dropped. Non-axios errors pass through the standard Pino serializer unchanged.

## File Locations

- **Logger module**: `server/src/lib/logger.ts`
- **Error summarizer**: `server/src/utils/errors.ts`
- **HTTP middleware**: `server/src/app.ts` (pino-http)
- **Log output**: `logs/` directory (gitignored) locally; `/home/LogFiles/app` in production

## Adding Logging to a New File

```ts
import { createLogger } from '../lib/logger.js'
const log = createLogger('myNewModule')
```

Use the module name that matches the file's domain (e.g., `scheduler`, `crawler`, `auth`, `stories`).

## Scripts

CLI scripts in `server/src/scripts/` use `console.log` directly since they are standalone tools, not part of the server process.
