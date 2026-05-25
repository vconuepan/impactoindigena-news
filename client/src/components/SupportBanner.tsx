import { useTranslation } from 'react-i18next'
import { useSubscribe } from './SubscribeProvider'

const KOFI_URL = "https://ko-fi.com/impactoindigena"

function NewsletterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  )
}

function HeartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  )
}

export default function SupportBanner() {
  const { t } = useTranslation()
  const { openSubscribe } = useSubscribe()

  return (
    <div className="-mx-4 md:-mx-8 px-4 md:px-8 my-16 bg-brand-900 py-14 md:py-16">
      <div className="max-w-2xl mx-auto text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] mb-6 font-dm-sans text-white/40">
          {t('support.eyebrow', 'Periodismo indígena independiente')}
        </p>

        <h2 className="text-3xl md:text-4xl font-bold mb-6 leading-tight font-fraunces text-white">
          {t('support.heading', 'Voces que el mainstream ignora. Las cubrimos nosotros.')}
        </h2>

        <p className="text-base md:text-lg mb-10 leading-relaxed max-w-xl mx-auto font-lora text-white/65">
          {t('support.message')}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => openSubscribe()}
            className="inline-flex items-center gap-2.5 px-7 py-3.5 text-sm font-bold rounded-full font-dm-sans bg-accent-500 text-white hover:bg-accent-600 transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-900"
          >
            <NewsletterIcon className="w-4 h-4 shrink-0" />
            {t('nav.subscribe')}
          </button>

          <a
            href={KOFI_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 px-7 py-3.5 text-sm font-bold rounded-full font-dm-sans border border-white/20 text-white/85 hover:border-white/45 hover:bg-white/5 transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-900"
          >
            <HeartIcon className="w-4 h-4 shrink-0" />
            {t('support.button')}
            <span className="sr-only">{t('support.opensInNewTab')}</span>
          </a>
        </div>
      </div>
    </div>
  )
}
