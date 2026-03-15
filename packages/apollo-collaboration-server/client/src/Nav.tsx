export function Nav({ current }: { current: 'organisms' | 'assemblies' | 'changes' }) {
  return (
    <nav>
      <a href="/admin/organisms/" className={current === 'organisms' ? 'active' : ''}>
        Organisms
      </a>
      <a href="/admin/assemblies/" className={current === 'assemblies' ? 'active' : ''}>
        Assemblies
      </a>
      <a href="/admin/changes/" className={current === 'changes' ? 'active' : ''}>
        Recent Changes
      </a>
    </nav>
  )
}
