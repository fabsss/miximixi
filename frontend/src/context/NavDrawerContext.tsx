import { createContext, useContext, useState } from 'react'

interface NavDrawerCtx {
  open: boolean
  setOpen: (v: boolean) => void
}

const NavDrawerContext = createContext<NavDrawerCtx>({ open: false, setOpen: () => {} })

export function NavDrawerProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return <NavDrawerContext.Provider value={{ open, setOpen }}>{children}</NavDrawerContext.Provider>
}

export const useNavDrawer = () => useContext(NavDrawerContext)
