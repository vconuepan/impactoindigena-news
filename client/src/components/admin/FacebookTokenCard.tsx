import { useQuery } from '@tanstack/react-query'
import { ArrowPathIcon, ExclamationTriangleIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { adminApi } from '../../lib/admin-api'
import { Button } from '../ui/Button'

/**
 * Salud del token de la Página de Facebook.
 *
 * A diferencia de LinkedIn no hay botón de reautorizar: un token de Página se
 * genera en el Graph API Explorer o en el Business Manager y se pone a mano, así
 * que lo útil acá es la cuenta atrás y el recordatorio de borrar la fila guardada
 * al rotarlo (si no, el valor viejo de la DB le gana al nuevo de la variable).
 *
 * Un token de system user no expira: en ese caso no hay nada que vigilar y la
 * tarjeta lo dice, en vez de mostrar una alarma vacía.
 */
export function FacebookTokenCard() {
  const query = useQuery({
    queryKey: ['facebookTokenStatus'],
    queryFn: () => adminApi.facebook.tokenStatus(),
    staleTime: 60_000,
  })

  if (query.isLoading) return null

  const s = query.data
  if (!s) return null

  if (!s.configured) {
    return (
      <Card tone="neutral">
        <p className="text-sm text-neutral-600">
          Facebook no está configurado (faltan <code>FACEBOOK_PAGE_ACCESS_TOKEN</code> o{' '}
          <code>FACEBOOK_PAGE_ID</code>).
        </p>
      </Card>
    )
  }

  if (!s.appConfigured) {
    return (
      <Card tone="warning">
        <p className="text-sm text-neutral-700">
          Falta <code>FACEBOOK_APP_ID</code> / <code>FACEBOOK_APP_SECRET</code>, así que el token no
          se puede verificar. Publicar sí funciona; lo que no hay es aviso antes de que expire.
        </p>
      </Card>
    )
  }

  if (s.error || s.isValid === undefined) {
    return (
      <Card tone="warning">
        <p className="text-sm text-neutral-700">
          No se pudo verificar el token: {s.error ?? 'error desconocido'}
        </p>
      </Card>
    )
  }

  const daysLeft = s.daysLeft ?? null
  const expiringSoon = s.isValid && daysLeft !== null && daysLeft <= 7
  const tone = !s.isValid ? 'danger' : expiringSoon ? 'warning' : 'ok'

  return (
    <Card tone={tone}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-2.5">
          {tone === 'ok' ? (
            <CheckCircleIcon className="h-5 w-5 text-green-700 shrink-0 mt-0.5" aria-hidden="true" />
          ) : (
            <ExclamationTriangleIcon
              className={`h-5 w-5 shrink-0 mt-0.5 ${tone === 'danger' ? 'text-red-700' : 'text-amber-700'}`}
              aria-hidden="true"
            />
          )}
          <div>
            <p className="text-sm font-semibold text-neutral-900">
              {!s.isValid
                ? 'Token de Página inválido — no se puede publicar'
                : s.neverExpires
                  ? 'Token activo, sin expiración'
                  : expiringSoon
                    ? `El token expira en ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'}`
                    : 'Token activo'}
            </p>
            <p className="text-xs text-neutral-600 mt-0.5">
              {s.isValid && s.neverExpires && 'Es un token de system user: no hay fecha que vigilar. '}
              {s.isValid && daysLeft !== null && !expiringSoon && <>Quedan {daysLeft} días. </>}
              {s.expiresAt && <>Expira el {new Date(s.expiresAt).toLocaleDateString('es-CL')}. </>}
              {!s.isValid && 'Genera un token de Página nuevo y actualízalo. '}
              {s.source === 'db'
                ? 'Al rotarlo a mano hay que borrar la fila de social_tokens, o el valor guardado le gana al nuevo.'
                : 'Todavía usa el valor de la configuración: no hay token guardado en la base.'}
            </p>
            {s.scopes && s.scopes.length > 0 && (
              <p className="text-xs text-neutral-500 mt-1">Permisos: {s.scopes.join(', ')}</p>
            )}
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => query.refetch()}
          loading={query.isFetching}
          aria-label="Volver a verificar el token"
        >
          <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
          Verificar
        </Button>
      </div>
    </Card>
  )
}

const TONES = {
  ok: 'bg-green-50 border-green-200',
  warning: 'bg-amber-50 border-amber-200',
  danger: 'bg-red-50 border-red-200',
  neutral: 'bg-white border-neutral-200',
} as const

function Card({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  return <div className={`rounded-lg border px-4 py-3 mb-4 ${TONES[tone]}`}>{children}</div>
}
