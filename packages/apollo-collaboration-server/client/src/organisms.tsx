import { createRoot } from 'react-dom/client'
import { useCallback, useEffect, useState } from 'react'

import { Nav } from './Nav.js'
import './styles.css'

interface Organism {
  _id: string
  taxid?: number
  genus?: string
  species?: string
  commonName?: string
  description?: string
}

function OrganismsPage() {
  const [organisms, setOrganisms] = useState<Organism[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const pageSize = 25

  const load = useCallback(async () => {
    const offset = (page - 1) * pageSize
    const [items, countRes] = await Promise.all([
      fetch(`/organisms?offset=${offset}&limit=${pageSize}`).then((r) =>
        r.json(),
      ),
      fetch('/organisms/count').then((r) => r.json()),
    ])
    setOrganisms(items)
    setTotal(countRes.count)
  }, [page])

  useEffect(() => {
    void load()
  }, [load])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <>
      <Nav current="organisms" />
      <h1>Organisms</h1>
      <p className="info">
        Total: {total} | Page {page} of {totalPages}
      </p>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Taxid</th>
            <th>Genus</th>
            <th>Species</th>
            <th>Common Name</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {organisms.map((o) => (
            <tr key={o._id}>
              <td>{o._id}</td>
              <td>{o.taxid ?? ''}</td>
              <td>{o.genus ?? ''}</td>
              <td>{o.species ?? ''}</td>
              <td>{o.commonName ?? ''}</td>
              <td>{o.description ?? ''}</td>
            </tr>
          ))}
          {organisms.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: 'center', color: '#999' }}>
                No organisms found
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="pagination">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
          ← Previous
        </button>
        <span>
          Page {page} of {totalPages}
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => setPage(page + 1)}
        >
          Next →
        </button>
      </div>
    </>
  )
}

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(<OrganismsPage />)
}
