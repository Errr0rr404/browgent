import { useMemo, useState } from 'react'
import { Search, Star, Trash2, X } from 'lucide-react'
import type { BookmarkItem } from '@shared/bookmarks'
import { hostFromUrl } from '@shared/bookmarks'
import { useBookmarks } from '../stores/bookmarks'
import { Favicon } from './Favicon'
import '../styles/chrome-pages.css'

interface Props {
  open: boolean
  onClose: () => void
  onOpenUrl: (url: string, newTab?: boolean) => void
}

interface LibRow {
  item: BookmarkItem
  isFavorite: boolean
}

interface LibGroup {
  label: string
  rows: LibRow[]
}

function matchesQuery(item: BookmarkItem, q: string): boolean {
  if (!q) return true
  const hay = `${item.title} ${item.url} ${hostFromUrl(item.url)}`.toLowerCase()
  return hay.includes(q)
}

export function LibraryManager({
  open,
  onClose,
  onOpenUrl
}: Props): React.JSX.Element | null {
  const {
    items,
    folders,
    spaces,
    activeSpaceId,
    removeBookmark,
    toggleFavorite,
    isFavorite
  } = useBookmarks()

  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  const space = useMemo(
    () => spaces.find((s) => s.id === activeSpaceId) ?? spaces[0],
    [spaces, activeSpaceId]
  )

  const groups = useMemo((): LibGroup[] => {
    if (!space) return []

    const seen = new Set<string>()
    const out: LibGroup[] = []

    const favRows: LibRow[] = (space.favoriteIds ?? [])
      .map((id) => items[id])
      .filter((x): x is BookmarkItem => Boolean(x))
      .filter((item) => matchesQuery(item, q))
      .map((item) => {
        seen.add(item.id)
        return { item, isFavorite: true }
      })

    if (favRows.length > 0) {
      out.push({ label: 'Favorites', rows: favRows })
    }

    for (const fid of space.folderIds ?? []) {
      const folder = folders[fid]
      if (!folder) continue
      const rows: LibRow[] = folder.itemIds
        .map((id) => items[id])
        .filter((x): x is BookmarkItem => Boolean(x))
        .filter((item) => matchesQuery(item, q))
        .map((item) => {
          seen.add(item.id)
          return { item, isFavorite: isFavorite(item.id) }
        })
      if (rows.length > 0) {
        out.push({ label: folder.title, rows })
      }
    }

    const otherRows: LibRow[] = (space.itemIds ?? [])
      .map((id) => items[id])
      .filter((x): x is BookmarkItem => Boolean(x))
      .filter((item) => !seen.has(item.id))
      .filter((item) => matchesQuery(item, q))
      .map((item) => ({ item, isFavorite: isFavorite(item.id) }))

    if (otherRows.length > 0) {
      out.push({ label: 'Other', rows: otherRows })
    } else if (q) {
      const orphanRows: LibRow[] = Object.values(items)
        .filter((item) => !seen.has(item.id) && matchesQuery(item, q))
        .map((item) => ({ item, isFavorite: isFavorite(item.id) }))
      if (orphanRows.length > 0) {
        out.push({ label: 'Other', rows: orphanRows })
      }
    }

    return out
  }, [space, items, folders, q, isFavorite])

  const totalCount = Object.keys(items).length
  const spaceName = space?.name ?? 'Personal'

  if (!open) return null

  return (
    <section
      className="library-manager"
      data-screen-label="Library manager"
      aria-label="Library manager"
    >
      <header className="library-manager-head">
        <div className="library-manager-titles">
          <h2>Library</h2>
          <div className="library-manager-meta">
            {totalCount} saved · {spaceName}
          </div>
        </div>
        <button
          type="button"
          className="library-manager-close"
          aria-label="Close library"
          onClick={onClose}
        >
          <X size={15} strokeWidth={2} />
        </button>
      </header>

      <div className="library-manager-search-wrap">
        <div className="library-manager-search">
          <Search size={13} strokeWidth={1.75} aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search bookmarks"
            aria-label="Search bookmarks"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>

      <div className="library-manager-list">
        {groups.every((g) => g.rows.length === 0) ? (
          <p className="library-manager-empty">
            {q ? 'No bookmarks match your search.' : 'No saved bookmarks yet.'}
          </p>
        ) : (
          groups.map((g) => (
            <div key={g.label} className="library-manager-group">
              <div className="library-manager-group-label">{g.label}</div>
              {g.rows.map(({ item, isFavorite: fav }) => (
                <div key={item.id} className="library-manager-row">
                  <Favicon src={item.favicon} title={item.title} size={16} />
                  <button
                    type="button"
                    className="library-manager-open"
                    title={item.url}
                    onClick={() => onOpenUrl(item.url)}
                  >
                    <span className="library-manager-title">{item.title}</span>
                    <span className="library-manager-url">{item.url}</span>
                  </button>
                  <button
                    type="button"
                    className={`library-manager-icon-btn star${fav ? ' on' : ''}`}
                    title={fav ? 'Unpin from favorites' : 'Pin to favorites'}
                    aria-label={fav ? 'Unpin from favorites' : 'Pin to favorites'}
                    onClick={() => toggleFavorite(item.id)}
                  >
                    <Star size={13} strokeWidth={1.75} fill={fav ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    type="button"
                    className="library-manager-icon-btn danger"
                    title="Delete bookmark"
                    aria-label="Delete bookmark"
                    onClick={() => removeBookmark(item.id)}
                  >
                    <Trash2 size={13} strokeWidth={1.75} />
                  </button>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      <footer className="library-manager-foot">
        Click a row to open · star to pin to Favorites · trash to remove
      </footer>
    </section>
  )
}
