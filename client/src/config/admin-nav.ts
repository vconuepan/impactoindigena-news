import {
  HomeIcon,
  DocumentTextIcon,
  RssIcon,
  TagIcon,
  EnvelopeIcon,
  MicrophoneIcon,
  ClockIcon,
  UserGroupIcon,
  IdentificationIcon,
  ShieldCheckIcon,
  Square3Stack3DIcon,
  ChatBubbleLeftEllipsisIcon,
  GlobeAltIcon,
  WrenchScrewdriverIcon,
  EnvelopeOpenIcon,
  ChartBarIcon,
  MegaphoneIcon,
  StarIcon,
  CameraIcon,
  BriefcaseIcon,
} from '@heroicons/react/24/outline'

export interface NavItem {
  name: string
  href: string
  icon: typeof HomeIcon
  end?: boolean
  /** Shows the unread-feedback count as a pill. */
  badge?: boolean
}

export interface NavSection {
  title?: string
  items: NavItem[]
}

// Single source of truth for admin destinations, shared by the sidebar and the
// command palette (⌘K). Grouped into task-based sections so 20 destinations stay
// scannable; each item has a distinct icon and a Spanish label.
export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { name: 'Panel', href: '/admin', icon: HomeIcon, end: true },
    ],
  },
  {
    title: 'Contenido',
    items: [
      { name: 'Noticias', href: '/admin/stories', icon: DocumentTextIcon },
      { name: 'Grupos', href: '/admin/clusters', icon: Square3Stack3DIcon },
      { name: 'Fuentes', href: '/admin/feeds', icon: RssIcon },
      { name: 'Temas', href: '/admin/issues', icon: TagIcon },
      { name: 'Voces Indígenas', href: '/admin/editorials', icon: MegaphoneIcon },
      { name: 'En Foco', href: '/admin/spotlights', icon: StarIcon },
      { name: 'Incidencia', href: '/admin/agenda', icon: GlobeAltIcon },
    ],
  },
  {
    title: 'Distribución',
    items: [
      { name: 'Boletines', href: '/admin/newsletters', icon: EnvelopeIcon },
      { name: 'Podcasts', href: '/admin/podcasts', icon: MicrophoneIcon },
      { name: 'Instagram', href: '/admin/instagram', icon: CameraIcon },
      { name: 'LinkedIn', href: '/admin/linkedin', icon: BriefcaseIcon },
    ],
  },
  {
    title: 'Audiencia',
    items: [
      { name: 'Comunidades', href: '/admin/communities', icon: UserGroupIcon },
      { name: 'Miembros', href: '/admin/members', icon: IdentificationIcon },
      { name: 'Suscriptores', href: '/admin/subscribers', icon: EnvelopeOpenIcon },
      { name: 'Comentarios', href: '/admin/feedback', icon: ChatBubbleLeftEllipsisIcon, badge: true },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { name: 'Analítica', href: '/admin/analytics', icon: ChartBarIcon },
      { name: 'Trabajos', href: '/admin/jobs', icon: ClockIcon },
      { name: 'Usuarios', href: '/admin/users', icon: ShieldCheckIcon },
      { name: 'Mantenimiento', href: '/admin/maintenance', icon: WrenchScrewdriverIcon },
    ],
  },
]

/** Flattened destinations, each tagged with its section title, for the palette. */
export const NAV_ITEMS: (NavItem & { section: string })[] = NAV_SECTIONS.flatMap((s) =>
  s.items.map((item) => ({ ...item, section: s.title ?? 'General' })),
)
