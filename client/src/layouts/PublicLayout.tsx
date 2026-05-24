import { useState, useEffect, useRef, useLayoutEffect, useCallback } from "react";
import { usePageTracking } from "../hooks/usePageTracking";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { getCategoryColor } from "../lib/category-colors";
import { API_BASE, memberAuth } from "../lib/api";
import { BRAND, GITHUB_REPO_URL, ECOSYSTEM_AI_URL } from "../config";
import { SEO } from "../lib/seo";
import { getSavedSlugs } from "../lib/preferences";
import SubscribeProvider, {
  useSubscribe,
} from "../components/SubscribeProvider";
import FeedbackProvider, { useFeedback } from "../components/FeedbackProvider";
import { PositivityProvider } from "../contexts/PositivityContext";
import { MoodDialPanel } from "../components/PositivitySlider";

const KOFI_URL = "https://ko-fi.com/impactoindigena";
const INSTAGRAM_URL = "https://www.instagram.com/impactoindigena";
const TWITTER_URL = "https://x.com/impactoindigena";
const YOUTUBE_URL = "https://www.youtube.com/@impactoindigena/";
const GITHUB_URL = GITHUB_REPO_URL;

const ISSUE_LINKS = [
  {
    labelKey: "issues.climaBiodiversidad",
    slug: "cambio-climatico",
    href: "/issues/cambio-climatico",
  },
  {
    labelKey: "issues.derechosIndigenas",
    slug: "derechos-indigenas",
    href: "/issues/derechos-indigenas",
  },
  {
    labelKey: "issues.desarrolloSostenible",
    slug: "desarrollo-sostenible-y-autodeterminado",
    href: "/issues/desarrollo-sostenible-y-autodeterminado",
  },
  {
    labelKey: "issues.chileIndigena",
    slug: "chile-indigena",
    href: "/issues/chile-indigena",
  },
];

const FOOTER_NAV = [
  { labelKey: "footer.about", href: "/about" },
  { labelKey: "footer.methodology", href: "/methodology" },
  { labelKey: "footer.topics", href: "/issues" },
  { labelKey: "footer.communities", href: "/comunidades" },
  { labelKey: "footer.newsletter", href: "/newsletter" },
  { labelKey: "footer.archive", href: "/archivo" },
  { labelKey: "footer.cases", href: "/casos" },
  { labelKey: "footer.alerts", href: "/alertas" },
  { labelKey: "footer.contact", href: "/feedback" },
  { labelKey: "footer.voces", href: "/voces-indigenas" },
];

const FOOTER_GUIDES = [
  { labelKey: 'footer.guideMapuche', href: '/guia/pueblo-mapuche' },
  { labelKey: 'footer.guideFpic', href: '/guia/consulta-previa-fpic' },
  { labelKey: 'footer.guideChile', href: '/guia/pueblos-indigenas-chile' },
  { labelKey: 'footer.glossary', href: '/glosario' },
  { labelKey: 'footer.map', href: '/mapa' },
]

const FOOTER_LEGAL = [
  { labelKey: "footer.imprint", href: "/imprint" },
  { labelKey: "footer.privacy", href: "/privacy" },
  { labelKey: "footer.noTracking", href: "/no-ads-no-tracking" },
];

// External distribution tools — give these pages discoverability
const FOOTER_DISTRIBUTE = [
  { labelKey: "footer.widgetForYourSite", href: "/widgets" },
  { labelKey: "footer.whyItMatters", href: "/por-que-importa" },
  { labelKey: "footer.sources", href: "/fuentes" },
  { labelKey: "footer.comparePage", href: "/compare" },
  { labelKey: "footer.freeApi", href: "/free-api" },
  { labelKey: "footer.openData", href: "/opendata" },
  { labelKey: "footer.newsFatigue", href: "/news-fatigue" },
];

function BrandLogo({ onClick }: { onClick?: () => void }) {
  return (
    <Link to="/" onClick={onClick} className="flex items-center shrink-0">
      <img
        src="/images/logo-horizontal.png"
        alt="Impacto Indígena"
        className="h-14 md:h-[4.5rem] w-auto"
      />
    </Link>
  );
}

