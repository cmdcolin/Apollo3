import { createRoot } from 'react-dom/client'
import { useCallback, useEffect, useState } from 'react'

import { Nav } from './Nav.js'
import './styles.css'

interface ChangeRow {
  _id: string
  sequence?: number
  typeName: string
  user: string
  assembly?: string
  changedIds?: string[]
  createdAt?: string
}

function RecentChangesPage() {
  const [changes, setChanges] = useState<ChangeRow[]>([])
  const [page, setPage] = useState(1)
  const pageSize = 25

  const load = useCallback(async () => {
    const items = await fetch(
      `/changes/recent?limit=${pageSize}&page=${page}`,
    ).then((r) => r.json())
    setChanges(items)
  }, [page])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <>
      <Nav current="changes" />
      <h1>Recent Changes</h1>
      <p className="info">Showing {changes.length} changes (page {page})</p>
      <table>
        <thead>
          <tr>
            <th>Sequence</th>
            <th>Type</th>
            <th>User</th>
            <th>Assembly</th>
            <th>Changed IDs</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((c) => {
            const ids = c.changedIds ?? []
            const idsDisplay =
              ids.slice(0, 3).join(', ') + (ids.length > 3 ? '...' : '')
            const date = c.createdAt
              ? new Date(c.createdAt).toLocaleString()
              : ''
            return (
              <tr key={c._id}>
                <td>{c.sequence ?? ''}</td>
                <td>{c.typeName}</td>
                <td>{c.user}</td>
                <td>{c.assembly ?? ''}</td>
                <td>{idsDisplay}</td>
                <td>{date}</td>
              </tr>
            )
          })}
          {changes.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: 'center', color: '#999' }}>
                No changes found
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="pagination">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
          ← Previous
        </button>
        <span>Page {page}</span>
        <button
          disabled={changes.length < pageSize}
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
  createRoot(root).render(<RecentChangesPage />)
}
