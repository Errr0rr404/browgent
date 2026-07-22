import type { BrowgentAPI } from './index'

declare global {
  interface Window {
    browgent: BrowgentAPI
  }
}

export {}
