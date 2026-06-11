import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import PublicLayout from './layouts/PublicLayout'
import HomePage from './pages/HomePage'
import NotFoundPage from './pages/NotFoundPage'
import { LoadingSpinner } from './components/ui/LoadingSpinner'
import { ChunkErrorBoundary } from './components/ui/ChunkErrorBoundary'

// Public pages — lazy-loaded to reduce homepage bundle size
// Puppeteer prerenderer waits for chunks to load, so prerendering still works
const StoryPage = lazy(() => import('./pages/StoryPage'))
const IssuePage = lazy(() => import('./pages/IssuePage'))
const IssuesIndexPage = lazy(() => import('./pages/IssuesPage'))
const MethodologyPage = lazy(() => import('./pages/MethodologyPage'))
const AboutPage = lazy(() => import('./pages/AboutPage'))
const ImprintPage = lazy(() => import('./pages/ImprintPage'))
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'))
const TermsPage = lazy(() => import('./pages/TermsPage'))
const CookiesPage = lazy(() => import('./pages/CookiesPage'))
const SearchPage = lazy(() => import('./pages/SearchPage'))
const SubscribedPage = lazy(() => import('./pages/SubscribedPage'))
const DevelopersPage = lazy(() => import('./pages/DevelopersPage'))
const EmbedPage = lazy(() => import('./pages/EmbedPage'))
const WidgetGeneratorPage = lazy(() => import('./pages/WidgetGeneratorPage'))
const SavedPage = lazy(() => import('./pages/SavedPage'))
const ComparePage = lazy(() => import('./pages/ComparePage'))
const WhyItMattersPage = lazy(() => import('./pages/WhyItMattersPage'))
const SourcesPage = lazy(() => import('./pages/SourcesPage'))
const NoAdsNoTrackingPage = lazy(() => import('./pages/NoAdsNoTrackingPage'))
const NewsFatiguePage = lazy(() => import('./pages/NewsFatiguePage'))
const FreeApiPage = lazy(() => import('./pages/FreeApiPage'))
const NewsletterPage = lazy(() => import('./pages/NewsletterPage'))
const FeedbackPagePublic = lazy(() => import('./pages/FeedbackPage'))
const ThankYouPage = lazy(() => import('./pages/ThankYouPage'))
const CommunityDirectoryPage = lazy(() => import('./pages/CommunityDirectoryPage'))
const CommunityPage = lazy(() => import('./pages/CommunityPage'))
const MagicLinkSentPage = lazy(() => import('./pages/MagicLinkSentPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const GuidesIndexPage = lazy(() => import('./pages/GuidesIndexPage'))
const GlossaryPage = lazy(() => import('./pages/GlossaryPage'))
const MapPage = lazy(() => import('./pages/MapPage'))
const MapuchePage = lazy(() => import('./pages/MapuchePage'))
const FpicPage = lazy(() => import('./pages/FpicPage'))
const ChileHubPage = lazy(() => import('./pages/ChileHubPage'))
const C169Page = lazy(() => import('./pages/C169Page'))
const IAJurisprudencePage = lazy(() => import('./pages/IAJurisprudencePage'))
const UnidripPage = lazy(() => import('./pages/UnidripPage'))
const OpenDataPage = lazy(() => import('./pages/OpenDataPage'))
const NewsletterArchivePage = lazy(() => import('./pages/NewsletterArchivePage'))
const NewsletterDetailPagePublic = lazy(() => import('./pages/NewsletterDetailPage'))
const CasesPage = lazy(() => import('./pages/CasesPage'))
const CasePage = lazy(() => import('./pages/CasePage'))
const AlertsPage = lazy(() => import('./pages/AlertsPage'))
const VocesIndigenasPage = lazy(() => import('./pages/VocesIndigenas'))
const VocesIndigenasDetailPage = lazy(() => import('./pages/VocesIndigenasDetail'))

// Admin pages — lazy-loaded so public visitors never download admin code
const AdminLayout = lazy(() => import('./layouts/AdminLayout'))
const LoginPage = lazy(() => import('./pages/admin/LoginPage'))
const DashboardPage = lazy(() => import('./pages/admin/DashboardPage'))
const StoriesPage = lazy(() => import('./pages/admin/StoriesPage'))
const StoryDetailPage = lazy(() => import('./pages/admin/StoryDetailPage'))
const FeedsPage = lazy(() => import('./pages/admin/FeedsPage'))
const IssuesPage = lazy(() => import('./pages/admin/IssuesPage'))
const IssueEditPage = lazy(() => import('./pages/admin/IssueEditPage'))
const NewslettersPage = lazy(() => import('./pages/admin/NewslettersPage'))
const NewsletterDetailPage = lazy(() => import('./pages/admin/NewsletterDetailPage'))
const PodcastsPage = lazy(() => import('./pages/admin/PodcastsPage'))
const PodcastDetailPage = lazy(() => import('./pages/admin/PodcastDetailPage'))
const JobsPage = lazy(() => import('./pages/admin/JobsPage'))
const UsersPage = lazy(() => import('./pages/admin/UsersPage'))
const ClustersPage = lazy(() => import('./pages/admin/ClustersPage'))
const InstagramPage = lazy(() => import('./pages/admin/InstagramPage'))
const LinkedInPage = lazy(() => import('./pages/admin/LinkedInPage'))
const FeedbackPage = lazy(() => import('./pages/admin/FeedbackPage'))
const MembersPage = lazy(() => import('./pages/admin/MembersPage'))
const CommunitiesAdminPage = lazy(() => import('./pages/admin/CommunitiesAdminPage'))
const MaintenancePage = lazy(() => import('./pages/admin/MaintenancePage'))
const SpotlightsAdminPage = lazy(() => import('./pages/admin/SpotlightsAdminPage'))
const CasesAdminPage = lazy(() => import('./pages/admin/CasesAdminPage'))
const SubscribersPage = lazy(() => import('./pages/admin/SubscribersPage'))
const AnalyticsPage = lazy(() => import('./pages/admin/AnalyticsPage'))
const EditorialsPage = lazy(() => import('./pages/admin/EditorialsPage'))
const EditorialDetailPage = lazy(() => import('./pages/admin/EditorialDetailPage'))

/** Preload the admin layout and dashboard chunks (call from LoginPage). */
export function preloadAdminChunks() {
  import('./layouts/AdminLayout')
  import('./pages/admin/DashboardPage')
}

function PageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <LoadingSpinner size="lg" />
    </div>
  )
}

function StandalonePageFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="sr-only">Loading</h1>
      <LoadingSpinner size="lg" />
    </main>
  )
}

/** Wrap lazy-loaded page in Suspense with error boundary */
function LazyPage({ children }: { children: React.ReactNode }) {
  return (
    <ChunkErrorBoundary>
      <Suspense fallback={<PageFallback />}>{children}</Suspense>
    </ChunkErrorBoundary>
  )
}

export default function App() {
  return (
    <Routes>
      {/* Public routes — homepage static, others lazy-loaded */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/stories/:slug" element={<LazyPage><StoryPage /></LazyPage>} />
        <Route path="/issues" element={<LazyPage><IssuesIndexPage /></LazyPage>} />
        <Route path="/issues/:slug" element={<LazyPage><IssuePage /></LazyPage>} />
        <Route path="/methodology" element={<LazyPage><MethodologyPage /></LazyPage>} />
        <Route path="/about" element={<LazyPage><AboutPage /></LazyPage>} />
        <Route path="/imprint" element={<LazyPage><ImprintPage /></LazyPage>} />
        <Route path="/privacy" element={<LazyPage><PrivacyPage /></LazyPage>} />
        <Route path="/terminos" element={<LazyPage><TermsPage /></LazyPage>} />
        <Route path="/cookies" element={<LazyPage><CookiesPage /></LazyPage>} />
        <Route path="/search" element={<LazyPage><SearchPage /></LazyPage>} />
        <Route path="/subscribed" element={<LazyPage><SubscribedPage /></LazyPage>} />
        {/* DevelopersPage moved outside PublicLayout — Scalar styles clash with site theme */}
        <Route path="/widgets" element={<LazyPage><WidgetGeneratorPage /></LazyPage>} />
        <Route path="/embed-widget" element={<LazyPage><WidgetGeneratorPage /></LazyPage>} />
        <Route path="/saved" element={<LazyPage><SavedPage /></LazyPage>} />
        <Route path="/compare" element={<LazyPage><ComparePage /></LazyPage>} />
        <Route path="/por-que-importa" element={<LazyPage><WhyItMattersPage /></LazyPage>} />
        <Route path="/fuentes" element={<LazyPage><SourcesPage /></LazyPage>} />
        <Route path="/no-ads-no-tracking" element={<LazyPage><NoAdsNoTrackingPage /></LazyPage>} />
        <Route path="/news-fatigue" element={<LazyPage><NewsFatiguePage /></LazyPage>} />
        <Route path="/free-api" element={<LazyPage><FreeApiPage /></LazyPage>} />
        <Route path="/newsletter" element={<LazyPage><NewsletterPage /></LazyPage>} />
        <Route path="/feedback" element={<LazyPage><FeedbackPagePublic /></LazyPage>} />
        <Route path="/thank-you" element={<LazyPage><ThankYouPage /></LazyPage>} />
        <Route path="/comunidades" element={<LazyPage><CommunityDirectoryPage /></LazyPage>} />
        <Route path="/comunidad/:slug" element={<LazyPage><CommunityPage /></LazyPage>} />
        <Route path="/magic-sent" element={<LazyPage><MagicLinkSentPage /></LazyPage>} />
        <Route path="/perfil" element={<LazyPage><ProfilePage /></LazyPage>} />
        <Route path="/glosario" element={<LazyPage><GlossaryPage /></LazyPage>} />
        <Route path="/mapa" element={<LazyPage><MapPage /></LazyPage>} />
        <Route path="/guia" element={<LazyPage><GuidesIndexPage /></LazyPage>} />
        <Route path="/guia/pueblo-mapuche" element={<LazyPage><MapuchePage /></LazyPage>} />
        <Route path="/guia/consulta-previa-fpic" element={<LazyPage><FpicPage /></LazyPage>} />
        <Route path="/guia/pueblos-indigenas-chile" element={<LazyPage><ChileHubPage /></LazyPage>} />
        <Route path="/guia/c169-pais-por-pais" element={<LazyPage><C169Page /></LazyPage>} />
        <Route path="/guia/jurisprudencia-interamericana" element={<LazyPage><IAJurisprudencePage /></LazyPage>} />
        <Route path="/guia/declaracion-onu-undrip" element={<LazyPage><UnidripPage /></LazyPage>} />
        <Route path="/opendata" element={<LazyPage><OpenDataPage /></LazyPage>} />
        <Route path="/archivo" element={<LazyPage><NewsletterArchivePage /></LazyPage>} />
        <Route path="/archivo/:id" element={<LazyPage><NewsletterDetailPagePublic /></LazyPage>} />
        <Route path="/casos" element={<LazyPage><CasesPage /></LazyPage>} />
        <Route path="/caso/:slug" element={<LazyPage><CasePage /></LazyPage>} />
        <Route path="/alertas" element={<LazyPage><AlertsPage /></LazyPage>} />
        <Route path="/voces-indigenas" element={<LazyPage><VocesIndigenasPage /></LazyPage>} />
        <Route path="/voces-indigenas/:id" element={<LazyPage><VocesIndigenasDetailPage /></LazyPage>} />
      </Route>

      {/* Embed page — no layout wrapper */}
      <Route
        path="/embed"
        element={<LazyPage><EmbedPage /></LazyPage>}
      />

      {/* Developers page — standalone to avoid site theme clashing with Scalar styles */}
      <Route
        path="/developers"
        element={<LazyPage><DevelopersPage /></LazyPage>}
      />

      {/* Admin routes — lazy-loaded with error boundary for chunk failures */}
      <Route
        path="/admin/login"
        element={
          <ChunkErrorBoundary>
            <Suspense fallback={<StandalonePageFallback />}><LoginPage /></Suspense>
          </ChunkErrorBoundary>
        }
      />
      <Route
        path="/admin"
        element={
          <ChunkErrorBoundary>
            <Suspense fallback={<StandalonePageFallback />}><AdminLayout /></Suspense>
          </ChunkErrorBoundary>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="stories" element={<StoriesPage />} />
        <Route path="stories/:id" element={<StoryDetailPage />} />
        <Route path="feeds" element={<FeedsPage />} />
        <Route path="issues" element={<IssuesPage />} />
        <Route path="issues/new" element={<IssueEditPage />} />
        <Route path="issues/:id/edit" element={<IssueEditPage />} />
        <Route path="newsletters" element={<NewslettersPage />} />
        <Route path="newsletters/:id" element={<NewsletterDetailPage />} />
        <Route path="podcasts" element={<PodcastsPage />} />
        <Route path="podcasts/:id" element={<PodcastDetailPage />} />
        <Route path="editorials" element={<EditorialsPage />} />
        <Route path="editorials/:id" element={<EditorialDetailPage />} />
        <Route path="jobs" element={<JobsPage />} />
        <Route path="clusters" element={<ClustersPage />} />
        <Route path="instagram" element={<InstagramPage />} />
        <Route path="linkedin" element={<LinkedInPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="members" element={<MembersPage />} />
        <Route path="communities" element={<CommunitiesAdminPage />} />
        <Route path="feedback" element={<FeedbackPage />} />
        <Route path="maintenance" element={<MaintenancePage />} />
        <Route path="subscribers" element={<SubscribersPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="spotlights" element={<SpotlightsAdminPage />} />
        <Route path="casos" element={<CasesAdminPage />} />
      </Route>

      {/* Catch-all */}
      <Route element={<PublicLayout />}>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
