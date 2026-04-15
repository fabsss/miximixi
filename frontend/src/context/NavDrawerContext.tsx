import { useState, type ReactNode } from 'react'
import { NavDrawerContext } from './NavDrawerContextValue'

export function NavDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return <NavDrawerContext.Provider value={{ open, setOpen }}>{children}</NavDrawerContext.Provider>
}
