import type { GuideResponse } from './guides.schema'

/** Shape of `GuideResponse` from backend `guides.responses.ts`. */
export const guideFixture: GuideResponse = {
  body: '# Как работать с агентом\n\n- шаг 1\n- шаг 2',
  updatedAt: '2026-11-10T09:00:00.000Z',
  updatedBy: { id: 'u1', login: 'ivan', fullName: 'Иванов Иван Иванович' }
}

export const emptyGuideFixture: GuideResponse = { body: null, updatedAt: null, updatedBy: null }
