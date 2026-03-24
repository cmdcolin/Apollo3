import { createRoot } from 'react-dom/client'

import { SequenceSearchPage } from './sequence-search/SequenceSearchPage.js'

const container = document.querySelector('#root')
if (container) {
  createRoot(container).render(<SequenceSearchPage />)
}
