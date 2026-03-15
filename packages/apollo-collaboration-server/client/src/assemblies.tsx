import { createRoot } from 'react-dom/client'
import { useCallback, useEffect, useState } from 'react'

import { Nav } from './Nav.js'
import './styles.css'

interface Assembly {
  _id: string
  name: string
  displayName?: string
  description?: string
  organism?: string
}

function AssembliesPage() {
  const [assemblies, setAssemblies] = useState<Assembly[]>([])

  const load = useCallback(async () => {
    const items = await fetch('/assemblies').then((r) => r.json())
    setAssemblies(items)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <>
      <Nav current="assemblies" />
      <h1>Assemblies</h1>
      <p className="info">Total: {assemblies.length}</p>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Display Name</th>
            <th>Description</th>
            <th>Organism</th>
          </tr>
        </thead>
        <tbody>
          {assemblies.map((a) => (
            <tr key={a._id}>
              <td>{a._id}</td>
              <td>{a.name}</td>
              <td>{a.displayName ?? ''}</td>
              <td>{a.description ?? ''}</td>
              <td>{a.organism ?? ''}</td>
            </tr>
          ))}
          {assemblies.length === 0 && (
            <tr>
              <td colSpan={5} style={{ textAlign: 'center', color: '#999' }}>
                No assemblies found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  )
}

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(<AssembliesPage />)
}
