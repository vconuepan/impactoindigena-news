import { useQuery, useMutation } from '@tanstack/react-query'
import { ArrowPathIcon, ExclamationTriangleIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { adminApi } from '../../lib/admin-api'
import { Button } from '../ui/Button'
import { useToast } from '../ui/Toast'

/**
 * Salud del token de LinkedIn, con reautorización de un clic.
 *
 * Existe porque el token de LinkedIn dura ~60 días y NO se puede renovar sin una
 * persona: los refresh tokens programáticos son solo para partners aprobados del
 * Marketing Developer Platform. En junio de 2026 el token expiró y el canal
 * quedó caído semanas sin que nada lo notara. El job `linkedin_check_token`
 * avisa por correo; esta tarjeta es donde se arregla.
 */
export function LinkedInTokenCard() {
  const { toast } = useToast()

  const query = useQuery({
    queryKey: ['linkedinTokenStatus'],
    queryFn: () => adminApi.linkedin.tokenStatus(),
    staleTime: 60_000,
  })

  const authorize = useMutation({
    mutationFn: () => adminApi.linkedin.startAuthorization(),
    onSuccess: ({ url }) => {
      // Navegar en esta misma pestaña: LinkedIn vuelve al callback, que redirige
      // de nuevo acá con el resultado. Una pestaña nueva se quedaría huérfana.
      window.location.href = url
    },
    onError: (err) =>
      toast('error', err instanceof Error ? err.message : 'No se pudo iniciar la autorización'),
  })

  if (query.isLoading) return null

  const s = query.data
  if (!s) return null

  if (!s.configured) {
    return (
      <Card tone="neutral">
        <p className="text-sm text-neutral-600">
          LinkedIn no está configurado (faltan <code>LINKEDIN_ACCESS_TOKEN</code> o{' '}
          <code>LINKEDIN_AUTHOR_URN</code>).
        </p>
      </Card>
    )
  }

  if (s.error || s.active === undefined) {
    return (
      <Card tone="warning">
        <p className="text-sm text-neutral-700">
          No se pudo verificar el token: {s.error ?? 'error desconocido'}
        </p>
      </Card>
    )
  }

  const threshold = s.warnThresholdDays ?? 7
  const daysLeft = s.daysLeft ?? null
  const expiringSoon = s.active && daysLeft !== null && daysLeft <= threshold
  const tone = !s.active ? 'danger' : expiringSoon ? 'warning' : 'ok'

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
              {!s.active
                ? `Token ${s.status === 'revoked' ? 'revocado' : 'expirado'} — no se puede publicar`
                : expiringSoon
                  ? `El token expira en ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'}`
                  : 'Token activo'}
            </p>
            <p className="text-xs text-neutral-600 mt-0.5">
              {s.active && daysLeft !== null && !expiringSoon && (
                <>Quedan {daysLeft} días. </>
              )}
              {s.expiresAt && <>Expira el {new Date(s.expiresAt).toLocaleDateString('es-CL')}. </>}
              {!s.active && 'Reautoriza para reactivar el canal. '}
              {s.active && expiringSoon && 'Reautoriza ahora para no perder el canal. '}
              LinkedIn no permite renovación automática para esta app.
            </p>
            {s.scopes && s.scopes.length > 0 && (
              <p className="text-xs text-neutral-500 mt-1">
                Permisos: {s.scopes.join(', ')}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
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
          {s.canReauthorize && (
            <Button
              variant={tone === 'ok' ? 'secondary' : 'primary'}
              size="sm"
              onClick={() => authorize.mutate()}
              loading={authorize.isPending}
            >
              Reautorizar
            </Button>
          )}
        </div>
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
