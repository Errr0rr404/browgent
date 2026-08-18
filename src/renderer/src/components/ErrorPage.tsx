import { RotateCw, Search, WifiOff } from 'lucide-react'
import { BrandMark } from './BrandMark'
import { buildSearchUrl, useChromePrefs } from '../stores/chromePrefs'
import '../styles/chrome-pages.css'

interface Props {
  url: string
  reason?: string | null
  onRetry: () => void
  onSearch?: (url: string) => void
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname || url
  } catch {
    return url
  }
}

export function ErrorPage({ url, reason, onRetry, onSearch }: Props): React.JSX.Element {
  const searchEngine = useChromePrefs((s) => s.searchEngine)
  const host = hostOf(url)
  const headline = /blocked|policy/i.test(reason ?? '')
    ? 'This navigation was blocked'
    : 'This page can’t be reached'

  const search = (): void => {
    if (!onSearch) return
    const q = host && host !== url ? host : url
    const target = buildSearchUrl(searchEngine, q)
    if (target) onSearch(target)
  }

  return (
    <div className="error-page" data-screen-label="Load error">
      <div className="newtab-ambient" aria-hidden />
      <div className="error-page-inner">
        <BrandMark size={36} className="error-page-mark" strokeWidth={1.8} />
        <div className="error-page-icon" aria-hidden>
          <WifiOff size={22} strokeWidth={1.75} />
        </div>
        <h1 className="error-page-title">{headline}</h1>
        <p className="error-page-host" title={url}>
          {host}
        </p>
        {reason && <p className="error-page-reason">{reason}</p>}
        <div className="error-page-actions">
          <button type="button" className="error-page-retry" onClick={onRetry}>
            <RotateCw size={14} strokeWidth={1.75} />
            Try again
          </button>
          {onSearch && (
            <button type="button" className="error-page-search" onClick={search}>
              <Search size={14} strokeWidth={1.75} />
              Search {searchEngine}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
