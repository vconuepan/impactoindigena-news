import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { StoryFiltersBar } from './StoryFiltersBar'

function Ubicacion() {
  return <output data-testid="ubicacion">{useLocation().search}</output>
}

function montar(url = '/admin/stories') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <StoryFiltersBar issues={[]} feeds={[]} />
      <Ubicacion />
    </MemoryRouter>,
  )
}

describe('StoryFiltersBar · nota con claves (decisión C7, 3-nov-2026)', () => {
  it('«Por revisar» pone bodyMethod=ia_sin_revision en la URL y vuelve a la página 1', () => {
    montar('/admin/stories?page=3')
    fireEvent.change(screen.getByLabelText('Nota con claves'), { target: { value: 'ia_sin_revision' } })
    const params = new URLSearchParams(screen.getByTestId('ubicacion').textContent ?? '')
    expect(params.get('bodyMethod')).toBe('ia_sin_revision')
    expect(params.get('page')).toBeNull()
  })

  it('lee el filtro desde la URL y «Todas» lo quita', () => {
    montar('/admin/stories?bodyMethod=ia_revisada')
    const select = screen.getByLabelText('Nota con claves') as HTMLSelectElement
    expect(select.value).toBe('ia_revisada')
    fireEvent.change(select, { target: { value: '' } })
    expect(new URLSearchParams(screen.getByTestId('ubicacion').textContent ?? '').get('bodyMethod')).toBeNull()
  })
})
