import { createContext, createElement, useContext, type ReactNode } from 'react'

const PrefixContext = createContext('')
const ReadOnlyContext = createContext(false)

export function AppSurfaceProvider({
  prefix,
  readOnly,
  children,
}: {
  prefix: string
  readOnly: boolean
  children: ReactNode
}) {
  return createElement(PrefixContext.Provider, {
    value: prefix,
    children: createElement(ReadOnlyContext.Provider, { value: readOnly, children }),
  })
}

export function useAppPathPrefix(): string {
  return useContext(PrefixContext)
}

export function useDemoReadOnly(): boolean {
  return useContext(ReadOnlyContext)
}

export function prefixedPath(prefix: string, path: string): string {
  if (!prefix || path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }
  if (path.startsWith(`${prefix}/`) || path === prefix) {
    return path
  }
  return `${prefix}${path.startsWith('/') ? path : `/${path}`}`
}
