import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import { publicApi } from '../lib/api'

interface SubscribeFormProps {
  onSuccess?: () => void
  autoFocus?: boolean
  idPrefix?: string
  hideHeading?: boolean
}

export default function SubscribeForm({
  onSuccess,
  autoFocus = false,
  idPrefix = 'subscribe',
  hideHeading = false,
}: SubscribeFormProps) {
  const { t } = useTranslation()
  const [firstName, setFirstName] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const firstInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) {
      requestAnimationFrame(() => firstInputRef.current?.focus())
    }
  }, [autoFocus])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    setStatus('loading')
    setErrorMessage('')
    try {
      const result = await publicApi.subscribe({
        email: email.trim(),
        ...(firstName.trim() ? { firstName: firstName.trim() } : {}),
        language: i18n.language,
      })
      if (!result.success) {
        setStatus('error')
        setErrorMessage(result.message || t('subscribe.error'))
        return
      }
      setStatus('success')
    } catch {
      setStatus('error')
      setErrorMessage(t('subscribe.error'))
    }
  }

  if (status === 'success') {
    return (
      <div className="text-center py-4" role="status">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-green-50 flex items-center justify-center">
          <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-neutral-900 mb-2">{t('subscribe.successTitle')}</h2>
        <p className="text-neutral-600 text-sm mb-6">
          {t('subscribe.successMessage', { email })}
        </p>
        {onSuccess && (
          <button
            onClick={onSuccess}
            className="px-6 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            {t('subscribe.done')}
          </button>
        )}
      </div>
    )
  }

  return (
    <>
      {!hideHeading && (
        <div className="text-center mb-6">
          <h2 id={`${idPrefix}-title`} className="text-xl font-bold text-neutral-900 mb-1">
            {t('subscribe.heading')}
          </h2>
          <p className="text-neutral-500 text-sm">
            {t('brand.claim')} {t('brand.claimSupport')}
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor={`${idPrefix}-first-name`} className="sr-only">{t('subscribe.nameLabel')}</label>
          <input
            ref={firstInputRef}
            id={`${idPrefix}-first-name`}
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder={t('subscribe.namePlaceholder')}
            autoComplete="given-name"
            className="w-full px-4 py-3 text-base border border-neutral-300 rounded-lg bg-neutral-50 focus:bg-white focus:border-brand-400 focus:ring-2 focus:ring-brand-200 outline-none transition-colors"
          />
        </div>
        <div>
          <label htmlFor={`${idPrefix}-email`} className="sr-only">{t('subscribe.emailLabel')}</label>
          <input
            id={`${idPrefix}-email`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('subscribe.emailPlaceholder')}
            required
            autoComplete="email"
            className="w-full px-4 py-3 text-base border border-neutral-300 rounded-lg bg-neutral-50 focus:bg-white focus:border-brand-400 focus:ring-2 focus:ring-brand-200 outline-none transition-colors"
            aria-describedby={errorMessage ? `${idPrefix}-error` : undefined}
          />
        </div>

        {status === 'error' && (
          <p id={`${idPrefix}-error`} className="text-sm text-red-600" role="alert">
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={status === 'loading'}
          className="w-full py-3 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {status === 'loading' ? t('subscribe.submitting') : t('subscribe.submit')}
        </button>
      </form>
    </>
  )
}
