import { createContext, useContext, useState, type ReactNode } from 'react'

interface NavDrawerCtx {
  open: boolean
  setOpen: (v: boolean) => void
}

const defaultValue: NavDrawerCtx = { open: false, setOpen: () => {} }
const NavDrawerContext = createContext<NavDrawerCtx>(defaultValue)

export function NavDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return <NavDrawerContext.Provider value={{ open, setOpen }}>{children}</NavDrawerContext.Provider>
}

export const useNavDrawer = () => useContext(NavDrawerContext)
