import { Link } from 'react-router-dom'
import { quietButtonClass } from '@/lib'
import { prefixedPath, useAppPathPrefix } from '@/lib/app-prefix'

export function AskHealthLink({ className = '' }: { className?: string }) {
  const prefix = useAppPathPrefix()
  return (
    <Link to={prefixedPath(prefix, '/ask-health')} className={`${quietButtonClass} inline-flex ${className}`}>
      Ask Health
    </Link>
  )
}
