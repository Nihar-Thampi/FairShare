import { Routes, Route, Navigate, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  AppShell, Container, Anchor, Group, Avatar, Menu, Text, UnstyledButton,
} from '@mantine/core'
import { IconChevronDown, IconLogout } from '@tabler/icons-react'
import { Link } from 'react-router-dom'
import Logo from './components/layout/Logo'
import InvoicesPage from './pages/InvoicesPage'
import InvoicePage from './pages/InvoicePage'
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
    <AppShell header={{ height: 64 }} padding={0}>
      <AppShell.Header withBorder style={{ background: 'var(--mantine-color-body)' }}>
        <Container size="lg" h="100%">
          <Group justify="space-between" h="100%">
            <Anchor component={Link} to="/" underline="never">
              <Logo />
            </Anchor>

            {user && (
              <Menu position="bottom-end" withinPortal width={220}>
                <Menu.Target>
                  <UnstyledButton
                    px="xs"
                    py={6}
                    style={{ borderRadius: 'var(--mantine-radius-md)' }}
                    aria-label="Account menu"
                  >
                    <Group gap="xs">
                      <Avatar color="ink" radius="xl" size={32}>
                        {user.name[0].toUpperCase()}
                      </Avatar>
                      <Text size="sm" fw={500} visibleFrom="sm">{user.name}</Text>
                      <IconChevronDown size={14} color="var(--mantine-color-gray-6)" />
                    </Group>
                  </UnstyledButton>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>{user.email}</Menu.Label>
                  <Menu.Divider />
                  <Menu.Item color="red" leftSection={<IconLogout size={16} />} onClick={handleLogout}>
                    Sign out
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            )}
          </Group>
        </Container>
      </AppShell.Header>

      <AppShell.Main mih="100vh">
        <Container size="lg" py="xl">
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
        <Route path="/" element={<InvoicesPage />} />
        <Route path="/invoices/:id" element={<InvoicePage />} />
        <Route path="/bills/:id" element={<LegacyBillRedirect />} />
      </Route>
    </Routes>
  )
}

/** Old /bills/:id links still work after the move to /invoices/:id. */
function LegacyBillRedirect() {
  const { id } = useParams<{ id: string }>()
  return <Navigate to={`/invoices/${id}`} replace />
}

export default App
