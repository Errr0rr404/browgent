import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderPlus,
  Globe,
  MoreHorizontal,
  Orbit,
  PanelLeftClose,
  Plus,
  Star,
  Trash2,
  X
} from 'lucide-react'
import type { TabState } from '@shared/types'
import type { BookmarkFolder, BookmarkId, BookmarkItem } from '@shared/bookmarks'
import { useBookmarks } from '../stores/bookmarks'

interface Props {
  tabs: TabState[]
  open: boolean
  onClose: () => void
  onNewTab: () => void
  onActivateTab: (id: string) => void
  onCloseTab: (id: string) => void
  onOpenUrl: (url: string, newTab?: boolean) => void
}

type MenuState =
  | { kind: 'favorite' | 'item'; id: BookmarkId; x: number; y: number }
  | { kind: 'folder'; id: BookmarkId; x: number; y: number }
  | { kind: 'space'; x: number; y: number }
  | null

function Favicon({
  src,
  title,
  size = 18
}: {
  src?: string
  title: string
  size?: number
}): React.JSX.Element {
  const [broken, setBroken] = useState(false)
  if (!src || broken) {
    return (
      <span className="arc-favicon-fallback" aria-hidden style={{ width: size, height: size }}>
        <Globe size={Math.max(11, size - 4)} strokeWidth={1.75} />
      </span>
    )
  }
  return (
    <img
      className="arc-favicon"
      src={src}
      alt=""
      width={size}
      height={size}
      draggable={false}
      onError={() => setBroken(true)}
      title={title}
    />
  )
}

