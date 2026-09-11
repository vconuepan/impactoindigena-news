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
| `LOG_RETENTION_DAYS` | `14` | Daily log files to keep |

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

Two transports run in parallel via Pino's worker threads:

1. **Stdout** — `pino-pretty` in dev, raw JSON in production (captured by Render's log aggregator)
2. **Rotating file** — JSON logs written to `LOG_DIR/server.log`, rotated daily, kept for `LOG_RETENTION_DAYS` days

> **`limit.removeOtherLogFiles: true` is load-bearing.** Without it, pino-roll's
> `removeOldFiles()` only considers `createdFileNames` — an in-memory list of the
> files *this process* created — so files left by earlier processes are never
> deleted. In production that is constant: every deploy or App Service restart
> starts a new process, and `LOG_DIR=/home/LogFiles/app` is **persistent**
> storage. The Privacy Policy promises "Registros del servidor: hasta 14 días,
> luego se eliminan automáticamente", and this flag is what makes that true.
> It is narrow: `identifyLogFile` only matches `server.log.<integer>` and leaves
> everything else in the directory alone. Verified against pino-roll 4.0.0 and
> guarded by `logger.test.ts`.

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
- **Log output**: `logs/` directory (gitignored)

## Adding Logging to a New File

```ts
import { createLogger } from '../lib/logger.js'
const log = createLogger('myNewModule')
```

Use the module name that matches the file's domain (e.g., `scheduler`, `crawler`, `auth`, `stories`).

## Scripts

CLI scripts in `server/src/scripts/` use `console.log` directly since they are standalone tools, not part of the server process.
