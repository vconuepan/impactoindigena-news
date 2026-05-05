// Heavy map component — only imported via lazy() in MapPage
// Keep all leaflet imports here so they're excluded from the main bundle
import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Polygon, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { API_BASE } from '../lib/api'
import type { Community } from '@shared/types'

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

interface PuebloData {
  id: string
  nombre: string
  nombrePropio?: string
  lat: number
  lng: number
  poblacion: string
  region: string
  lengua: string
  descripcion: string
  color: string
  guia?: string
  communitySlug?: string
}

const PUEBLOS: PuebloData[] = [
  {
    id: 'aymara',
    nombre: 'Aymara',
    lat: -18.5,
    lng: -69.3,
    poblacion: '156.754',
    region: 'Arica y Parinacota, Tarapacá',
    lengua: 'Aymara',
    descripcion: 'Pueblo andino del altiplano norte, con presencia en Chile, Bolivia y Perú. Reconocidos por la agricultura en terrazas, la ganadería de camélidos y el ritual andino.',
    color: '#f59e0b',
  },
  {
    id: 'quechua',
    nombre: 'Quechua',
    lat: -20.2,
    lng: -68.6,
    poblacion: '33.868',
    region: 'Antofagasta, Tarapacá',
    lengua: 'Quechua (runasimi)',
    descripcion: 'Pueblo andino cuya lengua, el quechua, es la más hablada entre los pueblos indígenas de América del Sur. En Chile habitan principalmente en el altiplano de Antofagasta.',
    color: '#d97706',
  },
  {
    id: 'atacameno',
    nombre: 'Atacameño',
    nombrePropio: 'Lickanantay',
    lat: -23.0,
    lng: -68.2,
    poblacion: '30.369',
    region: 'Antofagasta (Salar de Atacama)',
    lengua: 'Kunza (extinta) / Español',
    descripcion: 'Pueblo del desierto de Atacama. Su territorio incluye el Salar de Atacama, zona de alta demanda de litio. Reivindican control del agua y territorio frente a la minería.',
    color: '#dc2626',
  },
  {
    id: 'colla',
    nombre: 'Colla',
    lat: -27.5,
    lng: -68.8,
    poblacion: '20.744',
    region: 'Atacama (cordillera)',
    lengua: 'Español (lengua propia extinta)',
    descripcion: 'Pueblo trashumante de la Puna de Atacama, con tradición de pastoreo de camélidos en altura. Su territorio ancestral cruza concesiones mineras activas.',
    color: '#b45309',
  },
  {
    id: 'diaguita',
    nombre: 'Diaguita',
    lat: -29.0,
    lng: -70.3,
    poblacion: '88.474',
    region: 'Atacama, Coquimbo',
    lengua: 'Español (lengua propia extinta)',
    descripcion: 'Pueblo del norte chico, reconocido legalmente en 2006. Habitaron los valles transversales entre Atacama y Coquimbo. Conocidos por su cerámica característica de diseños geométricos.',
    color: '#7c3aed',
  },
  {
    id: 'mapuche',
    nombre: 'Mapuche',
    lat: -38.7,
    lng: -72.6,
    poblacion: '1.745.147',
    region: 'Araucanía, Los Ríos, Los Lagos, R. Metropolitana',
    lengua: 'Mapuzungún',
    descripcion: 'El pueblo más numeroso de Chile (79,8% de la población indígena nacional). Su territorio ancestral, el Wallmapu, se extiende desde el Biobío hasta la Patagonia.',
    color: '#059669',
    guia: '/guia/pueblo-mapuche',
    communitySlug: 'mapuche',
  },
  {
    id: 'lafkenche',
    nombre: 'Lafkenche',
    lat: -38.9,
    lng: -73.5,
    poblacion: '14.093',
    region: 'Araucanía y Los Lagos (costa)',
    lengua: 'Mapuzungún',
    descripcion: 'Subgrupo mapuche costero ("gente del mar"). La Ley Lafkenche (2008) reconoce su derecho a los espacios costeros marinos de uso ancestral.',
    color: '#0891b2',
  },
  {
    id: 'rapanui',
    nombre: 'Rapanui',
    lat: -27.1,
    lng: -109.4,
    poblacion: '9.399',
    region: 'Isla de Pascua (3.700 km del continente)',
    lengua: 'Rapanui / Español',
    descripcion: 'Pueblo polinesio de Rapa Nui. Creadores de los moai. Reivindican autonomía y control territorial sobre la isla. Su cultura es de origen polinesio, no andino.',
    color: '#db2777',
  },
  {
    id: 'kawesqar',
    nombre: 'Kawésqar',
    lat: -49.1,
    lng: -74.4,
    poblacion: '3.448',
    region: 'Magallanes (canales patagónicos)',
    lengua: 'Kawésqar (en extinción crítica)',
    descripcion: 'Pueblo nómade del mar de los canales patagónicos. En situación crítica de extinción cultural: quedan menos de diez hablantes con dominio nativo de la lengua.',
    color: '#0369a1',
  },
  {
    id: 'yagan',
    nombre: 'Yagán',
    lat: -54.9,
    lng: -67.6,
    poblacion: '~1.600',
    region: 'Cabo de Hornos, Tierra del Fuego',
    lengua: 'Yagán (extinta en 2022)',
    descripcion: 'El pueblo más austral del planeta. La última hablante nativa fluida del yagán, Cristina Calderón, falleció en 2022. Su memoria es patrimonio inmaterial de la humanidad.',
    color: '#1e3a5f',
  },
]

