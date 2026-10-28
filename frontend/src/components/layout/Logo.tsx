import { Group, Text, ThemeIcon } from '@mantine/core'
import { IconReceipt2 } from '@tabler/icons-react'

interface Props {
  size?: 'sm' | 'lg'
}

export default function Logo({ size = 'sm' }: Props) {
  const large = size === 'lg'
  return (
    <Group gap={large ? 'sm' : 8} wrap="nowrap">
      <ThemeIcon size={large ? 44 : 32} radius="md" variant="gradient" gradient={{ from: 'teal.6', to: 'cyan.6', deg: 135 }}>
        <IconReceipt2 size={large ? 26 : 19} stroke={1.8} />
      </ThemeIcon>
      <Text fw={700} fz={large ? 26 : 19} c="dark.7" style={{ letterSpacing: -0.4 }}>
        FairShare
      </Text>
    </Group>
  )
}
