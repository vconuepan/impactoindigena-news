/**
 * CommunityMap — interactive Leaflet map for PUEBLO and TERRITORIO communities.
 *
 * Only rendered on /mapa. Leaflet is NOT imported anywhere else to keep the
 * main bundle small. The parent page lazy-imports this component so Leaflet's
 * ~150KB only loads when the map page is visited.
 *
 * Leaflet's default icon images break under Vite because the bundler rewrites
 * asset URLs. We override the icon URL to use the CDN copy instead.
 */
import { useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Link } from 'react-router-dom'
import type { Community, CommunityType } from '@shared/types'

// Fix Leaflet's broken default icon paths under Vite
// (Leaflet tries to load images relative to the JS file, but Vite hashes them)
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// Color palette matching the directory page legend
const DOT_COLORS: Record<CommunityType, string> = {
  PUEBLO: '#16a34a',     // brand green
  TERRITORIO: '#f59e0b', // amber
  CAUSA: '#059669',      // emerald (not shown on map)
}

const DOT_FILL_OPACITY = 0.85

interface Props {
  communities: Community[]
}

// Fit map bounds to all markers on mount
function FitBounds({ communities }: { communities: Community[] }) {
  const map = useMap()
  useEffect(() => {
    const withCoords = communities.filter((c) => c.lat != null && c.lng != null)
    if (withCoords.length === 0) return
    const bounds = L.latLngBounds(withCoords.map((c) => [c.lat!, c.lng!]))
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 6 })
  }, [communities, map])
  return null
}

export default function CommunityMap({ communities }: Props) {
  const mappable = communities.filter(
    (c) => (c.type === 'PUEBLO' || c.type === 'TERRITORIO') && c.lat != null && c.lng != null
  )

  if (mappable.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-neutral-50 rounded-xl border border-neutral-200 text-neutral-400 text-sm">
        No hay comunidades con coordenadas todavía.
      </div>
    )
  }

  return (
    <MapContainer
      // Center on Latin America; FitBounds overrides on mount
      center={[-15, -65]}
      zoom={3}
      style={{ height: '520px', width: '100%', borderRadius: '0.75rem' }}
      className="z-0"
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <FitBounds communities={mappable} />

      {mappable.map((c) => (
        <CircleMarker
          key={c.slug}
          center={[c.lat!, c.lng!]}
          radius={c.type === 'PUEBLO' ? 8 : 10}
          pathOptions={{
            color: '#fff',
            weight: 1.5,
            fillColor: DOT_COLORS[c.type],
            fillOpacity: DOT_FILL_OPACITY,
          }}
          eventHandlers={{
            click: () => {
              window.location.href = `/comunidad/${c.slug}`
            },
          }}
        >
          <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
            <div className="text-center">
              <p className="font-semibold text-neutral-900 text-sm leading-tight">{c.name}</p>
              {c.region && (
                <p className="text-xs text-neutral-500 mt-0.5">{c.region}</p>
              )}
              <p className="text-xs text-brand-700 mt-1 font-medium">
                {c.type === 'PUEBLO' ? 'Pueblo' : 'Territorio'}
              </p>
              <p className="text-xs text-neutral-400 mt-0.5">Click para ver noticias</p>
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}

// Re-export a list panel for communities without coordinates
export function NoCoordsList({ communities }: Props) {
  const noCoords = communities.filter(
    (c) => (c.type === 'PUEBLO' || c.type === 'TERRITORIO') && (c.lat == null || c.lng == null)
  )
  if (noCoords.length === 0) return null

  return (
    <div className="mt-6">
      <p className="text-xs text-neutral-400 mb-3">
        {noCoords.length} comunidad{noCoords.length !== 1 ? 'es' : ''} sin coordenadas — no aparece{noCoords.length !== 1 ? 'n' : ''} en el mapa:
      </p>
      <div className="flex flex-wrap gap-2">
        {noCoords.map((c) => (
          <Link
            key={c.slug}
            to={`/comunidad/${c.slug}`}
            className="text-xs px-2.5 py-1 rounded-full border border-neutral-200 text-neutral-600 hover:border-brand-300 hover:text-brand-800 transition-colors"
          >
            {c.name}
          </Link>
        ))}
      </div>
    </div>
  )
}
