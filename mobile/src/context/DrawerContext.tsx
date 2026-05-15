import { createContext, useContext } from 'react'

interface DrawerContextValue {
  isOpen: boolean
  open: () => void
  close: () => void
}

export const DrawerContext = createContext<DrawerContextValue>({
  isOpen: false,
  open: () => {},
  close: () => {},
})

export const useDrawer = () => useContext(DrawerContext)
