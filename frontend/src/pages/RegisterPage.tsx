import { useState } from 'react'
import { Link, useNavigate, Navigate } from 'react-router-dom'
import {
  Center, Paper, Stack, Title, TextInput, PasswordInput, Button, Text, Anchor,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { register } from '../api/auth'
import { useAuthStore } from '../store/authStore'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { accessToken, setAuth } = useAuthStore()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  if (accessToken) return <Navigate to="/" replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) {
      notifications.show({ message: 'Passwords do not match', color: 'red' })
      return
    }
    setLoading(true)
    try {
      const { user, access_token, refresh_token } = await register(name, email, password)
      setAuth(user, access_token, refresh_token)
      navigate('/', { replace: true })
    } catch (err: unknown) {
      notifications.show({
        message: err instanceof Error ? err.message : 'Registration failed',
        color: 'red',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Center h="100vh" style={{ background: 'var(--mantine-color-gray-0)' }}>
      <Paper shadow="sm" p="xl" radius="md" w={380} withBorder>
        <Stack gap="lg">
          <Stack gap={4}>
            <Title order={2} ta="center" c="blue.6">FairShare</Title>
            <Title order={4} ta="center" fw={500} c="dimmed">Create your account</Title>
          </Stack>

          <form onSubmit={handleSubmit}>
            <Stack gap="sm">
              <TextInput
                label="Full name"
                placeholder="Jane Smith"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                autoFocus
              />
              <TextInput
                label="Email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
              <PasswordInput
                label="Password"
                placeholder="At least 8 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
              />
              <PasswordInput
                label="Confirm password"
                placeholder="Repeat your password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                error={confirm && password !== confirm ? 'Passwords do not match' : undefined}
              />
              <Button type="submit" loading={loading} mt="xs" fullWidth>
                Create account
              </Button>
            </Stack>
          </form>

          <Text ta="center" size="sm" c="dimmed">
            Already have an account?{' '}
            <Anchor component={Link} to="/login" size="sm">
              Sign in
            </Anchor>
          </Text>
        </Stack>
      </Paper>
    </Center>
  )
}
