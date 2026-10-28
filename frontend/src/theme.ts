import { createTheme } from '@mantine/core'

export const theme = createTheme({
  primaryColor: 'teal',
  primaryShade: 7,
  defaultRadius: 'md',
  fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  headings: {
    fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    fontWeight: '700',
  },
  components: {
    Card: { defaultProps: { withBorder: true, radius: 'md' } },
    Paper: { defaultProps: { radius: 'md' } },
    Badge: { defaultProps: { radius: 'sm' } },
    Modal: { defaultProps: { radius: 'md', overlayProps: { backgroundOpacity: 0.45, blur: 2 } } },
  },
})
