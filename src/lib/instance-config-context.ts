import { createContext, useContext } from 'react'
import type { PublicInstanceConfig } from '@/domain/instance-config'

export const InstanceConfigContext = createContext<PublicInstanceConfig | null>(null)

export function useInstanceConfig(): PublicInstanceConfig | null {
  return useContext(InstanceConfigContext)
}
