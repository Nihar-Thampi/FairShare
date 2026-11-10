import { createTheme, type CSSVariablesResolver, type MantineColorsTuple } from '@mantine/core'

// Receipt ink: the blue-black of a till printer, used for actions and text.
const ink: MantineColorsTuple = [
  '#eef1f6',
  '#dce2ec',
  '#b6c1d4',
  '#8d9dbb',
  '#6b7fa6',
  '#566b98',
  '#4a6093',
  '#3a4e7d',
  '#2a3a61',
  '#1b2540',
]

// Highlighter: the one accent, for what you are looking at right now (active filter, focus).
const highlight: MantineColorsTuple = [
  '#fffbe0',
  '#fff4b8',
  '#ffeb85',
  '#ffe14f',
  '#ffd826',
  '#f5cc0a',
  '#d6b100',
  '#a98b00',
  '#7a6400',
  '#4d3f00',
]

export const theme = createTheme({
  primaryColor: 'ink',
  primaryShade: { light: 8, dark: 4 },
  colors: { ink, highlight },
  fontFamily: "'Geist', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  fontFamilyMonospace: "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  headings: {
    fontFamily: "'Geist', ui-sans-serif, system-ui, sans-serif",
    fontWeight: '600',
  },
  // Receipts are crisp: small radii throughout.
  defaultRadius: 'sm',
  radius: { xs: '3px', sm: '5px', md: '8px', lg: '12px', xl: '16px' },
  cursorType: 'pointer',
  focusRing: 'auto',
  components: {
    Card: { defaultProps: { withBorder: true, radius: 'md', shadow: undefined } },
    Paper: { defaultProps: { radius: 'md' } },
    Badge: { defaultProps: { radius: 'xs' } },
    Button: { defaultProps: { fw: 500 } },
    Modal: { defaultProps: { radius: 'md', overlayProps: { backgroundOpacity: 0.4, blur: 2 } } },
    Table: { defaultProps: { verticalSpacing: 'sm' } },
  },
})

export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {
    // Thermal-paper white page, slightly cooler cards, receipt-ink text.
    '--mantine-color-body': '#f6f7f9',
    '--mantine-color-text': '#1b2233',
    '--fs-paper': '#ffffff',
    '--fs-rule': '#e3e6ec',
    '--fs-ink-muted': '#5b6478',
  },
  dark: {
    '--mantine-color-body': '#14171e',
    '--fs-paper': '#1b1f28',
    '--fs-rule': '#2a2f3a',
    '--fs-ink-muted': '#9aa3b5',
  },
})
