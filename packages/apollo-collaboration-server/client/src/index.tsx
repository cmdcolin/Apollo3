import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Container from '@mui/material/Container'
import Link from '@mui/material/Link'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { createRoot } from 'react-dom/client'

import { Nav } from './Nav.js'
import { type CurrentUser, useAuth, useDashboard } from './hooks.js'

function PendingApproval({ user, adminEmail }: { user: CurrentUser; adminEmail?: string }) {
  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        Your account ({user.email}) is pending approval.
      </Alert>
      <Typography variant="body2" sx={{ mb: 2 }}>
        An administrator needs to assign you a role before you can access
        Apollo.
        {adminEmail ? (
          <>
            {' '}
            Contact <strong>{adminEmail}</strong> to request access.
          </>
        ) : null}
      </Typography>
    </Box>
  )
}

function LoggedInContent({ user }: { user: CurrentUser }) {
  const dashboard = useDashboard(true)

  return (
    <Box>
      {dashboard.activeUsers !== undefined ? (
        <Box
          sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mb: 1 }}
        >
          <Chip
            label={`${dashboard.activeUsers} active`}
            size="small"
            color="success"
            variant="outlined"
          />
          <Chip
            label={`${dashboard.totalUsers} registered`}
            size="small"
            variant="outlined"
          />
        </Box>
      ) : null}
      {(dashboard.pendingCount ?? 0) > 0 ? (
        <Alert severity="warning" sx={{ mb: 1, textAlign: 'left' }}>
          {dashboard.pendingCount} user{dashboard.pendingCount === 1 ? '' : 's'} pending approval.{' '}
          <Link href="/admin/approve-users/">Review now</Link>
        </Alert>
      ) : null}
      <List>
        <ListItemButton component="a" href="/ui/organisms/">
          <ListItemText primary="Organisms" />
        </ListItemButton>
        <ListItemButton component="a" href="/ui/assemblies/">
          <ListItemText primary="Assemblies" />
        </ListItemButton>
        <ListItemButton component="a" href="/ui/changes/">
          <ListItemText primary="Recent Changes" />
        </ListItemButton>
      </List>
    </Box>
  )
}

function IndexContent() {
  const user = useAuth()
  const dashboard = useDashboard(!!user)

  const isPendingApproval = user?.pendingApproval === true
  const isReadOnly = user?.role === 'readOnly' && !isPendingApproval

  return (
    <Container maxWidth="xs" sx={{ mt: 4, textAlign: 'center' }}>
      <Typography variant="h4" gutterBottom>
        {user ? `Welcome, ${user.username}` : 'Welcome to Apollo'}
      </Typography>
      <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 4 }}>
        Collaborative genome annotation editor
      </Typography>
      {user?.needsRelogin ? (
        <Alert severity="success" sx={{ mb: 2, textAlign: 'left' }}>
          Your access has been updated to <strong>{user.role}</strong>. Sign
          out and back in to apply it.
        </Alert>
      ) : null}
      {isReadOnly ? (
        <Alert severity="info" sx={{ mb: 2, textAlign: 'left' }}>
          You have read-only access. Contact an admin to request write
          permissions.
        </Alert>
      ) : null}
      {user ? (
        <Paper variant="outlined" sx={{ p: 3 }}>
          {isPendingApproval ? (
            <PendingApproval user={user} adminEmail={dashboard.adminEmail} />
          ) : (
            <LoggedInContent user={user} />
          )}
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Button variant="contained" fullWidth href="/ui/signin/">
            Sign in
          </Button>
          <Button variant="contained" color="secondary" fullWidth href="/ui/assemblies/">
            Browse public data
          </Button>
        </Box>
      )}
    </Container>
  )
}

function IndexPage() {
  return (
    <Nav>
      <IndexContent />
    </Nav>
  )
}

const root = document.querySelector('#root')
if (root) {
  createRoot(root).render(<IndexPage />)
}
