import type { ReactNode } from 'react'
import { Box, Center, Paper, Stack, Text, Title } from '@mantine/core'
import Logo from './Logo'

interface Props {
  title: string
  subtitle: string
  width?: number
  children: ReactNode
}

export default function AuthLayout({ title, subtitle, width = 420, children }: Props) {
  return (
    <Box
      mih="100vh"
      style={{
        background:
          'radial-gradient(1200px 600px at 10% -10%, var(--mantine-color-teal-1), transparent 60%),' +
          'radial-gradient(900px 500px at 110% 110%, var(--mantine-color-cyan-1), transparent 60%),' +
          'var(--mantine-color-gray-0)',
      }}
    >
      <Center mih="100vh" px="md" py="xl">
        <Stack align="center" gap="lg" w="100%" maw={width}>
          <Logo size="lg" />
          <Paper shadow="md" p={{ base: 'lg', xs: 32 }} radius="lg" withBorder w="100%">
            <Stack gap="lg">
              <Stack gap={4}>
                <Title order={3}>{title}</Title>
                <Text size="sm" c="dimmed">{subtitle}</Text>
              </Stack>
              {children}
            </Stack>
          </Paper>
          <Text size="xs" c="dimmed">Split bills fairly, item by item.</Text>
        </Stack>
      </Center>
    </Box>
  )
}
