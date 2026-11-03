import { useRef, useState } from 'react'
import { Dialog, DialogPanel, DialogTitle, Description } from '@headlessui/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi, type ResultadoSupresion, type VistaPreviaSupresion } from '../../lib/admin-api'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { useToast } from '../ui/Toast'

interface SupresionPorCorreoProps {
  open: boolean
  onClose: () => void
}

const FILAS: { clave: keyof Omit<VistaPreviaSupresion, 'brevo'>; etiqueta: string }[] = [
  { clave: 'cuentas', etiqueta: 'Cuenta (con membresías y publicaciones)' },
  { clave: 'suscripciones', etiqueta: 'Suscripciones al boletín' },
  { clave: 'alertas', etiqueta: 'Alertas por tema' },
  { clave: 'enlaces', etiqueta: 'Enlaces de acceso' },
  { clave: 'comentarios', etiqueta: 'Comentarios enviados' },
]

const BREVO: Record<VistaPreviaSupresion['brevo'], string> = {
  esta: 'Guarda el contacto: se borra',
  'no-esta': 'No tiene el contacto',
  desconocido: 'No respondió: al suprimir se vuelve a intentar',
}

/** Lo que vio quien opera, y al correo que corresponde. */
interface Revisado {
  correo: string
  datos: VistaPreviaSupresion
}

export function resumenSupresion(r: ResultadoSupresion): string {
  const filas = r.cuentas + r.suscripciones + r.alertas + r.enlaces + r.comentarios
  const base = `${filas} ${filas === 1 ? 'registro' : 'registros'}`
  return r.brevo === 'borrado'
    ? `Suprimido: ${base} y el contacto en Brevo`
    : `Suprimido: ${base}. Brevo no tenía el contacto`
}

/**
 * Para cuando alguien pide por correo que se le borre: primero muestra qué
 * guarda la base con esa dirección, y recién después lo borra todo, aquí y en
 * Brevo. Lo que se borra no se puede recuperar.
 *
 * Se suprime el correo REVISADO, no el que haya en el campo: si se edita el
 * campo mientras la revisión viaja, la respuesta que llega tarde se descarta.
 */
export function SupresionPorCorreo({ open, onClose }: SupresionPorCorreoProps) {
  const [email, setEmail] = useState('')
  const [revisado, setRevisado] = useState<Revisado | null>(null)
  const actual = useRef('')
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const revisar = useMutation({
    mutationFn: (correo: string) => adminApi.supresion.vistaPrevia(correo),
    onSuccess: (datos, correo) => {
      if (correo === actual.current) setRevisado({ correo, datos })
    },
    onError: (err) => toast('error', err instanceof Error ? err.message : 'No se pudo revisar el correo'),
  })

  const suprimir = useMutation({
    mutationFn: (correo: string) => adminApi.supresion.suprimir(correo),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['subscribers'] })
      queryClient.invalidateQueries({ queryKey: ['subscriber-stats'] })
      toast('success', resumenSupresion(r))
      cerrar()
    },
    onError: (err) => toast('error', err instanceof Error ? err.message : 'No se pudo suprimir el correo'),
  })

  function cerrar() {
    setEmail('')
    actual.current = ''
    setRevisado(null)
    onClose()
  }

  const vista = revisado?.datos ?? null
  const total = vista ? FILAS.reduce((n, f) => n + vista[f.clave], 0) : 0
  const nada = vista !== null && total === 0 && vista.brevo === 'no-esta'

  return (
    <Dialog open={open} onClose={cerrar} className="relative z-50">
      <div className="fixed inset-0 bg-neutral-900/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="mx-auto max-w-md w-full rounded-lg bg-white p-6 shadow-xl">
          <DialogTitle className="text-base font-semibold text-neutral-900">Suprimir por correo</DialogTitle>
          <Description className="mt-1 mb-4 text-sm text-neutral-500">
            Borra todo lo que guardamos con una dirección, aquí y en Brevo. Para responder a quien pide que se le
            borre.
          </Description>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              revisar.mutate(email)
            }}
            className="space-y-4"
          >
            <Input
              id="supresion-email"
              label="Correo"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                actual.current = e.target.value
                setRevisado(null)
              }}
              required
            />
            {!vista && (
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="secondary" onClick={cerrar}>
                  Cancelar
                </Button>
                <Button type="submit" loading={revisar.isPending} disabled={!email}>
                  Revisar
                </Button>
              </div>
            )}
          </form>

          {revisado && vista && (
            <div className="mt-4">
              <p className="mb-2 text-sm text-neutral-600">
                Lo que guardamos de <span className="font-medium text-neutral-900">{revisado.correo}</span>:
              </p>
              <dl className="divide-y divide-neutral-100 rounded-md border border-neutral-200 text-sm">
                {FILAS.map((f) => (
                  <div key={f.clave} className="flex justify-between px-3 py-2">
                    <dt className="text-neutral-600">{f.etiqueta}</dt>
                    <dd className="font-medium text-neutral-900 tabular-nums">{vista[f.clave]}</dd>
                  </div>
                ))}
                <div className="flex justify-between gap-4 px-3 py-2">
                  <dt className="text-neutral-600">Brevo</dt>
                  <dd className="text-right font-medium text-neutral-900">{BREVO[vista.brevo]}</dd>
                </div>
              </dl>
              {nada ? (
                <p className="mt-3 text-sm text-neutral-600">No hay nada guardado con ese correo.</p>
              ) : (
                <p className="mt-3 text-sm text-red-700">Esta acción no se puede deshacer.</p>
              )}
              <div className="mt-4 flex justify-end gap-3">
                <Button type="button" variant="secondary" onClick={cerrar} disabled={suprimir.isPending}>
                  Cancelar
                </Button>
                <Button variant="danger" loading={suprimir.isPending} disabled={nada} onClick={() => suprimir.mutate(revisado.correo)}>
                  Suprimir todo
                </Button>
              </div>
            </div>
          )}
        </DialogPanel>
      </div>
    </Dialog>
  )
}
