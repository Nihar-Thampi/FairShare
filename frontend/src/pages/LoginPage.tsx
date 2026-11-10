import { useState } from 'react'
import { Link, useNavigate, useLocation, Navigate } from 'react-router-dom'
import {
  Stack, TextInput, PasswordInput, Button, Text, Divider, Alert,
} from '@mantine/core'
import { IconAt, IconInfoCircle, IconLock } from '@tabler/icons-react'
import AuthLayout from '../components/layout/AuthLayout'
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
    <AuthLayout title="Welcome back" subtitle="Sign in to your account to continue">
      <Alert color="ink" variant="light" title="Default admin account" icon={<IconInfoCircle size={18} />}>
        <Text size="xs">Email: <strong>admin@admin.com</strong></Text>
        <Text size="xs">Password: <strong>admin123</strong></Text>
      </Alert>

      <form onSubmit={handleSubmit}>
        <Stack gap="sm">
          <TextInput
            label="Email"
            type="email"
            placeholder="you@example.com"
            leftSection={<IconAt size={16} />}
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoFocus
          />
          <PasswordInput
            label="Password"
            placeholder="Your password"
            leftSection={<IconLock size={16} />}
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <Button type="submit" loading={loading} mt="xs" size="md" fullWidth>
            Sign in
          </Button>
        </Stack>
      </form>

      <Divider label="New to FairShare?" labelPosition="center" />

      <Button
        component={Link}
        to="/register"
        variant="default"
        fullWidth
      >
        Create a new account
      </Button>
    </AuthLayout>
  )
}
