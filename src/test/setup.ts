import '@testing-library/jest-dom'
import { vi } from 'vitest'

vi.mock('@noriginmedia/norigin-spatial-navigation', () => ({
  useFocusable: () => ({
    ref: { current: null },
    focused: false,
    focusKey: 'test',
  }),
  init: vi.fn(),
}))

