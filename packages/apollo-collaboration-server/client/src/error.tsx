import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'

import { Nav } from './Nav.js'

const titles: Record<string, string> = {
  '400': 'Bad Request',
  '401': 'Unauthorized',
  '403': 'Forbidden',
  '404': 'Not Found',
  '500': 'Internal Server Error',
}

function ErrorPage() {
  const params = new URLSearchParams(globalThis.location.search)
  const status = params.get('status') ?? '500'
  const message = params.get('message')?.slice(0, 500) ?? 'Something went wrong'
  const title = titles[status] ?? `Error ${status}`

  useEffect(() => {
    document.title = `${title} - Apollo`
  }, [title])

  return (
    <Nav>
      <Container maxWidth="sm" sx={{ mt: 8, textAlign: 'center' }}>
        <Paper variant="outlined" sx={{ p: 6 }}>
          <Typography
            variant="h2"
            sx={{ fontWeight: 700, color: 'primary.dark' }}
          >
            {status}
          </Typography>
          <Typography variant="h5" sx={{ mt: 1, mb: 2 }}>
            {title}
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 4 }}>
            {message}
          </Typography>
          {status === '401' ? (
            <Button variant="contained" href="/">
              Sign in
            </Button>
          ) : (
            <Button variant="contained" href="/">
              Go to home page
            </Button>
          )}
        </Paper>
      </Container>
    </Nav>
  )
}

const root = document.querySelector('#root')
if (root) {
  createRoot(root).render(<ErrorPage />)
}