export function Sidebar({
  tabs,
  open,
  onClose,
  onNewTab,
  onActivateTab,
  onCloseTab,
  onOpenUrl
}: Props): React.JSX.Element | null {
  const {
    items,
    folders,
    spaces,
    activeSpaceId,
    addFolder,
    removeFolder,
    toggleFolder,
    removeBookmark,
    toggleFavorite,
    isFavorite,
    renameSpace
  } = useBookmarks()

  const [menu, setMenu] = useState<MenuState>(null)
  const [editingSpace, setEditingSpace] = useState(false)
  const [spaceName, setSpaceName] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  const space = useMemo(
    () => spaces.find((s) => s.id === activeSpaceId) ?? spaces[0],
    [spaces, activeSpaceId]
  )

  const favorites = useMemo(
    () =>
      (space?.favoriteIds ?? [])
        .map((id) => items[id])
        .filter((x): x is BookmarkItem => Boolean(x)),
    [space, items]
  )

  const spaceFolders = useMemo(
    () =>
      (space?.folderIds ?? [])
        .map((id) => folders[id])
        .filter((x): x is BookmarkFolder => Boolean(x)),
    [space, folders]
  )

  const looseItems = useMemo(
    () =>
      (space?.itemIds ?? [])
        .map((id) => items[id])
        .filter((x): x is BookmarkItem => Boolean(x)),
    [space, items]
  )

  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null)
      }
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  if (!open || !space) return null

  const openCtx = (
    e: React.MouseEvent,
    next: Exclude<MenuState, null>
  ): void => {
    e.preventDefault()
    e.stopPropagation()
    setMenu(next)
  }

  const startRenameSpace = (): void => {
    setSpaceName(space.name)
    setEditingSpace(true)
    setMenu(null)
  }

  const commitSpaceName = (): void => {
    renameSpace(spaceName)
    setEditingSpace(false)
  }

  return (
    <aside className="arc-sidebar" aria-label="Sidebar">
      <div className="arc-sidebar-top">
        <button
          type="button"
          className="arc-icon-btn"
          aria-label="Hide sidebar"
          title="Hide sidebar"
          onClick={onClose}
        >
          <PanelLeftClose size={16} strokeWidth={1.75} />
        </button>
        <span className="arc-sidebar-label">Library</span>
        <button
          type="button"
          className="arc-icon-btn"
          aria-label="Space options"
          title="Space options"
          onClick={(e) =>
            openCtx(e, {
              kind: 'space',
              x: e.clientX,
              y: e.clientY
            })
          }
        >
          <MoreHorizontal size={16} strokeWidth={1.75} />
        </button>
      </div>

      {/* Favorites grid — Arc signature */}
      <div className="arc-favorites" role="list" aria-label="Favorites">
        {favorites.map((fav) => (
          <button
            key={fav.id}
            type="button"
            role="listitem"
            className="arc-favorite-tile"
            title={fav.title}
            onClick={() => onOpenUrl(fav.url)}
            onContextMenu={(e) =>
              openCtx(e, { kind: 'favorite', id: fav.id, x: e.clientX, y: e.clientY })
            }
          >
            <span className="arc-favorite-icon">
              <Favicon src={fav.favicon} title={fav.title} size={22} />
            </span>
          </button>
        ))}
        {favorites.length === 0 && (
          <p className="arc-favorites-empty">
            Pin sites here — star a page or right-click a tab.
          </p>
        )}
      </div>

      {/* Space header */}
      <div className="arc-space-header">
        <Orbit size={15} strokeWidth={1.75} className="arc-space-icon" />
        {editingSpace ? (
          <input
            className="arc-space-input"
            value={spaceName}
            autoFocus
            onChange={(e) => setSpaceName(e.target.value)}
            onBlur={commitSpaceName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitSpaceName()
              if (e.key === 'Escape') setEditingSpace(false)
            }}
            aria-label="Space name"
          />
        ) : (
          <button
            type="button"
            className="arc-space-name"
            onClick={startRenameSpace}
            onDoubleClick={startRenameSpace}
            title="Rename space"
          >
            {space.name}
          </button>
        )}
      </div>

      <div className="arc-sidebar-scroll">
        {/* Folders */}
        {spaceFolders.map((folder) => {
          const folderItems = folder.itemIds
            .map((id) => items[id])
            .filter((x): x is BookmarkItem => Boolean(x))
          const collapsed = Boolean(folder.collapsed)

          return (
            <div key={folder.id} className="arc-folder">
              <button
                type="button"
                className="arc-row arc-folder-row"
                onClick={() => toggleFolder(folder.id)}
                onContextMenu={(e) =>
                  openCtx(e, { kind: 'folder', id: folder.id, x: e.clientX, y: e.clientY })
                }
              >
                <span className="arc-row-chevron" aria-hidden>
                  {collapsed ? (
                    <ChevronRight size={14} strokeWidth={1.75} />
                  ) : (
                    <ChevronDown size={14} strokeWidth={1.75} />
                  )}
                </span>
                <Folder size={15} strokeWidth={1.75} className="arc-row-icon" />
                <span className="arc-row-title">{folder.title}</span>
              </button>
              {!collapsed &&
                folderItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="arc-row arc-bookmark-row"
                    onClick={() => onOpenUrl(item.url)}
                    onContextMenu={(e) =>
                      openCtx(e, { kind: 'item', id: item.id, x: e.clientX, y: e.clientY })
                    }
                    title={item.url}
                  >
                    <span className="arc-row-indent" />
                    <Favicon src={item.favicon} title={item.title} size={14} />
                    <span className="arc-row-title">{item.title}</span>
                  </button>
                ))}
            </div>
          )
        })}

        {/* Loose bookmarks */}
        {looseItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className="arc-row arc-bookmark-row"
            onClick={() => onOpenUrl(item.url)}
            onContextMenu={(e) =>
              openCtx(e, { kind: 'item', id: item.id, x: e.clientX, y: e.clientY })
            }
            title={item.url}
          >
            <Favicon src={item.favicon} title={item.title} size={14} />
            <span className="arc-row-title">{item.title}</span>
          </button>
        ))}

        <div className="arc-divider" />

        {/* New Tab — Arc style */}
        <button type="button" className="arc-row arc-new-tab" onClick={onNewTab}>
          <Plus size={15} strokeWidth={1.75} className="arc-row-icon" />
          <span className="arc-row-title">New Tab</span>
        </button>

        {/* Open tabs (vertical, Arc-style) */}
        <div className="arc-tabs" role="tablist" aria-label="Open tabs">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              role="tab"
              aria-selected={tab.isActive}
              className={`arc-row arc-tab-row${tab.isActive ? ' active' : ''}`}
              onClick={() => onActivateTab(tab.id)}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault()
                  onCloseTab(tab.id)
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onActivateTab(tab.id)
                }
              }}
              tabIndex={0}
              title={tab.url}
            >
              {tab.favicon ? (
                <img
                  className="arc-favicon"
                  src={tab.favicon}
                  alt=""
                  width={14}
                  height={14}
                  draggable={false}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              ) : (
                <span className="arc-favicon-fallback sm" aria-hidden>
                  <Globe size={12} strokeWidth={1.75} />
                </span>
              )}
              <span className="arc-row-title">{tab.title || 'New Tab'}</span>
              {tab.owner === 'agent' && <span className="tab-owner">agent</span>}
              {tab.isLoading && <span className="arc-tab-loading" aria-hidden />}
              <button
                type="button"
                className="arc-tab-close"
                aria-label={`Close ${tab.title || 'tab'}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseTab(tab.id)
                }}
              >
                <X size={12} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Context menu */}
      {menu && (
        <div
          ref={menuRef}
          className="arc-menu"
          style={{
            left: Math.min(menu.x, window.innerWidth - 200),
            top: Math.min(menu.y, window.innerHeight - 160)
          }}
          role="menu"
        >
          {(menu.kind === 'favorite' || menu.kind === 'item') && (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const item = items[menu.id]
                  if (item) onOpenUrl(item.url, true)
                  setMenu(null)
                }}
              >
                Open in New Tab
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  toggleFavorite(menu.id)
                  setMenu(null)
                }}
              >
                <Star size={13} strokeWidth={1.75} />
                {isFavorite(menu.id) ? 'Remove from Favorites' : 'Add to Favorites'}
              </button>
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={() => {
                  removeBookmark(menu.id)
                  setMenu(null)
                }}
              >
                <Trash2 size={13} strokeWidth={1.75} />
                Delete
              </button>
            </>
          )}
          {menu.kind === 'folder' && (
            <button
              type="button"
              role="menuitem"
              className="danger"
              onClick={() => {
                removeFolder(menu.id)
                setMenu(null)
              }}
            >
              <Trash2 size={13} strokeWidth={1.75} />
              Delete Folder
            </button>
          )}
          {menu.kind === 'space' && (
            <>
              <button type="button" role="menuitem" onClick={startRenameSpace}>
                Rename Space
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  addFolder('New Folder')
                  setMenu(null)
                }}
              >
                <FolderPlus size={13} strokeWidth={1.75} />
                New Folder
              </button>
            </>
          )}
        </div>
      )}
    </aside>
  )
}
