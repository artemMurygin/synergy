import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { catalogFixture } from '../model/catalog.fixtures'
import { groupByStatus } from '../model/roadmap'
import { RoadmapBoard } from './RoadmapBoard'

afterEach(cleanup)

describe('RoadmapBoard', () => {
  it('renders a group per status with a count and empty placeholders', () => {
    render(
      <MemoryRouter>
        <RoadmapBoard groups={groupByStatus(catalogFixture)} />
      </MemoryRouter>
    )
    expect(screen.getAllByRole('region')).toHaveLength(5)
    const launched = screen.getByRole('region', { name: 'Запущено' })
    expect(within(launched).getByText('1')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Тестируется' })).getByText('Здесь пока пусто')).toBeTruthy()
  })
})
