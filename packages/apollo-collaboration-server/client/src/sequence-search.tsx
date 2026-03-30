import { createRoot } from 'react-dom/client'

import {
  SequenceSearchPage,
  SequenceSearchPortal,
} from './sequence-search/SequenceSearchPage.js'

function getToolFromPath() {
  const parts = globalThis.location.pathname.split('/')
  const idx = parts.indexOf('sequence-search')
  if (idx !== -1 && parts[idx + 1]) {
    return parts[idx + 1]
  }
  return null
}

const container = document.querySelector('#root')
if (container) {
  const tool = getToolFromPath()
  createRoot(container).render(
    tool ? <SequenceSearchPage tool={tool} /> : <SequenceSearchPortal />,
  )
}
