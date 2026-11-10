import { Badge, type BadgeProps } from '@mantine/core'
import type { Bill } from '../../types'
import { PAYMENT_STATE_COLORS, PAYMENT_STATE_LABELS, paymentState } from '../../utils/invoice'

interface Props extends Omit<BadgeProps, 'color' | 'children'> {
  bill: Pick<Bill, 'payment_status' | 'due_date'>
}

export default function PaymentBadge({ bill, ...props }: Props) {
  const state = paymentState(bill)
  return (
    <Badge variant="outline" className="fs-stamp" color={PAYMENT_STATE_COLORS[state]} {...props}>
      {PAYMENT_STATE_LABELS[state]}
    </Badge>
  )
}
