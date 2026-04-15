import { createContext } from 'react'

export interface NavDrawerCtx {
  open: boolean
  setOpen: (v: boolean) => void
}

export const NavDrawerContext = createContext<NavDrawerCtx | null>(null)
