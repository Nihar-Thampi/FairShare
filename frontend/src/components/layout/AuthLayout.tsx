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
    <Box mih="100vh">
      <Center mih="100vh" px="md" py="xl">
        <Stack align="center" gap="lg" w="100%" maw={width}>
          <Logo size="lg" />
          <Paper className="fs-receipt" p={{ base: 'lg', xs: 32 }} pb={{ base: 28, xs: 40 }} w="100%">
            <Stack gap="lg">
              <Stack gap={4}>
                <Title order={3}>{title}</Title>
                <Text size="sm" c="dimmed">{subtitle}</Text>
              </Stack>
              {children}
            </Stack>
          </Paper>
          <Text size="xs" c="dimmed">Scan invoices, track what you owe, split bills when you need to.</Text>
        </Stack>
      </Center>
    </Box>
  )
}
