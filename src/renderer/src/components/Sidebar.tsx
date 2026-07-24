import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderPlus,
  MoreHorizontal,
  Orbit,
  PanelLeftClose,
  Plus,
  Star,
  Trash2,
  X
} from 'lucide-react'
import type { TabState } from '@shared/types'
import {
  MAX_FAVORITES,
  type BookmarkFolder,
  type BookmarkId,
  type BookmarkItem
} from '@shared/bookmarks'
import { isBlankUrl, tabDisplayTitle } from '../lib/urls'
import { useBookmarks } from '../stores/bookmarks'
import { useRovingTablist } from '../hooks/useRovingTablist'
import { Favicon } from './Favicon'

/** HTML5 DnD payload for pinning to the favorites board */
const FAV_DND_MIME = 'application/x-browgent-favorite'

type FavDragPayload =
  | { kind: 'bookmark'; id: BookmarkId }
  | { kind: 'tab'; title: string; url: string; favicon?: string }

function writeFavDrag(e: React.DragEvent, payload: FavDragPayload): void {
  const json = JSON.stringify(payload)
  e.dataTransfer.setData(FAV_DND_MIME, json)
  // Fallback so some environments still expose a type we can detect on dragover
  e.dataTransfer.setData('text/plain', json)
  e.dataTransfer.effectAllowed = 'copy'
}

function readFavDrag(e: React.DragEvent): FavDragPayload | null {
  const raw =
    e.dataTransfer.getData(FAV_DND_MIME) || e.dataTransfer.getData('text/plain')
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as FavDragPayload
    if (data?.kind === 'bookmark' && typeof data.id === 'string') return data
    if (
      data?.kind === 'tab' &&
      typeof data.url === 'string' &&
      data.url.trim()
    ) {
      return data
    }
  } catch {
    /* ignore */
  }
  return null
}

function isFavDrag(e: React.DragEvent): boolean {
  // Custom MIME is listed in `types` during dragover in Chromium/Electron
  return Array.from(e.dataTransfer.types).includes(FAV_DND_MIME)
}

function tabLabel(tab: TabState): string {
  return tabDisplayTitle(tab.title, tab.url)
}

interface Props {
  tabs: TabState[]
  open: boolean
  libraryOpen?: boolean
  onClose: () => void
  onNewTab: () => void
  onActivateTab: (id: string) => void
  onCloseTab: (id: string) => void
  onOpenUrl: (url: string, newTab?: boolean) => void
  onToggleLibrary?: () => void
}

type MenuKind = 'favorite' | 'item' | 'folder' | 'space'

interface MenuStateBase {
  kind: MenuKind
  anchor: DOMRect
  openerId: string
}

type MenuState =
  | (MenuStateBase & { kind: 'favorite' | 'item' | 'folder'; id: BookmarkId })
  | (MenuStateBase & { kind: 'space' })

const MENU_VPAD = 8
const MENU_TOP_MIN = 48

const isMenuKeyTrigger = (e: React.KeyboardEvent): boolean =>
  e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')

