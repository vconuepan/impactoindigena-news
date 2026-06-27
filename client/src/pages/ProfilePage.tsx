import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { publicApi, memberAuth } from '../lib/api'
import { SEO } from '../lib/seo'
import { getCategoryColor } from '../lib/category-colors'

const COMMUNITY_TYPE_LABEL: Record<string, string> = {
  PUEBLO: 'Pueblo',
  TERRITORIO: 'Territorio',
  CAUSA: 'Causa',
}

export default function ProfilePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const [nameInput, setNameInput] = useState('')
  const [nameError, setNameError] = useState('')
  const [nameSaved, setNameSaved] = useState(false)
  const [unsubscribeConfirm, setUnsubscribeConfirm] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const [exporting, setExporting] = useState(false)

  // Capture member_token from magic link redirect
  useEffect(() => {
    const token = searchParams.get('member_token')
    if (token) {
      memberAuth.setToken(token)
      setSearchParams((prev) => { prev.delete('member_token'); return prev }, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const isAuthenticated = memberAuth.isAuthenticated()

  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: () => publicApi.profile.get(),
    enabled: isAuthenticated,
    retry: false,
  })

  const membershipsQuery = useQuery({
    queryKey: ['profile-memberships'],
    queryFn: () => publicApi.profile.memberships(),
    enabled: isAuthenticated,
    retry: false,
  })

  const exclusionsQuery = useQuery({
    queryKey: ['profile-digest-exclusions'],
    queryFn: () => publicApi.profile.digestExclusions(),
    enabled: isAuthenticated,
    retry: false,
  })

  const subscriptionQuery = useQuery({
    queryKey: ['profile-subscription'],
    queryFn: () => publicApi.profile.subscriptionStatus(),
    enabled: isAuthenticated,
    retry: false,
  })

  const unsubscribeMutation = useMutation({
    mutationFn: () => publicApi.profile.unsubscribe(),
    onSuccess: () => {
      queryClient.setQueryData(['profile-subscription'], { subscribed: false, confirmedAt: null })
      setUnsubscribeConfirm(false)
    },
  })

  const deleteAccountMutation = useMutation({
    mutationFn: () => publicApi.profile.deleteAccount('ELIMINAR'),
    onSuccess: () => {
      memberAuth.clearToken()
      queryClient.clear()
      window.location.href = '/'
    },
  })

  async function handleExport() {
    setExporting(true)
    try {
      const data = await publicApi.profile.exportData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'mis-datos-impactoindigena.json'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  const excludeMutation = useMutation({
    mutationFn: (communityId: string) => publicApi.profile.excludeDigest(communityId),
    onSuccess: (_data, communityId) => {
      queryClient.setQueryData<{ excludedCommunityIds: string[] }>(['profile-digest-exclusions'], (prev) =>
        prev ? { excludedCommunityIds: [...prev.excludedCommunityIds, communityId] } : prev
      )
    },
  })

  const includeMutation = useMutation({
    mutationFn: (communityId: string) => publicApi.profile.includeDigest(communityId),
    onSuccess: (_data, communityId) => {
      queryClient.setQueryData<{ excludedCommunityIds: string[] }>(['profile-digest-exclusions'], (prev) =>
        prev ? { excludedCommunityIds: prev.excludedCommunityIds.filter((id) => id !== communityId) } : prev
      )
    },
  })

  // Sync name input when profile loads
  useEffect(() => {
    if (profileQuery.data?.name && !nameInput) {
      setNameInput(profileQuery.data.name)
    }
  }, [profileQuery.data, nameInput])

  const updateMutation = useMutation({
    mutationFn: (name: string) => publicApi.profile.update(name),
    onSuccess: (data) => {
      queryClient.setQueryData(['profile'], (prev: { name: string } | undefined) =>
        prev ? { ...prev, name: data.name } : prev
      )
      setNameError('')
      setNameSaved(true)
      setTimeout(() => setNameSaved(false), 2500)
    },
    onError: () => setNameError('No se pudo guardar. Intenta de nuevo.'),
  })

  function handleSaveName(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = nameInput.trim()
    if (trimmed.length < 2) { setNameError('Debe tener al menos 2 caracteres'); return }
    if (trimmed.length > 100) { setNameError('Máximo 100 caracteres'); return }
    setNameError('')
    updateMutation.mutate(trimmed)
  }

  function handleLogout() {
    memberAuth.clearToken()
    queryClient.clear()
    window.location.href = '/'
  }

  if (!isAuthenticated) {
    return (
      <>
        <Helmet>
          <title>Mi perfil — {SEO.siteName}</title>
        </Helmet>
        <div className="page-section max-w-lg mx-auto py-16 text-center">
          <h1 className="text-2xl font-bold text-neutral-900 mb-4">Mi perfil</h1>
          <p className="text-neutral-600 mb-6">
            Inicia sesión para ver tu perfil y comunidades.
          </p>
          <Link
            to="/comunidades"
            className="inline-block bg-brand-600 text-white font-medium px-6 py-3 rounded-lg hover:bg-brand-700 transition-colors"
          >
            Explorar comunidades →
          </Link>
        </div>
      </>
    )
  }

  const profile = profileQuery.data
  const communities = membershipsQuery.data?.communities ?? []

  return (
    <>
      <Helmet>
        <title>Mi perfil — {SEO.siteName}</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="page-section max-w-2xl mx-auto py-10">
        <h1 className="text-2xl font-bold text-neutral-900 mb-8">Mi perfil</h1>

        {/* Name + email */}
        <section className="mb-8 rounded-lg border border-neutral-200 bg-white p-6">
          <h2 className="text-base font-semibold text-neutral-800 mb-4">Datos personales</h2>

          {profileQuery.isLoading ? (
            <div className="space-y-3">
              <div className="h-4 bg-neutral-100 rounded animate-pulse w-48" />
              <div className="h-4 bg-neutral-100 rounded animate-pulse w-64" />
            </div>
          ) : (
            <>
              <p className="text-sm text-neutral-500 mb-4">
                <span className="font-medium text-neutral-700">Email: </span>
                {profile?.email}
              </p>

              <form onSubmit={handleSaveName} className="flex flex-col gap-3">
                <label className="text-sm font-medium text-neutral-700" htmlFor="name">
                  Nombre
                </label>
                <div className="flex gap-3">
                  <input
                    id="name"
                    type="text"
                    value={nameInput}
                    onChange={(e) => { setNameInput(e.target.value); setNameError(''); setNameSaved(false) }}
                    className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    maxLength={100}
                    placeholder="Tu nombre"
                  />
                  <button
                    type="submit"
                    disabled={updateMutation.isPending || nameInput.trim() === (profile?.name ?? '')}
                    className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-md hover:bg-brand-700 disabled:opacity-40 transition-colors"
                  >
                    {updateMutation.isPending ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
                {nameError && <p className="text-sm text-red-600">{nameError}</p>}
                {nameSaved && <p className="text-sm text-green-600">Nombre actualizado.</p>}
              </form>
            </>
          )}
        </section>

        {/* Communities */}
        <section className="mb-8 rounded-lg border border-neutral-200 bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-neutral-800">Mis comunidades</h2>
            <Link
              to="/comunidades"
              className="text-sm text-brand-800 hover:text-brand-700 font-medium"
            >
              Explorar más →
            </Link>
          </div>

          {membershipsQuery.isLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-10 bg-neutral-100 rounded animate-pulse" />
              ))}
            </div>
          ) : communities.length === 0 ? (
            <p className="text-sm text-neutral-500 italic">
              Aún no te has unido a ninguna comunidad.{' '}
              <Link to="/comunidades" className="text-brand-800 underline">Explorar comunidades</Link>
            </p>
          ) : (
            <>
              <ul className="divide-y divide-neutral-100">
                {communities.map((c) => {
                  const colors = getCategoryColor(c.slug)
                  const excluded = exclusionsQuery.data?.excludedCommunityIds.includes(c.id) ?? false
                  const isPending = excludeMutation.isPending || includeMutation.isPending
                  return (
                    <li key={c.id} className="py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${colors.dotBg} shrink-0`} aria-hidden="true" />
                          <Link
                            to={`/comunidad/${c.slug}`}
                            className="text-sm font-medium text-neutral-800 hover:text-brand-700 transition-colors"
                          >
                            {c.name}
                          </Link>
                        </div>
                        <span className="text-xs text-neutral-400">
                          {COMMUNITY_TYPE_LABEL[c.type] ?? c.type}
                        </span>
                      </div>
                      {!exclusionsQuery.isLoading && (
                        <div className="mt-1.5 ml-4 flex items-center gap-2">
                          <button
                            role="switch"
                            aria-checked={!excluded}
                            disabled={isPending}
                            onClick={() => excluded
                              ? includeMutation.mutate(c.id)
                              : excludeMutation.mutate(c.id)
                            }
                            className={`relative inline-flex h-4 w-7 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50 ${!excluded ? 'bg-brand-600' : 'bg-neutral-300'}`}
                          >
                            <span aria-hidden="true" className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow transition duration-200 ${!excluded ? 'translate-x-3' : 'translate-x-0'}`} />
                          </button>
                          <span className="text-xs text-neutral-500">
                            {excluded ? 'Digest desactivado' : 'Recibir digest semanal'}
                          </span>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </section>

        {/* Newsletter */}
        <section className="mb-8 rounded-lg border border-neutral-200 bg-white p-6">
          <h2 className="text-base font-semibold text-neutral-800 mb-4">Newsletter</h2>

          {subscriptionQuery.isLoading ? (
            <div className="h-4 bg-neutral-100 rounded animate-pulse w-48" />
          ) : subscriptionQuery.data?.subscribed ? (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500" aria-hidden="true" />
                <span className="text-sm text-neutral-700">
                  Suscrito
                  {subscriptionQuery.data.confirmedAt && (
                    <span className="text-neutral-400 ml-1">
                      desde {new Date(subscriptionQuery.data.confirmedAt).toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                  )}
                </span>
              </div>

              {!unsubscribeConfirm ? (
                <button
                  onClick={() => setUnsubscribeConfirm(true)}
                  className="text-sm text-neutral-500 hover:text-red-600 transition-colors"
                >
                  Cancelar suscripción
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-neutral-600">¿Confirmas la cancelación?</span>
                  <button
                    onClick={() => unsubscribeMutation.mutate()}
                    disabled={unsubscribeMutation.isPending}
                    className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50 transition-colors"
                  >
                    {unsubscribeMutation.isPending ? 'Cancelando…' : 'Sí, cancelar'}
                  </button>
                  <button
                    onClick={() => setUnsubscribeConfirm(false)}
                    className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
                  >
                    No, mantener
                  </button>
                </div>
              )}

              {unsubscribeMutation.isError && (
                <p className="mt-2 text-sm text-red-600">No se pudo cancelar. Intenta de nuevo.</p>
              )}
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-block w-2 h-2 rounded-full bg-neutral-300" aria-hidden="true" />
                <span className="text-sm text-neutral-500">No estás suscrito al newsletter.</span>
              </div>
              <Link
                to="/"
                className="text-sm text-brand-800 hover:text-brand-700 font-medium"
              >
                Suscribirse →
              </Link>
            </div>
          )}
        </section>

        {/* Data & privacy */}
        <section className="mb-8 rounded-lg border border-neutral-200 bg-white p-6">
          <h2 className="text-base font-semibold text-neutral-800 mb-4">Tus datos y privacidad</h2>
          <p className="text-sm text-neutral-500 mb-4">
            Puedes descargar todos los datos que tratamos sobre ti, o eliminar tu cuenta
            y todos tus datos de forma permanente.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="px-4 py-2 text-sm font-medium rounded-md border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 transition-colors"
            >
              {exporting ? 'Preparando…' : 'Descargar mis datos'}
            </button>
            {!deleteConfirm && (
              <button
                onClick={() => setDeleteConfirm(true)}
                className="px-4 py-2 text-sm font-medium rounded-md border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
              >
                Eliminar mi cuenta
              </button>
            )}
          </div>
          {deleteConfirm && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-700 mb-3">
                Esto elimina tu cuenta, membresías, suscripciones y feedback de forma
                permanente e irreversible. Para confirmar, escribe <strong>ELIMINAR</strong>.
              </p>
              <input
                type="text"
                value={deleteText}
                onChange={(e) => setDeleteText(e.target.value)}
                placeholder="ELIMINAR"
                aria-label="Escribe ELIMINAR para confirmar"
                className="w-full sm:w-64 rounded-md border border-red-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 mb-3"
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={() => deleteAccountMutation.mutate()}
                  disabled={deleteText !== 'ELIMINAR' || deleteAccountMutation.isPending}
                  className="px-4 py-2 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 transition-colors"
                >
                  {deleteAccountMutation.isPending ? 'Eliminando…' : 'Eliminar definitivamente'}
                </button>
                <button
                  onClick={() => { setDeleteConfirm(false); setDeleteText('') }}
                  className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
                >
                  Cancelar
                </button>
              </div>
              {deleteAccountMutation.isError && (
                <p className="mt-2 text-sm text-red-600">No se pudo eliminar. Intenta de nuevo.</p>
              )}
            </div>
          )}
        </section>

        {/* Logout */}
        <div className="text-right">
          <button
            onClick={handleLogout}
            className="text-sm text-neutral-500 hover:text-red-600 transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </>
  )
}
