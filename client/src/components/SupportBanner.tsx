import { useTranslation } from 'react-i18next'
import { useSubscribe } from './SubscribeProvider'

const KOFI_URL = "https://ko-fi.com/impactoindigena"

function HeartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  )
}

function NewsletterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  )
}

export default function SupportBanner() {
  const { t } = useTranslation()
  const { openSubscribe } = useSubscribe()

  return (
    <div
      className="-mx-4 md:-mx-8 px-4 md:px-8 my-16 relative overflow-hidden"
      style={{
        background: 'linear-gradient(160deg, #0a4a30 0%, #0D5F3C 40%, #156040 100%)',
        paddingTop: 'clamp(3.5rem, 5vw, 5rem)',
        paddingBottom: 'clamp(3.5rem, 5vw, 5rem)',
      }}
    >
      {/* Subtle noise texture for depth */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '128px 128px',
        }}
      />

      {/* Decorative diamond watermark */}
      <div
        className="absolute right-8 top-1/2 -translate-y-1/2 pointer-events-none select-none hidden md:block"
        aria-hidden="true"
        style={{
          opacity: 0.04,
          fontSize: '18rem',
          fontFamily: 'Fraunces, Georgia, serif',
          fontWeight: 700,
          lineHeight: 1,
          color: '#fff',
        }}
      >
        ◆
      </div>

      <div className="relative z-10 max-w-2xl mx-auto text-center">
        {/* Eyebrow */}
        <p
          className="text-[10px] font-bold uppercase tracking-[0.16em] mb-6 font-dm-sans"
          style={{ color: 'rgba(255,255,255,0.45)' }}
        >
          {t('support.eyebrow', 'Periodismo indígena independiente')}
        </p>

        <h2 className="text-3xl md:text-4xl font-bold mb-6 leading-tight font-fraunces text-white">
          {t('support.heading', 'Voces que el mainstream ignora. Las cubrimos nosotros.')}
        </h2>

        <p
          className="text-base md:text-lg mb-10 leading-relaxed max-w-xl mx-auto font-lora"
          style={{ color: 'rgba(255,255,255,0.70)' }}
        >
          {t('support.message')}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          {/* Primary: subscribe */}
          <button
            onClick={() => openSubscribe()}
            className="group inline-flex items-center gap-2.5 px-7 py-3.5 text-sm font-bold rounded-full transition-all duration-200 ease-out focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-800 font-dm-sans"
            style={{
              backgroundColor: '#C8473A',
              color: '#fff',
              boxShadow: '0 2px 8px rgba(200, 71, 58, 0.35)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#b03d31'
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(200, 71, 58, 0.45)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#C8473A'
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(200, 71, 58, 0.35)'
            }}
          >
            <NewsletterIcon className="w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
            {t('nav.subscribe')}
          </button>

          {/* Secondary: ko-fi */}
          <a
            href={KOFI_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-2.5 px-7 py-3.5 text-sm font-bold rounded-full transition-all duration-200 ease-out focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-800 font-dm-sans"
            style={{
              border: '1px solid rgba(255,255,255,0.25)',
              color: 'rgba(255,255,255,0.90)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.55)'
              e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'
              e.currentTarget.style.transform = 'translateY(-1px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <HeartIcon className="w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
            {t('support.button')}
            <span className="sr-only">{t('support.opensInNewTab')}</span>
          </a>
        </div>
      </div>
    </div>
  )
}