export function Sidebar({
  tabs,
  open,
  libraryOpen = false,
  onClose,
  onNewTab,
  onActivateTab,
  onCloseTab,
  onOpenUrl,
  onToggleLibrary
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
    renameSpace,
    pinCurrentAsFavorite
  } = useBookmarks()

  const [menu, setMenu] = useState<MenuState | null>(null)
  const [editingSpace, setEditingSpace] = useState(false)
  const [spaceName, setSpaceName] = useState('')
  const [favDropActive, setFavDropActive] = useState(false)
  const cancelledRef = useRef(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const spaceInputRef = useRef<HTMLInputElement>(null)
  const spaceNameBtnRef = useRef<HTMLButtonElement>(null)
  const favDragDepth = useRef(0)

  const sidebarTablistRef = useRef<HTMLDivElement>(null)
  const menuListId = useId()

  const space = useMemo(
    () => spaces.find((s) => s.id === activeSpaceId) ?? spaces[0],
    [spaces, activeSpaceId]
  )

  /** Pinned tiles — max 8 for a 4×2 board */
  const favorites = useMemo(
    () =>
      (space?.favoriteIds ?? [])
        .map((id) => items[id])
        .filter((x): x is BookmarkItem => Boolean(x))
        .slice(0, MAX_FAVORITES),
    [space, items]
  )
  const canAddFavorite = favorites.length < MAX_FAVORITES
  /** Empty dashed cells after favorites (+ optional + tile) */
  const favoriteEmptySlots = Math.max(
    0,
    MAX_FAVORITES - favorites.length - (canAddFavorite ? 1 : 0)
  )
  const activeLiveTab = useMemo(
    () => tabs.find((t) => t.isActive && !isBlankUrl(t.url)) ?? null,
    [tabs]
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

  const activeTabIdx = useMemo(
    () => Math.max(0, tabs.findIndex((t) => t.isActive)),
    [tabs]
  )

  const tabRoving = useRovingTablist({
    items: tabs,
    activeIndex: activeTabIdx,
    orientation: 'vertical',
    containerRef: sidebarTablistRef,
    onActivate: (tab) => onActivateTab(tab.id),
    onClose: (tab) => onCloseTab(tab.id)
  })

  const restoreOpener = useCallback((openerId: string) => {
    window.requestAnimationFrame(() => {
      document.getElementById(openerId)?.focus()
    })
  }, [])

  const closeMenu = useCallback(() => {
    setMenu(null)
  }, [])

  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu()
      }
    }
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('mousedown', onDown)
    }
  }, [menu, closeMenu])

  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return
    const el = menuRef.current
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let dx = 0
    let dy = 0
    if (rect.right > vw - MENU_VPAD) dx = vw - MENU_VPAD - rect.right
    if (rect.bottom > vh - MENU_VPAD) dy = vh - MENU_VPAD - rect.bottom
    if (rect.left + dx < MENU_VPAD) dx = MENU_VPAD - (rect.left + dx)
    if (rect.top + dy < MENU_TOP_MIN) dy = MENU_TOP_MIN - (rect.top + dy)
    if (dx !== 0 || dy !== 0) {
      el.style.left = `${Math.round(rect.left + dx)}px`
      el.style.top = `${Math.round(rect.top + dy)}px`
    }
    const first = el.querySelector<HTMLElement>('[role="menuitem"]')
    first?.focus()
  }, [menu])

  useEffect(() => {
    if (editingSpace) {
      cancelledRef.current = false
      spaceInputRef.current?.select()
    }
  }, [editingSpace])

  if (!open || !space) return null

  const closeAndRestoreOpener = (): void => {
    const openerId = menu?.openerId
    closeMenu()
    if (openerId) restoreOpener(openerId)
  }

  const openCtxFromMouse = (
    e: React.MouseEvent,
    kind: 'favorite' | 'item' | 'folder' | 'space',
    id?: BookmarkId
  ): void => {
    e.preventDefault()
    e.stopPropagation()
    const el = e.currentTarget as HTMLElement
    const anchor = el.getBoundingClientRect()
    const openerId = el.id || ''
    if (kind === 'space') {
      setMenu({ kind: 'space', anchor, openerId })
    } else {
      if (!id) return
      setMenu({ kind, id, anchor, openerId })
    }
  }

  const openCtxFromKey = (
    e: React.KeyboardEvent,
    kind: 'favorite' | 'item' | 'folder' | 'space',
    id?: BookmarkId
  ): void => {
    if (!isMenuKeyTrigger(e)) return
    e.preventDefault()
    e.stopPropagation()
    const el = e.currentTarget as HTMLElement
    const anchor = el.getBoundingClientRect()
    const openerId = el.id || ''
    if (kind === 'space') {
      setMenu({ kind: 'space', anchor, openerId })
    } else {
      if (!id) return
      setMenu({ kind, id, anchor, openerId })
    }
  }

  const pinFromPayload = useCallback(
    (payload: FavDragPayload): boolean => {
      if (!canAddFavorite) return false
      if (payload.kind === 'bookmark') {
        if (isFavorite(payload.id)) return true
        toggleFavorite(payload.id)
        return true
      }
      const url = payload.url.trim()
      if (!url || isBlankUrl(url)) return false
      pinCurrentAsFavorite(
        payload.title || tabDisplayTitle(payload.title, url),
        url,
        payload.favicon
      )
      return true
    },
    [canAddFavorite, isFavorite, toggleFavorite, pinCurrentAsFavorite]
  )

  const onFavoritesDragEnter = (e: React.DragEvent): void => {
    if (!isFavDrag(e) || !canAddFavorite) return
    e.preventDefault()
    e.stopPropagation()
    favDragDepth.current += 1
    setFavDropActive(true)
  }

  const onFavoritesDragOver = (e: React.DragEvent): void => {
    if (!isFavDrag(e) || !canAddFavorite) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
  }

  const onFavoritesDragLeave = (e: React.DragEvent): void => {
    if (!isFavDrag(e)) return
    e.preventDefault()
    e.stopPropagation()
    favDragDepth.current = Math.max(0, favDragDepth.current - 1)
    if (favDragDepth.current === 0) setFavDropActive(false)
  }

  const onFavoritesDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    favDragDepth.current = 0
    setFavDropActive(false)
    if (!canAddFavorite) return
    const payload = readFavDrag(e)
    if (payload) pinFromPayload(payload)
  }

  /** + tile: pin the active tab when possible, otherwise ask for a URL */
  const onAddFavoriteClick = (): void => {
    if (!canAddFavorite) return
    if (activeLiveTab) {
      pinCurrentAsFavorite(
        tabLabel(activeLiveTab),
        activeLiveTab.url,
        activeLiveTab.favicon
      )
      return
    }
    const raw = window.prompt('Add favorite — enter a URL')
    if (!raw?.trim()) return
    let url = raw.trim()
    if (!/^https?:\/\//i.test(url) && !url.startsWith('//')) {
      url = `https://${url}`
    }
    pinCurrentAsFavorite(tabDisplayTitle(null, url), url)
  }

  const startRenameSpace = (): void => {
    setSpaceName(space.name)
    setEditingSpace(true)
    closeMenu()
  }

  const commitSpaceName = (): void => {
    if (cancelledRef.current) {
      cancelledRef.current = false
      setEditingSpace(false)
      return
    }
    renameSpace(spaceName)
    setEditingSpace(false)
  }

  const cancelSpaceRename = (): void => {
    cancelledRef.current = true
    setEditingSpace(false)
    spaceNameBtnRef.current?.focus()
  }

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
    )
    if (items.length === 0) return
    const cur = items.findIndex((el) => el === document.activeElement)
    const focusAt = (i: number): void => {
      items[(i + items.length) % items.length]?.focus()
    }

    if (e.key === 'Tab') {
      closeMenu()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusAt(cur + 1)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      focusAt(cur - 1)
      return
    }
    if (e.key === 'Home') {
      e.preventDefault()
      focusAt(0)
      return
    }
    if (e.key === 'End') {
      e.preventDefault()
      focusAt(items.length - 1)
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      closeAndRestoreOpener()
      return
    }
  }

  const menuPos = (() => {
    if (!menu) return { left: 8, top: 48 }
    const a = menu.anchor
    return { left: Math.round(a.left), top: Math.round(a.bottom + 4) }
  })()

  const renderMenuItems = (): React.ReactNode => {
    if (!menu) return null
    if (menu.kind === 'favorite' || menu.kind === 'item') {
      const item = items[menu.id]
      return (
        <>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              if (item) onOpenUrl(item.url, true)
              closeAndRestoreOpener()
            }}
          >
            Open in New Tab
          </button>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              toggleFavorite(menu.id)
              closeAndRestoreOpener()
            }}
          >
            <Star size={13} strokeWidth={1.75} />
            {isFavorite(menu.id) ? 'Remove from Favorites' : 'Add to Favorites'}
          </button>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="danger"
            onClick={() => {
              removeBookmark(menu.id)
              closeAndRestoreOpener()
            }}
          >
            <Trash2 size={13} strokeWidth={1.75} />
            Delete
          </button>
        </>
      )
    }
    if (menu.kind === 'folder') {
      return (
        <button
          type="button"
          role="menuitem"
          tabIndex={-1}
          className="danger"
          onClick={() => {
            removeFolder(menu.id)
            closeAndRestoreOpener()
          }}
        >
          <Trash2 size={13} strokeWidth={1.75} />
          Delete Folder
        </button>
      )
    }
    return (
      <>
        <button
          type="button"
          role="menuitem"
          tabIndex={-1}
          onClick={startRenameSpace}
        >
          Rename Space
        </button>
        <button
          type="button"
          role="menuitem"
          tabIndex={-1}
          onClick={() => {
            addFolder('New Folder')
            closeAndRestoreOpener()
          }}
        >
          <FolderPlus size={13} strokeWidth={1.75} />
          New Folder
        </button>
      </>
    )
  }

  return (
    <aside className="arc-sidebar" aria-label="Sidebar">
      <div className="arc-sidebar-top">
        <button
          type="button"
          className="arc-icon-btn"
          aria-label="Hide sidebar"
          title="Hide sidebar (⌘⇧S)"
          onClick={onClose}
        >
          <PanelLeftClose size={16} strokeWidth={1.75} />
        </button>
        <span className="arc-sidebar-label">Library</span>
        {onToggleLibrary && (
          <button
            type="button"
            className={`arc-icon-btn${libraryOpen ? ' on' : ''}`}
            aria-label={libraryOpen ? 'Close Library manager' : 'Open Library manager'}
            title="Open Library manager"
            aria-pressed={libraryOpen}
            onClick={onToggleLibrary}
          >
            <BookOpen size={15} strokeWidth={1.75} />
          </button>
        )}
        <button
          type="button"
          id="sidebar-space-options"
          className="arc-icon-btn"
          aria-haspopup="menu"
          {...(menu?.kind === 'space'
            ? { 'aria-controls': menuListId, 'aria-expanded': true }
            : { 'aria-expanded': false })}
          aria-label="Space options"
          title="Space options"
          onClick={(e) => openCtxFromMouse(e, 'space')}
          onKeyDown={(e) => openCtxFromKey(e, 'space')}
        >
          <MoreHorizontal size={16} strokeWidth={1.75} />
        </button>
      </div>

      {/* Favorites grid — 4×2 pin board (drop tabs/bookmarks here) */}
      <div
        className={`arc-favorites${favDropActive ? ' is-drop-target' : ''}`}
        role="list"
        aria-label="Favorites"
        onDragEnter={onFavoritesDragEnter}
        onDragOver={onFavoritesDragOver}
        onDragLeave={onFavoritesDragLeave}
        onDrop={onFavoritesDrop}
      >
        {favorites.map((fav) => (
          <button
            key={fav.id}
            type="button"
            id={`sidebar-favorite-${fav.id}`}
            className="arc-favorite-tile"
            title={fav.title}
            aria-label={`Open ${fav.title || fav.url}`}
            onMouseDown={(e) => {
              // Ensure chrome drag regions never swallow the press
              e.stopPropagation()
            }}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              const url = (fav.url || '').trim()
              if (!url) return
              onOpenUrl(url)
            }}
            onContextMenu={(e) => openCtxFromMouse(e, 'favorite', fav.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                const url = (fav.url || '').trim()
                if (url) onOpenUrl(url)
                return
              }
              openCtxFromKey(e, 'favorite', fav.id)
            }}
          >
            <span className="arc-favorite-icon" aria-hidden>
              <Favicon src={fav.favicon} title={fav.title} size={20} />
            </span>
          </button>
        ))}
        {canAddFavorite && (
          <button
            type="button"
            className="arc-favorite-tile arc-favorite-add"
            title={
              activeLiveTab
                ? `Pin “${tabLabel(activeLiveTab)}” to Favorites`
                : 'Add favorite (or drag a tab/bookmark here)'
            }
            aria-label={
              activeLiveTab
                ? `Pin ${tabLabel(activeLiveTab)} to Favorites`
                : 'Add favorite'
            }
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onAddFavoriteClick()
            }}
          >
            <Plus size={18} strokeWidth={1.75} aria-hidden />
          </button>
        )}
        {Array.from({ length: favoriteEmptySlots }, (_, i) => (
          <div key={`slot-${i}`} className="arc-favorite-slot" aria-hidden />
        ))}
      </div>

      <div className="arc-space-header">
        <Orbit size={15} strokeWidth={1.75} className="arc-space-icon" />
        {editingSpace ? (
          <input
            ref={spaceInputRef}
            className="arc-space-input"
            value={spaceName}
            onChange={(e) => setSpaceName(e.target.value)}
            onBlur={commitSpaceName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                ;(e.currentTarget as HTMLInputElement).blur()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                cancelSpaceRename()
              }
            }}
            aria-label="Space name"
          />
        ) : (
          <button
            ref={spaceNameBtnRef}
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
                id={`sidebar-folder-${folder.id}`}
                className="arc-row arc-folder-row"
                aria-haspopup="menu"
                onClick={() => toggleFolder(folder.id)}
                onContextMenu={(e) => openCtxFromMouse(e, 'folder', folder.id)}
                onKeyDown={(e) => openCtxFromKey(e, 'folder', folder.id)}
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
                    id={`sidebar-bookmark-${item.id}`}
                    className="arc-row arc-bookmark-row"
                    draggable
                    aria-haspopup="menu"
                    onDragStart={(e) => {
                      writeFavDrag(e, { kind: 'bookmark', id: item.id })
                      e.dataTransfer.setDragImage(
                        e.currentTarget,
                        12,
                        12
                      )
                    }}
                    onClick={() => onOpenUrl(item.url)}
                    onContextMenu={(e) => openCtxFromMouse(e, 'item', item.id)}
                    onKeyDown={(e) => openCtxFromKey(e, 'item', item.id)}
                    title={`${item.url} — drag to Favorites`}
                  >
                    <span className="arc-row-indent" />
                    <Favicon src={item.favicon} title={item.title} size={14} small />
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
            id={`sidebar-bookmark-${item.id}`}
            className="arc-row arc-bookmark-row"
            draggable
            aria-haspopup="menu"
            onDragStart={(e) => {
              writeFavDrag(e, { kind: 'bookmark', id: item.id })
              e.dataTransfer.setDragImage(e.currentTarget, 12, 12)
            }}
            onClick={() => onOpenUrl(item.url)}
            onContextMenu={(e) => openCtxFromMouse(e, 'item', item.id)}
            onKeyDown={(e) => openCtxFromKey(e, 'item', item.id)}
            title={`${item.url} — drag to Favorites`}
          >
            <Favicon src={item.favicon} title={item.title} size={14} small />
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
        <div
          className="arc-tabs"
          role="tablist"
          aria-label="Open tabs"
          ref={sidebarTablistRef}
        >
          {tabs.map((tab, i) => {
            const tp = tabRoving.tabPropsFor(tab, i)
            const blank = isBlankUrl(tab.url)
            return (
              <div
                key={tab.id}
                role="tab"
                aria-selected={tab.isActive}
                className={`arc-row arc-tab-row${tab.isActive ? ' active' : ''}`}
                tabIndex={tp.tabIndex}
                draggable={!blank}
                onFocus={tp.onFocus}
                onKeyDown={tp.onKeyDown}
                onClick={tp.onClick}
                onDragStart={(e) => {
                  if (blank) {
                    e.preventDefault()
                    return
                  }
                  writeFavDrag(e, {
                    kind: 'tab',
                    title: tabLabel(tab),
                    url: tab.url,
                    favicon: tab.favicon
                  })
                  e.dataTransfer.setDragImage(e.currentTarget, 12, 12)
                }}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault()
                    onCloseTab(tab.id)
                  }
                }}
                title={
                  blank
                    ? 'New Tab'
                    : `${tab.url} — drag to Favorites`
                }
              >
                <Favicon
                  src={blank ? undefined : tab.favicon}
                  title={tabLabel(tab)}
                  size={14}
                  small
                />
                <span className="arc-row-title">{tabLabel(tab)}</span>
                {tab.owner === 'agent' && <span className="tab-owner">agent</span>}
                {tab.isLoading && <span className="arc-tab-loading" aria-hidden />}
                <button
                  type="button"
                  className="arc-tab-close"
                  aria-label={`Close ${tabLabel(tab)}`}
                  draggable={false}
                  onClick={(e) => {
                    e.stopPropagation()
                    onCloseTab(tab.id)
                  }}
                  tabIndex={-1}
                >
                  <X size={12} strokeWidth={2} />
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Context menu */}
      {menu && (
        <div
          ref={menuRef}
          className="arc-menu"
          id={menuListId}
          style={{ left: menuPos.left, top: menuPos.top }}
          role="menu"
          aria-label="Item actions"
          onKeyDown={onMenuKeyDown}
        >
          {renderMenuItems()}
        </div>
      )}
    </aside>
  )
}