function CategoryColorStrip({ className }: { className?: string }) {
  return (
    <div className={`flex h-[3px] ${className ?? ""}`} aria-hidden="true">
      <div className="flex-1" style={{ backgroundColor: '#34d399' }} />
      <div className="flex-1" style={{ backgroundColor: '#fb923c' }} />
      <div className="flex-1" style={{ backgroundColor: '#fbbf24' }} />
      <div className="flex-1" style={{ backgroundColor: '#38bdf8' }} />
      <div className="flex-1" style={{ backgroundColor: '#a78bfa' }} />
    </div>
  );
}

function NewsletterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

export default function PublicLayout() {
  return (
    <PositivityProvider>
      <SubscribeProvider>
        <FeedbackProvider>
          <PublicLayoutInner />
        </FeedbackProvider>
      </SubscribeProvider>
    </PositivityProvider>
  );
}

function PublicLayoutInner() {
  usePageTracking();
  const { t, i18n } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [savedCount, setSavedCount] = useState(0);
  const { openSubscribe } = useSubscribe();
  const { openFeedback } = useFeedback();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const menuDialogRef = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const refreshSavedCount = useCallback(() => {
    setSavedCount(getSavedSlugs().length);
  }, []);

  useEffect(() => {
    refreshSavedCount();
    window.addEventListener("storage", refreshSavedCount);
    window.addEventListener("ar-saved-changed", refreshSavedCount);
    return () => {
      window.removeEventListener("storage", refreshSavedCount);
      window.removeEventListener("ar-saved-changed", refreshSavedCount);
    };
  }, [refreshSavedCount]);

  const isActiveIssue = (href: string) =>
    location.pathname === href || location.pathname.startsWith(href + "/");

  useEffect(() => {
    const dialog = menuDialogRef.current;
    if (!dialog) return;
    if (menuOpen) { dialog.showModal(); } else { dialog.close(); }
  }, [menuOpen]);

  useEffect(() => {
    const dialog = menuDialogRef.current;
    if (!dialog) return;
    const handleCancel = (e: Event) => { e.preventDefault(); setMenuOpen(false); };
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (searchQuery) { setSearchQuery(""); } else { setSearchOpen(false); }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [searchOpen, searchQuery]);

  useEffect(() => {
    if (searchOpen) { requestAnimationFrame(() => searchInputRef.current?.focus()); }
  }, [searchOpen]);

  useEffect(() => {
    setSearchOpen(false);
    setSearchQuery("");
  }, [location.pathname]);

  useLayoutEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'es' ? 'en' : 'es');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Helmet>
        <link rel="alternate" type="application/rss+xml" title="Impacto Indígena RSS Feed" href={`${API_BASE}/feed`} />
        <link rel="alternate" hrefLang="es" href={`${SEO.siteUrl}${location.pathname}`} />
        <link rel="alternate" hrefLang="x-default" href={`${SEO.siteUrl}${location.pathname}`} />
      </Helmet>

      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded focus:shadow-lg focus:text-brand-800 focus-visible:ring-2 focus-visible:ring-brand-500">
        {t('nav.skipToContent')}
      </a>

      {/* Ecosystem bar */}
      <div className="bg-neutral-950 text-neutral-400 text-xs py-1.5 px-4 text-center">
        <span className="hidden sm:inline">Parte del Ecosistema Impacto Indígena · </span>
        <a
          href={ECOSYSTEM_AI_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-400 hover:text-brand-300 font-medium transition-colors focus-visible:ring-1 focus-visible:ring-brand-400 rounded"
        >
          impactoindigena.ai
          <span className="sr-only"> (abre en nueva pestaña)</span>
          {' '}↗
        </a>
        <span className="hidden sm:inline"> — Índice de Relacionamiento Indígena</span>
      </div>

      <header>
        <div className="bg-white border-b border-neutral-100">
          <div className="max-w-6xl mx-auto px-4 py-4 md:py-5 flex items-center justify-center relative">
            <BrandLogo />
            <div className="hidden lg:flex items-center absolute left-12 top-0 h-full">
              <MoodDialPanel />
            </div>
            <div className="hidden lg:flex items-center gap-1 absolute right-12 top-0 h-full">
              <Link to="/saved" className="inline-flex items-center gap-1.5 text-base font-normal tracking-wide transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-2 py-2.5 min-h-[44px] text-neutral-500 hover:text-brand-700">
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={1} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                {t('nav.saved')}{savedCount > 0 && ` (${savedCount})`}
              </Link>
              <button onClick={() => openSubscribe()} className="inline-flex items-center gap-1.5 text-sm font-bold tracking-wide transition-colors focus-visible:ring-2 focus-visible:ring-accent-500 rounded-full px-4 py-2.5 min-h-[44px] bg-accent-500 text-white hover:bg-accent-600">
                <NewsletterIcon className="w-3.5 h-3.5 shrink-0" />
                {t('nav.subscribe')}
              </button>
              <a
                href={KOFI_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-bold tracking-wide transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 rounded-full px-4 py-2.5 min-h-[44px] border border-brand-700 text-brand-800 hover:bg-brand-50"
              >
                {t('nav.support')}
                <span className="sr-only"> (opens in new tab)</span>
              </a>
              <button onClick={toggleLanguage} className="inline-flex items-center text-xs font-bold tracking-widest uppercase transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-2 py-2.5 min-h-[44px] text-neutral-400 hover:text-brand-700 border border-neutral-200 hover:border-brand-300" aria-label={t('language.current')}>
                {t('language.toggle')}
              </button>
            </div>
            <div className="lg:hidden absolute left-4 top-0 h-full flex items-center gap-1">
              <button onClick={() => { setSearchOpen(!searchOpen); setMenuOpen(false); }} className={`p-2 rounded transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 ${searchOpen ? "text-brand-800" : "text-neutral-400 hover:text-neutral-600"}`} aria-label={searchOpen ? t('nav.closeSearch') : t('nav.openSearch')} aria-expanded={searchOpen} aria-controls="search-panel">
                <SearchIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="lg:hidden absolute right-4 top-0 h-full flex items-center gap-1">
              <button onClick={toggleLanguage} className="text-xs font-bold tracking-widest uppercase transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-2 py-1 text-neutral-400 hover:text-neutral-600 border border-neutral-200" aria-label={t('language.current')}>
                {t('language.toggle')}
              </button>
              <button onClick={() => setMenuOpen(!menuOpen)} className="p-2 rounded focus-visible:ring-2 focus-visible:ring-brand-500" aria-expanded={menuOpen} aria-controls="mobile-nav-menu" aria-label={menuOpen ? t('nav.closeMenu') : t('nav.openMenu')}>
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  {menuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>

        <nav className="hidden lg:block border-b border-neutral-200" aria-label={t('nav.thematicCategories')}>
          <ul className="max-w-6xl mx-auto px-4 flex items-center justify-center gap-0">
            <li>
              <button onClick={() => setSearchOpen(!searchOpen)} className={`issue-nav-link ${searchOpen ? "!text-brand-800" : ""}`} aria-label={searchOpen ? t('nav.closeSearch') : t('nav.openSearch')} aria-expanded={searchOpen} aria-controls="search-panel">
                <SearchIcon className="w-5 h-5" />
              </button>
            </li>
            {ISSUE_LINKS.map((link) => {
              const colors = getCategoryColor(link.slug);
              const active = isActiveIssue(link.href);
              return (
                <li key={link.href}>
                  <Link to={link.href} className="issue-nav-link" data-active={active} style={{ "--issue-color": colors.hex } as React.CSSProperties}>
                    <span className={`w-3 h-3 rounded-full ${active ? "opacity-100" : "opacity-70"}`} style={{ backgroundColor: colors.hex }} aria-hidden="true" />
                    {t(link.labelKey)}
                  </Link>
                </li>
              );
            })}
            <li>
              <Link
                to="/comunidades"
                className="issue-nav-link"
                data-active={location.pathname.startsWith('/comunidad')}
              >
                <span className="w-2.5 h-2.5 rounded-full opacity-70" style={{ backgroundColor: '#0D5F3C' }} aria-hidden="true" />
                Comunidades
              </Link>
            </li>
            {memberAuth.isAuthenticated() && (
              <li>
                <Link
                  to="/perfil"
                  className="issue-nav-link"
                  data-active={location.pathname === '/perfil'}
                >
                  Mi perfil
                </Link>
              </li>
            )}
          </ul>
        </nav>

        <dialog ref={menuDialogRef} id="mobile-nav-menu" className="lg:hidden fixed top-0 left-0 w-full h-[100dvh] max-w-none max-h-none m-0 p-0 bg-transparent backdrop:bg-transparent overflow-hidden open:flex open:flex-col" aria-label={t('nav.mobileNav')}>
          <div className="bg-white">
            <div className="border-b border-neutral-100 px-4 py-3 md:py-4 flex items-start justify-center relative">
              <BrandLogo onClick={() => setMenuOpen(false)} />
              <div className="absolute right-4 top-3 md:top-4 h-14 md:h-16 flex items-center">
                <button onClick={() => setMenuOpen(false)} className="p-2 rounded focus-visible:ring-2 focus-visible:ring-brand-500" aria-label={t('nav.closeMenu')}>
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          <div className="bg-white border-b border-neutral-200 shadow-lg">
            <nav className="px-4 py-3">
              <div className="mb-3 py-2 flex justify-center">
                <MoodDialPanel />
              </div>
              <ul className="mb-3 border-t border-neutral-100 pt-3">
                {ISSUE_LINKS.map((link) => {
                  const colors = getCategoryColor(link.slug);
                  return (
                    <li key={link.href}>
                      <Link to={link.href} onClick={() => setMenuOpen(false)} className={`flex items-center gap-2 py-2.5 text-sm font-bold focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-2 ${isActiveIssue(link.href) ? "text-neutral-900" : "text-neutral-600 hover:text-neutral-900"}`}>
                        <span className={`w-2 h-2 rounded-full ${colors.dotBg}`} aria-hidden="true" />
                        {t(link.labelKey)}
                      </Link>
                    </li>
                  );
                })}
                <li>
                  <Link
                    to="/comunidades"
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-2 py-2.5 text-sm font-bold focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-2 ${location.pathname.startsWith('/comunidad') ? "text-neutral-900" : "text-neutral-600 hover:text-neutral-900"}`}
                  >
                    <span className="w-2 h-2 rounded-full bg-brand-800" aria-hidden="true" />
                    Comunidades
                  </Link>
                </li>
                <li>
                  <Link
                    to="/guia"
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-2 py-2.5 text-sm font-bold focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-2 ${location.pathname.startsWith('/guia') ? "text-neutral-900" : "text-neutral-600 hover:text-neutral-900"}`}
                  >
                    <span className="w-2 h-2 rounded-full bg-neutral-400" aria-hidden="true" />
                    {t('footer.guides')}
                  </Link>
                </li>
                <li>
                  <Link
                    to="/glosario"
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-2 py-2.5 text-sm font-bold focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-2 ${location.pathname === '/glosario' ? "text-neutral-900" : "text-neutral-600 hover:text-neutral-900"}`}
                  >
                    <span className="w-2 h-2 rounded-full bg-neutral-400" aria-hidden="true" />
                    {t('footer.glossary')}
                  </Link>
                </li>
                {memberAuth.isAuthenticated() && (
                  <li>
                    <Link
                      to="/perfil"
                      onClick={() => setMenuOpen(false)}
                      className={`flex items-center gap-2 py-2.5 text-sm font-bold focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-2 ${location.pathname === '/perfil' ? "text-neutral-900" : "text-neutral-600 hover:text-neutral-900"}`}
                    >
                      <span className="w-2 h-2 rounded-full bg-brand-400" aria-hidden="true" />
                      Mi perfil
                    </Link>
                  </li>
                )}
              </ul>
              <div className="border-t border-neutral-100 pt-3 px-2 flex flex-col">
                <Link to="/saved" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 py-2.5 text-sm font-bold text-brand-800 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 rounded">
                  <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={1} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                  {t('nav.savedNews')}{savedCount > 0 && ` (${savedCount})`}
                </Link>
                <button onClick={() => { setMenuOpen(false); openSubscribe(); }} className="flex items-center gap-2 py-2.5 text-sm font-bold text-brand-800 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 rounded">
                  <NewsletterIcon className="w-3.5 h-3.5 shrink-0" />
                  {t('nav.subscribe')}
                </button>
                <a
                  href={KOFI_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 py-2.5 text-sm font-bold text-brand-800 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
                >
                  {t('nav.support')}
                  <span className="sr-only"> (opens in new tab)</span>
                </a>
                <button onClick={() => { setMenuOpen(false); toggleLanguage(); }} className="flex items-center gap-2 py-2.5 text-sm font-bold text-neutral-500 hover:text-neutral-700 focus-visible:ring-2 focus-visible:ring-brand-500 rounded" aria-label={t('language.current')}>
                  {t('language.toggle')}
                </button>
              </div>
            </nav>
          </div>
          <div className="flex-1 bg-black/40" onClick={() => setMenuOpen(false)} aria-hidden="true" />
        </dialog>

        {searchOpen && (
          <div id="search-panel" className="bg-white border-b border-neutral-200 shadow-lg">
            <div className="max-w-3xl mx-auto px-4 py-4">
              <form onSubmit={(e) => { e.preventDefault(); if (searchQuery.trim()) { navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`); setSearchOpen(false); } }} className="relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400 pointer-events-none" />
                <input ref={searchInputRef} type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder={t('nav.searchPlaceholder')} className="w-full pl-10 pr-10 py-3 text-base border border-neutral-300 rounded-lg bg-neutral-50 focus:bg-white focus:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-500 outline-none transition-colors" aria-label={t('nav.searchLabel')} />
                <button type="button" onClick={() => { searchQuery ? setSearchQuery("") : setSearchOpen(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-600 transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 rounded" aria-label={t('nav.closeSearch')}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </form>
              <p className="text-xs text-neutral-400 mt-2 text-center">{t('nav.searchHint')}</p>
            </div>
          </div>
        )}
      </header>

      <main id="main-content" className="flex-1">
        <Outlet />
      </main>

      {/* Floating feedback button */}
      <button
        type="button"
        onClick={openFeedback}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 bg-brand-800 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2.5 rounded-full shadow-lg hover:shadow-xl transition-all focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        aria-label="Enviar comentarios"
      >
        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
        </svg>
        <span>Comentarios</span>
      </button>

      <div className="bg-white border-t border-neutral-100 py-10 md:py-14 text-center" aria-hidden="true">
        <div className="max-w-lg mx-auto px-4">
          <div className="flex items-center justify-center gap-4 mb-5">
            <span className="flex-1 border-t border-neutral-200" />
            <span className="text-neutral-300 text-xs">&#9670;</span>
            <span className="flex-1 border-t border-neutral-200" />
          </div>
          <p className="text-sm uppercase tracking-widest text-neutral-400 font-bold">
            {BRAND.claimSupport}
          </p>
        </div>
      </div>

      <footer className="bg-neutral-900 text-neutral-300">
        <CategoryColorStrip />
        <div className="max-w-5xl mx-auto px-4 py-12">
          <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-6 md:gap-8">
            <div className="col-span-2">
              <Link to="/" className="inline-block mb-3 font-fraunces text-xl font-bold text-white hover:text-brand-300 transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 rounded">
                Impacto Indígena
              </Link>
              <p className="text-sm text-neutral-400 leading-relaxed max-w-sm">
                {t('footer.description')}
              </p>
              <a
                href={ECOSYSTEM_AI_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-3 text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors focus-visible:ring-1 focus-visible:ring-brand-400 rounded"
              >
                impactoindigena.ai ↗
                <span className="sr-only"> (abre en nueva pestaña)</span>
              </a>
              <div className="flex gap-2 mt-4">
                {/* Instagram */}
                <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center w-8 h-8 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-brand-500" aria-label={t('footer.followInstagram')}>
                  <svg className="w-[18px] h-[18px] text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                </a>
                {/* Twitter/X */}
                <a href={TWITTER_URL} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center w-8 h-8 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-brand-500" aria-label={t('footer.followTwitter')}>
                  <svg className="w-[18px] h-[18px] text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.259 5.631L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/>
                  </svg>
                </a>
                {/* YouTube */}
                <a href={YOUTUBE_URL} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center w-8 h-8 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-brand-500" aria-label={t('footer.followYoutube')}>
                  <svg className="w-[18px] h-[18px] text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                  </svg>
                </a>
                {/* GitHub */}
                <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center w-8 h-8 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-brand-500" aria-label={t('footer.viewGithub')}>
                  <svg className="w-[18px] h-[18px] text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                </a>
              </div>
              <ul className="hidden md:flex gap-4 mt-4">
                {FOOTER_LEGAL.map((link) => (
                  <li key={link.labelKey}>
                    <Link to={link.href} className="text-xs text-neutral-400 hover:text-neutral-200 transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-0.5">
                      {t(link.labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="hidden md:block text-xs text-neutral-400 mt-2">
                {t('footer.copyright', { year: new Date().getFullYear() })}
              </p>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-3 leading-none" role="presentation">{t('footer.navigate')}</p>
              <ul className="space-y-2">
                {FOOTER_NAV.map((link) => (
                  <li key={link.labelKey} className="flex items-center">
                    <Link to={link.href} className="text-sm leading-5 text-neutral-400 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-0.5">
                      {t(link.labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-3 leading-none" role="presentation">{t('footer.connect')}</p>
              <ul className="space-y-2">
                <li className="flex items-center">
                  <Link to="/newsletter" className="text-sm leading-5 text-neutral-400 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-0.5">
                    {t('footer.newsletter')}
                  </Link>
                </li>
                <li className="flex items-center">
                  <a href={`${API_BASE}/feed`} className="text-sm leading-5 text-neutral-400 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-0.5">
                    {t('footer.rssFeed')}
                  </a>
                </li>
                <li className="flex items-center">
                  <a href={KOFI_URL} target="_blank" rel="noopener noreferrer" className="text-sm leading-5 text-neutral-400 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-0.5">
                    {t('footer.support')}
                  </a>
                </li>
                <li className="flex items-center">
                  <Link to="/feedback" className="text-sm leading-5 text-neutral-400 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-0.5">
                    {t('footer.contact')}
                  </Link>
                </li>
              </ul>
            </div>

            {/* Distribution — widget, compare, API */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-3 leading-none" role="presentation">{t('footer.distribute')}</p>
              <ul className="space-y-2">
                {FOOTER_DISTRIBUTE.map((link) => (
                  <li key={link.href} className="flex items-center">
                    <Link to={link.href} className="text-sm leading-5 text-neutral-400 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-0.5">
                      {t(link.labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-3 leading-none" role="presentation">{t('footer.topics')}</p>
              <ul className="space-y-2">
                {ISSUE_LINKS.map((link) => {
                  const colors = getCategoryColor(link.slug);
                  return (
                    <li key={link.href} className="flex items-center">
                      <Link to={link.href} className="inline-flex items-center gap-2 text-sm leading-5 text-neutral-400 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-0.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${colors.dotBg} opacity-70 shrink-0`} aria-hidden="true" />
                        {t(link.labelKey)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <Link to="/guia" className="text-xs font-bold uppercase tracking-widest text-neutral-400 hover:text-neutral-200 mt-5 mb-3 leading-none inline-block focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-0.5">
                {t('footer.guides')}
              </Link>
              <ul className="space-y-2">
                {FOOTER_GUIDES.map((link) => (
                  <li key={link.href} className="flex items-center">
                    <Link to={link.href} className="text-sm leading-5 text-neutral-400 hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-0.5">
                      {t(link.labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-7 md:hidden text-center">
            <ul className="flex justify-center gap-5">
              {FOOTER_LEGAL.map((link) => (
                <li key={link.labelKey}>
                  <Link to={link.href} className="text-xs text-neutral-400 hover:text-neutral-200 transition-colors focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-0.5">
                    {t(link.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="text-xs text-neutral-400 mt-3">
              {t('footer.copyright', { year: new Date().getFullYear() })}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
