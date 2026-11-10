import { isWidePanel } from '../panel-layout'

export interface TasksPaneVisibility {
  list: boolean
  details: boolean
  /** Whether the details screen needs a "Back" button to return to the list. */
  backToList: boolean
}

/** Wide panel: list and details side by side; narrow: the selected task decides the screen. */
export function tasksPaneVisibility(
  widthPx: number,
  selectedId: string | null,
): TasksPaneVisibility {
  if (isWidePanel(widthPx)) return { list: true, details: true, backToList: false }
  const hasSelection = selectedId !== null
  return { list: !hasSelection, details: hasSelection, backToList: hasSelection }
}
