import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { LockedScreen, useAuth } from '@/auth'
import { cn, SHELL_MAX_WIDTH_CLASS } from '@/lib'
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
  const publicAuthRoute = location.pathname === '/sign-in' || location.pathname === '/reset-password'
  const showOwnerChrome = status === 'owner' || status === 'unauthorized'

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white pt-[env(safe-area-inset-top)]">
        <div className={cn('mx-auto flex items-center justify-between gap-3 px-4 py-3', SHELL_MAX_WIDTH_CLASS)}>
          <p className="text-sm font-semibold tracking-tight">Daurham Health</p>
          {showOwnerChrome ? (
            <>
              <div className="hidden items-center gap-3 md:flex">
                <NavLink
                  to="/settings"
                  className={({ isActive }) =>
                    cn('text-sm hover:text-zinc-900', isActive ? 'text-zinc-900' : 'text-zinc-500')
                  }
                >
                  Settings
                </NavLink>
                <button
                  type="button"
                  onClick={() => {
                    void signOut()
                  }}
                  className="text-sm text-zinc-500 hover:text-zinc-900"
                >
                  Sign out
                </button>
              </div>
              <details className="relative md:hidden">
                <summary className="cursor-pointer list-none rounded-md px-2 py-1 text-sm text-zinc-600 marker:content-none hover:bg-zinc-100 hover:text-zinc-900 [&::-webkit-details-marker]:hidden">
                  Menu
                </summary>
                <div className="absolute right-0 z-30 mt-1 min-w-36 rounded-md border border-zinc-200 bg-white py-1 shadow-sm">
                  <NavLink
                    to="/settings"
                    className="block px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                  >
                    Settings
                  </NavLink>
                  <button
                    type="button"
                    onClick={() => {
                      void signOut()
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                  >
                    Sign out
                  </button>
                </div>
              </details>
            </>
          ) : null}
        </div>
        {publicAuthRoute ? null : (
          <div className={cn('mx-auto hidden px-4 pb-3 md:block', SHELL_MAX_WIDTH_CLASS)}>
            <nav className="flex flex-nowrap gap-1 overflow-x-auto" aria-label="Primary">
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
        )}
      </header>
      <main
        className={cn(
          'mx-auto px-4 py-6 pb-[var(--shell-main-pad)] md:py-8',
          SHELL_MAX_WIDTH_CLASS,
        )}
      >
        {publicAuthRoute ? (
          <Outlet />
        ) : status === 'loading' ? (
          <p className="text-zinc-600">Loading…</p>
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
      {publicAuthRoute ? null : (
        <nav
          aria-label="Primary"
          className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
        >
          <div className={cn('mx-auto grid grid-cols-5', SHELL_MAX_WIDTH_CLASS)}>
            {navItems.map((item) => (
              <NavLink
                key={item.id}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-12 items-center justify-center whitespace-nowrap px-1 text-center text-xs font-medium',
                    isActive ? 'text-zinc-900' : 'text-zinc-500',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  )
}
