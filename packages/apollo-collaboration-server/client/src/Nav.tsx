import { createJBrowseTheme } from '@jbrowse/core/ui/theme'
import AppBar from '@mui/material/AppBar'
import Badge from '@mui/material/Badge'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Container from '@mui/material/Container'
import CssBaseline from '@mui/material/CssBaseline'
import ListItemText from '@mui/material/ListItemText'
import ListSubheader from '@mui/material/ListSubheader'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import { ThemeProvider } from '@mui/material/styles'
import { useRef, useState } from 'react'

import {
  AuthProvider,
  type CurrentUser,
  useCurrentUser,
  useDashboard,
} from './hooks.js'
import logoUrl from './apollo_logo.svg'

const theme = createJBrowseTheme({
  palette: {
    primary: { main: '#0c4f4b' },
    secondary: { main: '#1AA39B' },
  },
})

type Page =
  | 'organisms'
  | 'assemblies'
  | 'add-assembly'
  | 'seq-local-blast'
  | 'seq-blat'
  | 'seq-miniprot'
  | 'seq-ispcr'
  | 'changes'
  | 'users'
  | 'approve-users'
  | 'jobs'
  | 'analysis-dbs'

interface NavMenuItem {
  label: string
  href: string
  value: Page
  indent?: boolean
}

interface NavMenuSubheader {
  type: 'subheader'
  label: string
  href: string
}

type NavEntry = NavMenuItem | NavMenuSubheader

const publicFileMenuItems: NavEntry[] = [
  { label: 'Organisms', href: '/ui/organisms/', value: 'organisms' },
  { label: 'Assemblies', href: '/ui/assemblies/', value: 'assemblies' },
]

const fileMenuItems: NavEntry[] = [
  ...publicFileMenuItems,
  { label: 'Recent Changes', href: '/ui/changes/', value: 'changes' },
]

const toolsMenuItems: NavEntry[] = [
  { type: 'subheader', label: 'Sequence Search', href: '/ui/sequence-search/' },
  {
    label: 'Local BLAST',
    href: '/ui/sequence-search/local-blast/',
    value: 'seq-local-blast',
    indent: true,
  },
  {
    label: 'BLAT',
    href: '/ui/sequence-search/blat/',
    value: 'seq-blat',
    indent: true,
  },
  {
    label: 'miniprot',
    href: '/ui/sequence-search/miniprot/',
    value: 'seq-miniprot',
    indent: true,
  },
  {
    label: 'isPCR',
    href: '/ui/sequence-search/ispcr/',
    value: 'seq-ispcr',
    indent: true,
  },
]

const adminMenuItems: NavMenuItem[] = [
  { label: 'Users', href: '/admin/users/', value: 'users' },
  {
    label: 'Approve Users',
    href: '/admin/approve-users/',
    value: 'approve-users',
  },
  { label: 'Analysis Jobs', href: '/admin/jobs/', value: 'jobs' },
  {
    label: 'Analysis Databases',
    href: '/admin/analysis-databases/',
    value: 'analysis-dbs',
  },
  {
    label: 'Add Assembly',
    href: '/admin/add-assembly/',
    value: 'add-assembly',
  },
]

function NavMenu({
  badgeCounts,
  current,
  items,
  label,
}: {
  badgeCounts?: Partial<Record<Page, number>>
  current?: Page
  items: NavEntry[]
  label: string
}) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)

  const totalBadge = badgeCounts
    ? Object.values(badgeCounts).reduce((sum, n) => sum + (n || 0), 0)
    : 0

  return (
    <>
      <Badge
        badgeContent={totalBadge}
        color="warning"
        sx={{ '& .MuiBadge-badge': { top: 8, right: -4 } }}
      >
        <Button
          ref={anchorRef}
          color="inherit"
          size="small"
          onClick={() => {
            setOpen(true)
          }}
        >
          {label}
        </Button>
      </Badge>
      <Menu
        anchorEl={anchorRef.current}
        open={open}
        onClose={() => {
          setOpen(false)
        }}
      >
        {items.map((item) => {
          if ('type' in item) {
            return (
              <ListSubheader
                key={item.label}
                component="a"
                href={item.href}
                sx={{ lineHeight: '36px', cursor: 'pointer' }}
              >
                {item.label}
              </ListSubheader>
            )
          }
          const count = badgeCounts?.[item.value] ?? 0
          return (
            <MenuItem
              key={item.value}
              component="a"
              href={item.href}
              selected={item.value === current}
              sx={item.indent ? { pl: 4 } : undefined}
            >
              <ListItemText>{item.label}</ListItemText>
              {count > 0 ? (
                <Chip
                  label={count}
                  size="small"
                  color="warning"
                  sx={{ ml: 1 }}
                />
              ) : null}
            </MenuItem>
          )
        })}
      </Menu>
    </>
  )
}

function NavBar({ current, user }: { current?: Page; user?: CurrentUser }) {
  const dashboard = useDashboard(!!user)
  const pendingCount = dashboard.pendingCount ?? 0

  return (
    <AppBar position="static" color="secondary" sx={{ mb: 3 }}>
      <Toolbar variant="dense">
        <Box
          component="a"
          href="/"
          sx={{
            display: 'flex',
            alignItems: 'center',
            mr: 1,
            textDecoration: 'none',
          }}
        >
          <img
            src={logoUrl}
            alt="Apollo"
            height={28}
            style={{ filter: 'brightness(0) invert(1)' }}
          />
        </Box>
        <Typography
          variant="h6"
          component="a"
          href="/"
          sx={{
            textDecoration: 'none',
            color: 'inherit',
            mr: 2,
            fontSize: '1rem',
          }}
        >
          Apollo
        </Typography>
        <NavMenu
          label="File"
          items={user ? fileMenuItems : publicFileMenuItems}
          current={current}
        />
        {user ? (
          <>
            <NavMenu label="Tools" items={toolsMenuItems} current={current} />
            {user.role === 'admin' ? (
              <NavMenu
                label="Admin"
                items={adminMenuItems}
                current={current}
                badgeCounts={{ 'approve-users': pendingCount }}
              />
            ) : null}
          </>
        ) : null}
        <Box sx={{ flexGrow: 1 }} />
        {user ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="body2">{user.username}</Typography>
            <Chip
              label={user.role}
              size="small"
              variant="outlined"
              sx={{ color: 'inherit', borderColor: 'rgba(255,255,255,0.5)' }}
            />
            <Button color="inherit" size="small" href="/auth/logout">
              Sign out
            </Button>
          </Box>
        ) : (
          <Button color="inherit" size="small" href="/ui/signin/">
            Sign in
          </Button>
        )}
      </Toolbar>
    </AppBar>
  )
}

export function Nav({
  current,
  children,
}: {
  current?: Page
  children: React.ReactNode
}) {
  const { user, checked } = useCurrentUser()

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider value={user}>
        <NavBar current={current} user={user ?? undefined} />
        {checked ? (
          children
        ) : (
          <Container maxWidth="xs" sx={{ mt: 4, textAlign: 'center' }}>
            <CircularProgress />
          </Container>
        )}
      </AuthProvider>
    </ThemeProvider>
  )
}

export function AdminNav({
  current,
  children,
}: {
  current: Page
  children: React.ReactNode
}) {
  return <Nav current={current}>{children}</Nav>
}