// Approximate territory polygon — Wallmapu (simplified)
const WALLMAPU_POLYGON: [number, number][] = [
  [-37.0, -73.5], [-37.0, -70.5], [-38.5, -70.0], [-39.5, -70.5],
  [-40.5, -71.0], [-41.5, -71.5], [-43.0, -72.5], [-43.5, -73.5],
  [-42.5, -74.0], [-40.5, -73.5], [-38.5, -73.5], [-37.5, -73.8],
]

// Approximate territory polygon — Norte Grande / Aymara altiplano (simplified)
const NORTE_GRANDE_POLYGON: [number, number][] = [
  [-17.5, -70.5], [-17.5, -67.5], [-22.5, -67.5], [-22.5, -69.5],
  [-21.0, -70.0], [-19.5, -70.2],
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// Color by community type (distinct from the educational markers)
const COMMUNITY_TYPE_COLOR: Record<string, string> = {
  PUEBLO: '#4f46e5',     // indigo — pueblos
  TERRITORIO: '#0891b2', // cyan — territorios
  CAUSA: '#7c3aed',      // violet — causas
}

export default function MapWidget() {
  const [selected, setSelected] = useState<string | null>(null)
  const [communities, setCommunities] = useState<Community[]>([])

  // Fetch DB-driven communities with coordinates
  useEffect(() => {
    fetch(`${API_BASE}/communities`)
      .then((r) => r.json())
      .then((data: Community[]) => {
        setCommunities(data.filter((c) => c.lat != null && c.lng != null))
      })
      .catch(() => { /* non-fatal — map works without live pins */ })
  }, [])

  // Chile mainland center (excluding Easter Island)
  const CENTER: [number, number] = [-36.0, -71.5]

  return (
    <MapContainer
      center={CENTER}
      zoom={5}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Territory polygons */}
      <Polygon
        positions={WALLMAPU_POLYGON}
        pathOptions={{ color: '#059669', fillColor: '#059669', fillOpacity: 0.12, weight: 1.5, dashArray: '4 4' }}
      />
      <Polygon
        positions={NORTE_GRANDE_POLYGON}
        pathOptions={{ color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.1, weight: 1.5, dashArray: '4 4' }}
      />

      {/* Pueblo markers */}
      {PUEBLOS.map((pueblo) => (
        <CircleMarker
          key={pueblo.id}
          center={[pueblo.lat, pueblo.lng]}
          radius={selected === pueblo.id ? 14 : pueblo.id === 'mapuche' ? 12 : 8}
          pathOptions={{
            color: pueblo.color,
            fillColor: pueblo.color,
            fillOpacity: 0.85,
            weight: 2,
          }}
          eventHandlers={{
            click: () => setSelected(pueblo.id),
            popupopen: () => setSelected(pueblo.id),
            popupclose: () => setSelected(null),
          }}
        >
          <Popup>
            <div style={{ minWidth: 220, maxWidth: 280 }}>
              <div style={{ marginBottom: 6 }}>
                <strong style={{ fontSize: 15, color: '#111' }}>{pueblo.nombre}</strong>
                {pueblo.nombrePropio && (
                  <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 6 }}>
                    ({pueblo.nombrePropio})
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: pueblo.color, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {pueblo.lengua}
              </div>
              <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.5, marginBottom: 8 }}>
                {pueblo.descripcion}
              </p>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>
                <span style={{ fontWeight: 600 }}>Región:</span> {pueblo.region}
              </div>
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>
                <span style={{ fontWeight: 600 }}>Población (Censo 2017):</span> {pueblo.poblacion}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {pueblo.guia && (
                  <a
                    href={pueblo.guia}
                    style={{ fontSize: 11, fontWeight: 600, color: '#059669', textDecoration: 'none' }}
                  >
                    Leer guía →
                  </a>
                )}
                {pueblo.communitySlug ? (
                  <a
                    href={`/comunidad/${pueblo.communitySlug}`}
                    style={{ fontSize: 11, fontWeight: 600, color: '#6366f1', textDecoration: 'none' }}
                  >
                    Ver noticias →
                  </a>
                ) : (
                  <a
                    href={`/search?q=${encodeURIComponent(pueblo.nombre)}`}
                    style={{ fontSize: 11, fontWeight: 600, color: '#6366f1', textDecoration: 'none' }}
                  >
                    Buscar noticias →
                  </a>
                )}
                <a
                  href={`/issues/chile-indigena`}
                  style={{ fontSize: 11, fontWeight: 600, color: '#0891b2', textDecoration: 'none' }}
                >
                  Chile indígena →
                </a>
              </div>
            </div>
          </Popup>
        </CircleMarker>
      ))}

      {/* Live community pins — DB-driven, shown when lat/lng is set */}
      {communities.map((c) => {
        const color = COMMUNITY_TYPE_COLOR[c.type] ?? '#6b7280'
        const markerId = `community-${c.slug}`
        return (
          <CircleMarker
            key={c.slug}
            center={[c.lat!, c.lng!]}
            radius={selected === markerId ? 11 : 7}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity: 0.9,
              weight: 2.5,
            }}
            eventHandlers={{
              click: () => setSelected(markerId),
              popupopen: () => setSelected(markerId),
              popupclose: () => setSelected(null),
            }}
          >
            <Popup>
              <div style={{ minWidth: 200, maxWidth: 260 }}>
                <div style={{ marginBottom: 4 }}>
                  <strong style={{ fontSize: 14, color: '#111' }}>{c.name}</strong>
                </div>
                {c.region && (
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>{c.region}</div>
                )}
                <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.5, marginBottom: 8 }}>
                  {c.description.slice(0, 120)}{c.description.length > 120 ? '…' : ''}
                </p>
                <a
                  href={`/comunidad/${c.slug}`}
                  style={{ fontSize: 12, fontWeight: 600, color, textDecoration: 'none' }}
                >
                  Ver noticias →
                </a>
              </div>
            </Popup>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}
