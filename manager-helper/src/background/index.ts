import { isExtensionMessage } from '@/shared/messages'
import type { ExtensionResponse } from '@/shared/messages'

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  console.info('Manager Helper installed')
})

chrome.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse: (response: ExtensionResponse) => void) => {
    if (isExtensionMessage(message)) {
      sendResponse({ type: 'PONG', receivedAt: Date.now() })
    }
  },
)
