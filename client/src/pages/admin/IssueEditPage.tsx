import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { ArrowLeftIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { useIssue, useIssues, useCreateIssue, useUpdateIssue } from '../../hooks/useIssues'
import { PageHeader } from '../../components/ui/PageHeader'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { Select } from '../../components/ui/Select'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { useToast } from '../../components/ui/Toast'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

interface MakeADifferenceLink {
  label: string
  url: string
}

export default function IssueEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isNew = !id
  const { toast } = useToast()

  const issueQuery = useIssue(id || '')
  const issuesQuery = useIssues()
  const createIssue = useCreateIssue()
  const updateIssue = useUpdateIssue()

  const [form, setForm] = useState({
    name: '',
    slug: '',
    description: '',
    promptFactors: '',
    promptAntifactors: '',
    promptRatings: '',
    parentId: null as string | null,
    intro: '',
    evaluationIntro: '',
    evaluationCriteria: [] as string[],
    makeADifference: [] as MakeADifferenceLink[],
  })
  const [slugManual, setSlugManual] = useState(false)

  useEffect(() => {
    if (issueQuery.data) {
      setForm({
        name: issueQuery.data.name,
        slug: issueQuery.data.slug,
        description: issueQuery.data.description,
        promptFactors: issueQuery.data.promptFactors,
        promptAntifactors: issueQuery.data.promptAntifactors,
        promptRatings: issueQuery.data.promptRatings,
        parentId: issueQuery.data.parentId,
        intro: issueQuery.data.intro || '',
        evaluationIntro: issueQuery.data.evaluationIntro || '',
        evaluationCriteria: issueQuery.data.evaluationCriteria || [],
        makeADifference: issueQuery.data.makeADifference || [],
      })
      setSlugManual(true)
    }
  }, [issueQuery.data])

  const set = (key: string, value: any) => {
    setForm(f => {
      const next = { ...f, [key]: value }
      if (key === 'name' && !slugManual) {
        next.slug = slugify(value)
      }
      return next
    })
  }

  // Check if this issue has children (cannot be made a child itself)
  const hasChildren = issueQuery.data?.children && issueQuery.data.children.length > 0

  // Build parent options: only top-level issues that aren't this issue and have no parent
  const parentOptions = (issuesQuery.data || [])
    .filter(i => !i.parentId && i.id !== id)
    .map(i => ({ value: i.id, label: i.name }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (isNew) {
        await createIssue.mutateAsync(form)
        toast('success', 'Tema creado')
      } else {
        await updateIssue.mutateAsync({ id: id!, data: form })
        toast('success', 'Tema actualizado')
      }
      navigate('/admin/issues')
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Error al guardar tema')
    }
  }

  const isPending = createIssue.isPending || updateIssue.isPending

  if (!isNew && issueQuery.isLoading) {
    return <div className="flex justify-center py-12"><LoadingSpinner /></div>
  }

  return (
    <>
      <Helmet>
        <title>{isNew ? 'Nuevo tema' : 'Editar tema'} — Admin — Voces Indígenas</title>
      </Helmet>

      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/admin/issues')}>
          <ArrowLeftIcon className="h-4 w-4" /> Volver a Temas
        </Button>
      </div>

      <PageHeader title={isNew ? 'Nuevo tema' : 'Editar tema'} />

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        {/* Basic Info */}
        <div className="bg-white rounded-lg border border-neutral-200 p-4 space-y-4">
          <Input id="issue-name" label="Nombre" value={form.name} onChange={e => set('name', e.target.value)} required />
          <Input
            id="issue-slug"
            label="Slug"
            value={form.slug}
            onChange={e => { setSlugManual(true); set('slug', e.target.value) }}
            required
          />
          <Textarea id="issue-desc" label="Descripción" rows={3} value={form.description} onChange={e => set('description', e.target.value)} />
          <div>
            <Select
              id="issue-parent"
              label="Tema padre"
              placeholder="Ninguno (nivel superior)"
              value={form.parentId || ''}
              onChange={e => set('parentId', e.target.value || null)}
              options={parentOptions}
              disabled={!!hasChildren}
            />
            {hasChildren && (
              <p className="mt-1 text-xs text-neutral-500">Este tema tiene subtemas y no puede convertirse en un subtema.</p>
            )}
          </div>
        </div>

        {/* LLM Prompt Configuration */}
        <div className="bg-white rounded-lg border border-neutral-200 p-4 space-y-4">
          <h3 className="text-sm font-semibold text-neutral-900">Configuración de prompt LLM</h3>
          <Textarea
            id="issue-factors"
            label="Factores de relevancia"
            rows={8}
            value={form.promptFactors}
            onChange={e => set('promptFactors', e.target.value)}
            placeholder="¿Qué hace que una noticia sea relevante para este tema?"
          />
          <Textarea
            id="issue-antifactors"
            label="Antifactores"
            rows={8}
            value={form.promptAntifactors}
            onChange={e => set('promptAntifactors', e.target.value)}
            placeholder="¿Qué hace que una noticia sea menos relevante?"
          />
          <Textarea
            id="issue-ratings"
            label="Guía de calificaciones"
            rows={8}
            value={form.promptRatings}
            onChange={e => set('promptRatings', e.target.value)}
            placeholder="¿Cómo se deben asignar las calificaciones?"
          />
        </div>

        {/* Public Page Content */}
        <div className="bg-white rounded-lg border border-neutral-200 p-4 space-y-4">
          <h3 className="text-sm font-semibold text-neutral-900">Contenido de la página pública</h3>
          <Textarea
            id="issue-intro"
            label="Introducción"
            rows={4}
            value={form.intro}
            onChange={e => set('intro', e.target.value)}
            placeholder="Párrafo de introducción público"
          />
          <Textarea
            id="issue-eval-intro"
            label="Introducción de evaluación"
            rows={2}
            value={form.evaluationIntro}
            onChange={e => set('evaluationIntro', e.target.value)}
            placeholder="Cómo se evalúan las noticias de este tema"
          />

          {/* Evaluation Criteria */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Criterios de evaluación</label>
            <div className="space-y-2">
              {form.evaluationCriteria.map((criterion, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={criterion}
                    onChange={e => {
                      const updated = [...form.evaluationCriteria]
                      updated[i] = e.target.value
                      set('evaluationCriteria', updated)
                    }}
                    className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:ring-brand-500"
                  />
                  <button
                    type="button"
                    onClick={() => set('evaluationCriteria', form.evaluationCriteria.filter((_, j) => j !== i))}
                    className="p-1.5 text-neutral-400 hover:text-red-500"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => set('evaluationCriteria', [...form.evaluationCriteria, ''])}
                className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700"
              >
                <PlusIcon className="h-4 w-4" /> Agregar criterio
              </button>
            </div>
          </div>

          {/* Source Names (derived from active feeds) */}
          {!isNew && issueQuery.data?.sourceNames && issueQuery.data.sourceNames.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Fuentes</label>
              <p className="text-xs text-neutral-500 mb-2">Derivadas de los títulos de fuentes activas. Edita los nombres de las fuentes para cambiarlas.</p>
              <div className="flex flex-wrap gap-1.5">
                {issueQuery.data.sourceNames.map((source: string) => (
                  <span
                    key={source}
                    className="bg-neutral-100 text-neutral-600 text-xs px-2 py-0.5 rounded-full"
                  >
                    {source}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Make a Difference Links */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Enlaces de acción</label>
            <div className="space-y-2">
              {form.makeADifference.map((link, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    type="text"
                    value={link.label}
                    placeholder="Etiqueta"
                    onChange={e => {
                      const updated = [...form.makeADifference]
                      updated[i] = { ...updated[i], label: e.target.value }
                      set('makeADifference', updated)
                    }}
                    className="w-1/3 rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:ring-brand-500"
                  />
                  <input
                    type="url"
                    value={link.url}
                    placeholder="URL"
                    onChange={e => {
                      const updated = [...form.makeADifference]
                      updated[i] = { ...updated[i], url: e.target.value }
                      set('makeADifference', updated)
                    }}
                    className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:ring-brand-500"
                  />
                  <button
                    type="button"
                    onClick={() => set('makeADifference', form.makeADifference.filter((_, j) => j !== i))}
                    className="p-1.5 text-neutral-400 hover:text-red-500"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => set('makeADifference', [...form.makeADifference, { label: '', url: '' }])}
                className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700"
              >
                <PlusIcon className="h-4 w-4" /> Agregar enlace
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button type="submit" loading={isPending}>{isNew ? 'Crear tema' : 'Guardar cambios'}</Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/admin/issues')}>Cancelar</Button>
        </div>
      </form>
    </>
  )
}
