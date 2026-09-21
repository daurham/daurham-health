import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/lib'
import type { NavItem } from '@/types'

const navItems: NavItem[] = [
  { id: 'today', to: '/', label: 'Today' },
  { id: 'nutrition', to: '/nutrition', label: 'Nutrition' },
  { id: 'training', to: '/training', label: 'Training' },
  { id: 'body', to: '/body', label: 'Body' },
  { id: 'progress', to: '/progress', label: 'Progress' },
]

export function Layout() {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-3">
          <p className="text-sm font-semibold tracking-tight">Daurham Health</p>
          <nav className="mt-3 flex flex-wrap gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.id}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-2 text-sm font-medium',
                    isActive
                      ? 'bg-zinc-900 text-white'
                      : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
