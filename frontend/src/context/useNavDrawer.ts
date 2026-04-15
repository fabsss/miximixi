import { useContext } from 'react'
import { NavDrawerContext } from './NavDrawerContextValue'

export function useNavDrawer() {
  const context = useContext(NavDrawerContext)
  if (!context) {
    throw new Error('useNavDrawer must be used within NavDrawerProvider')
  }
  return context
}
