import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { LockedScreen, useAuth } from '@/auth'
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
  const { status, signOut } = useAuth()
  const location = useLocation()
  const onSignIn = location.pathname === '/sign-in'

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold tracking-tight">Daurham Health</p>
            {status === 'owner' || status === 'unauthorized' ? (
              <button
                type="button"
                onClick={() => {
                  void signOut()
                }}
                className="text-sm text-zinc-500 hover:text-zinc-900"
              >
                Sign out
              </button>
            ) : null}
          </div>
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
        {status === 'loading' ? (
          <p className="text-zinc-600">Loading…</p>
        ) : status === 'anonymous' && onSignIn ? (
          <Outlet />
        ) : status === 'anonymous' ? (
          <LockedScreen
            title="Private Health data"
            body="This is a personal Health app. Sign in as the owner to view and record real data."
            action={{ to: '/sign-in', label: 'Owner Sign In' }}
          />
        ) : status === 'unauthorized' ? (
          <LockedScreen
            title="This account is not authorized"
            body="You are signed in, but this Health app only serves its owner. Sign out and use the owner account."
            action={{
              onClick: () => {
                void signOut()
              },
              label: 'Sign out',
            }}
          />
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  )
}
