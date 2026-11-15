import { useCallback, useMemo, useState } from 'react'
import type { ReportBugBody } from './bugs.schema'

export const BUG_TITLE_MAX_LENGTH = 200
export const BUG_DESCRIPTION_MAX_LENGTH = 4000

export interface BugFormAgent {
  id: string
  name: string
  archivedAt?: string | null
}

export interface BugFormProduct {
  id: string
  name: string
  agents: BugFormAgent[]
}

export interface BugFormValues {
  productId: string
  agentId: string
  title: string
  description: string
}

export type BugFormField = keyof BugFormValues
export type BugFormErrors = Partial<Record<BugFormField, string>>

export type ParsedBugForm = { ok: true; data: ReportBugBody } | { ok: false; errors: BugFormErrors }

const isActive = (agent: BugFormAgent): boolean => !agent.archivedAt

/** Agents of the selected product, archived ones excluded; empty until a product is selected. */
export function agentsOfProduct(products: BugFormProduct[], productId: string): BugFormAgent[] {
  return products.find((p) => p.id === productId)?.agents.filter(isActive) ?? []
}

/** Changing the product drops the agent unless it belongs to the new product. */
export function selectProduct<T extends Pick<BugFormValues, 'productId' | 'agentId'>>(
  products: BugFormProduct[],
  current: T,
  productId: string
): T {
  const keep = agentsOfProduct(products, productId).some((a) => a.id === current.agentId)
  return { ...current, productId, agentId: keep ? current.agentId : '' }
}

export interface InitialBugFormState {
  productId: string
  agentId: string
  /** Products to offer: all of them, or only the products of the preselected agent. */
  productOptions: BugFormProduct[]
}

/** Preselects by the agent from the URL: one product -> both selected; several -> only the agent's products; unknown/archived -> ignored. */
export function initialBugFormState(products: BugFormProduct[], agentId: string | undefined): InitialBugFormState {
  const none = { productId: '', agentId: '', productOptions: products }
  if (!agentId) return none
  const owners = products.filter((p) => p.agents.some((a) => a.id === agentId && isActive(a)))
  if (owners.length === 0) return none
  const [only] = owners
  if (owners.length === 1 && only) return { productId: only.id, agentId, productOptions: products }
  return { productId: '', agentId, productOptions: owners }
}

export function validateBugForm(values: BugFormValues): ParsedBugForm {
  const title = values.title.trim()
  const description = values.description.trim()
  const errors: BugFormErrors = {}
  if (!values.productId) errors.productId = 'Выберите продукт'
  if (!values.agentId) errors.agentId = 'Выберите агента'
  if (!title) errors.title = 'Опишите, что случилось'
  else if (title.length > BUG_TITLE_MAX_LENGTH) errors.title = `Не длиннее ${String(BUG_TITLE_MAX_LENGTH)} символов`
  if (!description) errors.description = 'Добавьте подробности'
  else if (description.length > BUG_DESCRIPTION_MAX_LENGTH) errors.description = `Не длиннее ${String(BUG_DESCRIPTION_MAX_LENGTH)} символов`
  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, data: { productId: values.productId, agentId: values.agentId, title, description } }
}

export function useBugForm(products: BugFormProduct[], initialAgentId: string | undefined) {
  const [initial] = useState(() => initialBugFormState(products, initialAgentId))
  const [values, setValues] = useState<BugFormValues>({ productId: initial.productId, agentId: initial.agentId, title: '', description: '' })
  const [errors, setErrors] = useState<BugFormErrors>({})

  const agents = useMemo(() => agentsOfProduct(products, values.productId), [products, values.productId])

  const withoutErrors = (prev: BugFormErrors, ...fields: BugFormField[]): BugFormErrors => {
    const next = { ...prev }
    for (const field of fields) delete next[field]
    return next
  }

  const setField = useCallback((field: BugFormField, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => withoutErrors(prev, field))
  }, [])

  const setProduct = useCallback(
    (productId: string) => {
      setValues((prev) => selectProduct(products, prev, productId))
      setErrors((prev) => withoutErrors(prev, 'productId', 'agentId'))
    },
    [products]
  )

  /** After a 409 the agent is gone: the field is emptied, the typed text stays. */
  const clearAgent = useCallback(() => setValues((prev) => ({ ...prev, agentId: '' })), [])

  /** Returns the request body, or null after putting the errors next to the fields. */
  const submit = (): ReportBugBody | null => {
    const parsed = validateBugForm(values)
    if (!parsed.ok) {
      setErrors(parsed.errors)
      return null
    }
    setErrors({})
    return parsed.data
  }

  return { values, errors, agents, productOptions: initial.productOptions, setField, setProduct, clearAgent, submit }
}
