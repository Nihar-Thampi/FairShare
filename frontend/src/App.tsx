import { Routes, Route, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  AppShell, Container, Title, Anchor, Group, Avatar, Menu, Text, UnstyledButton,
} from '@mantine/core'
import { Link } from 'react-router-dom'
import HomePage from './pages/HomePage'
import BillPage from './pages/BillPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import { useAuthStore } from './store/authStore'
import { useBillStore } from './store/billStore'

function ProtectedLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { accessToken, user, clearAuth } = useAuthStore()
  const resetBillStore = useBillStore(s => s.reset)

  if (!accessToken) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  const handleLogout = () => {
    resetBillStore()
    clearAuth()
    navigate('/login', { replace: true })
  }

  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header style={{ display: 'flex', alignItems: 'center', padding: '0 1.5rem' }}>
        <Group justify="space-between" w="100%">
          <Anchor component={Link} to="/" underline="never">
            <Title order={3} style={{ color: 'var(--mantine-color-blue-6)' }}>
              FairShare
            </Title>
          </Anchor>

          {user && (
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <UnstyledButton>
                  <Group gap="xs">
                    <Avatar color="blue" radius="xl" size="sm">
                      {user.name[0].toUpperCase()}
                    </Avatar>
                    <Text size="sm" fw={500} visibleFrom="sm">{user.name}</Text>
                  </Group>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>{user.email}</Menu.Label>
                <Menu.Divider />
                <Menu.Item color="red" onClick={handleLogout}>
                  Sign out
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Container size="lg" py="md">
          <Outlet />
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/bills/:id" element={<BillPage />} />
      </Route>
    </Routes>
  )
}

export default App
