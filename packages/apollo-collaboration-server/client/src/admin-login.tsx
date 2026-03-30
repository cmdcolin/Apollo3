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

function AdminLoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function handleLogin() {
    setError('')
    const response = await fetch('/auth/root', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ password }),
    })
    if (response.ok) {
      globalThis.location.href = '/'
    } else if (response.status === 401) {
      setError('Invalid password')
    } else {
      const text = await response.text().catch(() => '')
      setError(`Login failed (${response.status}): ${text || response.statusText}`)
    }
  }

  return (
    <Nav>
      <Container maxWidth="sm" sx={{ mt: 4, textAlign: 'center' }}>
        <Typography variant="h4" gutterBottom>
          Admin Login
        </Typography>
        <Paper variant="outlined" sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <TextField
              label="Root password"
              type="password"
              size="small"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError('')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  // eslint-disable-next-line @typescript-eslint/no-floating-promises
                  handleLogin()
                }
              }}
            />
            <Button
              variant="contained"
              disabled={password.length === 0}
              // eslint-disable-next-line @typescript-eslint/no-floating-promises
              onClick={() => handleLogin()}
            >
              Sign in
            </Button>
          </Box>
        </Paper>
      </Container>
    </Nav>
  )
}

const root = document.querySelector('#root')
if (root) {
  createRoot(root).render(<AdminLoginPage />)
}
