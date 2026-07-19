import { useEffect } from 'react'

/**
 * Applies the admin's warm neutral palette (DESIGN.md brand tones) while an
 * admin surface is mounted. The class goes on <html> rather than a wrapper div
 * so it also reaches Headless UI dialogs, which portal to <body>. Cleanup on
 * unmount removes it, so navigating back to the public site restores the
 * default cool neutrals. See `.admin-warm` in index.css and the `neutral` scale
 * in tailwind.config.js.
 */
export function useAdminTheme(): void {
  useEffect(() => {
    document.documentElement.classList.add('admin-warm')
    return () => document.documentElement.classList.remove('admin-warm')
  }, [])
}
