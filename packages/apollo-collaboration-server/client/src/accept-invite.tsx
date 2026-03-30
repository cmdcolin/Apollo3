import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import { createRoot } from 'react-dom/client'

import { Nav } from './Nav.js'

function AcceptInvitePage() {
  const params = new URLSearchParams(globalThis.location.search)
  const token = params.get('token')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  if (!token) {
    return (
      <Nav>
        <Container maxWidth="sm" sx={{ mt: 4, textAlign: 'center' }}>
          <Alert severity="error">
            Invalid invite link. No token provided.
          </Alert>
        </Container>
      </Nav>
    )
  }

  async function handleSubmit() {
    setError('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    const response = await fetch('/auth/accept-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token, password }),
    })
    if (response.ok) {
      setSuccess(true)
      setTimeout(() => {
        globalThis.location.href = '/'
      }, 1500)
    } else {
      const data = (await response.json()) as { message?: string }
      setError(data.message ?? 'Failed to set password')
    }
  }

  if (success) {
    return (
      <Nav>
        <Container maxWidth="sm" sx={{ mt: 4, textAlign: 'center' }}>
          <Alert severity="success">
            Password set successfully. Redirecting...
          </Alert>
        </Container>
      </Nav>
    )
  }

  return (
    <Nav>
      <Container maxWidth="sm" sx={{ mt: 4, textAlign: 'center' }}>
        <Typography variant="h4" gutterBottom>
          Set Your Password
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          Choose a password to complete your account setup.
        </Typography>
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <TextField
              label="Password"
              type="password"
              size="small"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
              }}
            />
            <TextField
              label="Confirm password"
              type="password"
              size="small"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSubmit()
                }
              }}
            />
            <Button variant="contained" onClick={handleSubmit}>
              Set password
            </Button>
          </Box>
        </Paper>
      </Container>
    </Nav>
  )
}

const root = document.querySelector('#root')
if (root) {
  createRoot(root).render(<AcceptInvitePage />)
}
