import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import { publicApi } from '../lib/api'

/**
 * In-article newsletter capture. Unlike the modal-triggering button it replaces,
 * the email field lives inline in the reading flow — one field, no modal, no
 * extra click — which is the higher-converting pattern for capturing readers at
 * the end of a story. On success it fires a SimpleAnalytics event so in-article
 * signups can be measured against other subscribe surfaces.
 */
export default function ArticleInlineCta() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || status === 'loading') return

    setStatus('loading')
    try {
      const result = await publicApi.subscribe({ email: email.trim(), language: i18n.language })
      if (!result.success) {
        setStatus('error')
        return
      }
      setStatus('success')
      if (typeof window.sa_event === 'function') window.sa_event('subscribe_article')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="my-10 rounded-xl overflow-hidden border border-accent-100">
      <div className="bg-accent-500 px-6 py-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-widest text-accent-100 mb-1">
              {t('articleCta.eyebrow')}
            </p>
            <p className="text-white font-bold text-base leading-snug">
              {t('articleCta.headline')}
            </p>
          </div>

          {status === 'success' ? (
            <p
              role="status"
              className="shrink-0 text-white font-semibold text-sm sm:max-w-xs sm:text-right"
            >
              {t('articleCta.success')}
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="shrink-0 flex flex-col sm:flex-row w-full sm:w-auto gap-2">
              <label htmlFor="article-cta-email" className="sr-only">
                {t('articleCta.emailLabel')}
              </label>
              <input
                id="article-cta-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('articleCta.placeholder')}
                className="w-full sm:w-56 px-4 py-2.5 text-sm rounded-lg bg-white text-neutral-900 placeholder-neutral-400 outline-none focus:ring-2 focus:ring-white"
                aria-describedby={status === 'error' ? 'article-cta-error' : undefined}
              />
              <button
                type="submit"
                disabled={status === 'loading'}
                className="shrink-0 inline-flex items-center justify-center gap-2 bg-white text-accent-600 font-bold text-sm px-5 py-2.5 rounded-lg hover:bg-accent-50 transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-accent-500 disabled:opacity-70 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {status === 'loading' ? t('articleCta.submitting') : t('articleCta.submit')}
              </button>
            </form>
          )}
        </div>

        {status === 'error' && (
          <p id="article-cta-error" role="alert" className="text-accent-100 text-sm mt-2">
            {t('articleCta.error')}
          </p>
        )}
      </div>
    </div>
  )
}
