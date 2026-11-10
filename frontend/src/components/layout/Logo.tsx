import { Group, Text } from '@mantine/core'

interface Props {
  size?: 'sm' | 'lg'
}

/** A till slip with a torn bottom edge and two printed lines. */
function ReceiptMark({ px }: { px: number }) {
  return (
    <svg width={px} height={px} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#1b2540" />
      <path d="M9 6h14v18l-2.33 2-2.33-2-2.34 2-2.33-2-2.34 2L9 24z" fill="#fffbe0" />
      <path d="M12 11h8M12 15h8M12 19h5" stroke="#1b2540" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export default function Logo({ size = 'sm' }: Props) {
  const large = size === 'lg'
  return (
    <Group gap={large ? 'sm' : 8} wrap="nowrap">
      <ReceiptMark px={large ? 44 : 32} />
      <Text fw={600} fz={large ? 26 : 19} style={{ letterSpacing: -0.5 }}>
        FairShare
      </Text>
    </Group>
  )
}
