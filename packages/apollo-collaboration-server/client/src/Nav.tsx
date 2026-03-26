import { createJBrowseTheme } from '@jbrowse/core/ui/theme'
import AppBar from '@mui/material/AppBar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CssBaseline from '@mui/material/CssBaseline'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import { ThemeProvider } from '@mui/material/styles'
import { useEffect, useRef, useState } from 'react'

import logoUrl from './apollo_logo.svg'

const theme = createJBrowseTheme({
  palette: {
    primary: { main: '#0c4f4b' },
    secondary: { main: '#1AA39B' },
  },
})

interface UserInfo {
  username: string
  email: string
  role: string
}

function useCurrentUser() {
  const [user, setUser] = useState<UserInfo>()

  useEffect(() => {
    fetch('/users/me', { headers: { Accept: 'application/json' } })
      .then((r) => {
        if (r.ok) {
          return r.json() as Promise<UserInfo>
        }
        return null
      })
      .then((data) => {
        if (data) {
          setUser(data)
        }
      })
      .catch(() => {
        /* ignore */
      })
  }, [])

  return user
}

type Page =
  | 'organisms'
  | 'assemblies'
  | 'add-assembly'
  | 'sequence-search'
  | 'changes'
  | 'users'
  | 'jobs'

interface NavMenuItem {
  label: string
  href: string
  value: Page
}

const fileMenuItems: NavMenuItem[] = [
  { label: 'Organisms', href: '/ui/organisms/', value: 'organisms' },
  { label: 'Assemblies', href: '/ui/assemblies/', value: 'assemblies' },
  { label: 'Recent Changes', href: '/ui/changes/', value: 'changes' },
]

const toolsMenuItems: NavMenuItem[] = [
  {
    label: 'Sequence Search',
    href: '/ui/sequence-search/',
    value: 'sequence-search',
  },
]

const adminMenuItems: NavMenuItem[] = [
  { label: 'Users', href: '/admin/users/', value: 'users' },
  { label: 'Analysis Jobs', href: '/admin/jobs/', value: 'jobs' },
  {
    label: 'Add Assembly',
    href: '/admin/add-assembly/',
    value: 'add-assembly',
  },
]

function NavMenu({
  label,
  items,
  current,
}: {
  label: string
  items: NavMenuItem[]
  current?: Page
}) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)

  return (
    <>
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
      <Menu
        anchorEl={anchorRef.current}
        open={open}
        onClose={() => {
          setOpen(false)
        }}
      >
        {items.map((item) => (
          <MenuItem
            key={item.value}
            component="a"
            href={item.href}
            selected={item.value === current}
          >
            <ListItemText>{item.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}

function NavBar({ current, user }: { current?: Page; user?: UserInfo }) {
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
        {user ? (
          <>
            <NavMenu label="File" items={fileMenuItems} current={current} />
            <NavMenu label="Tools" items={toolsMenuItems} current={current} />
            {user.role === 'admin' ? (
              <NavMenu label="Admin" items={adminMenuItems} current={current} />
            ) : null}
          </>
        ) : null}
        <Box sx={{ flexGrow: 1 }} />
        {user && (
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
  const user = useCurrentUser()

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <NavBar current={current} user={user} />
      {children}
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
