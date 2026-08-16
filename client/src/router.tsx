import { useEffect, useState, useCallback } from 'react'

export interface Route {
  path: string
  params: Record<string, string>
}

function parseHash(): Route {
  const hash = window.location.hash.replace(/^#/, '') || '/'
  const parts = hash.split('/').filter(Boolean)
  return {
    path: '/' + parts.join('/'),
    params: {},
  }
}

export function useRouter(): Route & { navigate: (path: string) => void } {
  const [route, setRoute] = useState<Route>(parseHash)

  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash())
      // Scroll to top on navigation
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const navigate = useCallback((path: string) => {
    window.location.hash = path
  }, [])

  return { ...route, navigate }
}

/**
 * Match a route pattern like '/station/:id' against the current path.
 * Returns params if match, null if no match.
 */
export function matchRoute(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean)
  const pathParts = path.split('/').filter(Boolean)

  if (patternParts.length !== pathParts.length) return null

  const params: Record<string, string> = {}
  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i]
    const actual = pathParts[i]
    if (pp.startsWith(':')) {
      params[pp.slice(1)] = actual
    } else if (pp !== actual) {
      return null
    }
  }
  return params
}