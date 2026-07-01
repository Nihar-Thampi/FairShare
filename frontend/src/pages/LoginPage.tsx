import { useState } from 'react'
import { Link, useNavigate, useLocation, Navigate } from 'react-router-dom'
import {
  Center, Paper, Stack, Title, TextInput, PasswordInput, Button, Text, Anchor, Divider, Alert,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { login } from '../api/auth'
import { useAuthStore } from '../store/authStore'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { accessToken, setAuth } = useAuthStore()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/'

  if (accessToken) return <Navigate to={from} replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { user, access_token, refresh_token } = await login(email, password)
      setAuth(user, access_token, refresh_token)
      navigate(from, { replace: true })
    } catch (err: unknown) {
      notifications.show({
        message: err instanceof Error ? err.message : 'Login failed',
        color: 'red',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Center h="100vh" style={{ background: 'var(--mantine-color-gray-0)' }}>
      <Paper shadow="sm" p="xl" radius="md" w={400} withBorder>
        <Stack gap="lg">
          <Stack gap={4}>
            <Title order={2} ta="center" c="blue.6">FairShare</Title>
            <Title order={4} ta="center" fw={500} c="dimmed">Sign in to your account</Title>
          </Stack>

          <Alert color="blue" variant="light" title="Default admin account">
            <Text size="xs">Email: <strong>admin@admin.com</strong></Text>
            <Text size="xs">Password: <strong>admin123</strong></Text>
          </Alert>

          <form onSubmit={handleSubmit}>
            <Stack gap="sm">
              <TextInput
                label="Email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
              />
              <PasswordInput
                label="Password"
                placeholder="Your password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
              <Button type="submit" loading={loading} mt="xs" fullWidth>
                Sign in
              </Button>
            </Stack>
          </form>

          <Divider label="or" labelPosition="center" />

          <Button
            component={Link}
            to="/register"
            variant="default"
            fullWidth
          >
            Create a new account
          </Button>
        </Stack>
      </Paper>
    </Center>
  )
}
