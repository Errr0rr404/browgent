import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  createBookmarkId,
  createDefaultBookmarks,
  createFolderId,
  faviconForUrl,
  hostFromUrl,
  titleFromUrl,
  type BookmarkFolder,
  type BookmarkId,
  type BookmarkItem,
  type BookmarksState,
  type BookmarkSpace
} from '@shared/bookmarks'

interface BookmarksStore extends BookmarksState {
  addBookmark: (input: {
    title?: string
    url: string
    favicon?: string
    asFavorite?: boolean
    folderId?: BookmarkId
  }) => BookmarkId
  removeBookmark: (id: BookmarkId) => void
  toggleFavorite: (id: BookmarkId) => void
  isFavorite: (id: BookmarkId) => boolean
  isBookmarkedUrl: (url: string) => BookmarkId | null
  addFolder: (title: string) => BookmarkId
  removeFolder: (id: BookmarkId) => void
  renameFolder: (id: BookmarkId, title: string) => void
  toggleFolder: (id: BookmarkId) => void
  moveToFolder: (itemId: BookmarkId, folderId: BookmarkId | null) => void
  renameSpace: (name: string) => void
  pinCurrentAsFavorite: (title: string, url: string, favicon?: string) => BookmarkId
}

function activeSpace(state: BookmarksState): BookmarkSpace {
  return (
    state.spaces.find((s) => s.id === state.activeSpaceId) ??
    state.spaces[0] ?? {
      id: 'sp_default',
      name: 'Space 1',
      favoriteIds: [],
      folderIds: [],
      itemIds: []
    }
  )
}

function normalizeUrlKey(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    u.hash = ''
    // strip trailing slash for comparison
    const path = u.pathname.replace(/\/$/, '') || '/'
    return `${u.protocol}//${u.host}${path}${u.search}`
  } catch {
    return url.trim()
  }
}

function patchActiveSpace(
  state: BookmarksState,
  patch: (space: BookmarkSpace) => BookmarkSpace
): BookmarkSpace[] {
  return state.spaces.map((s) => (s.id === state.activeSpaceId ? patch(s) : s))
}

function stripItemRefs(state: BookmarksState, id: BookmarkId): Partial<BookmarksState> {
  return {
    spaces: state.spaces.map((s) => ({
      ...s,
      favoriteIds: s.favoriteIds.filter((x) => x !== id),
      itemIds: s.itemIds.filter((x) => x !== id)
    })),
    folders: Object.fromEntries(
      Object.entries(state.folders).map(([fid, folder]) => [
        fid,
        { ...folder, itemIds: folder.itemIds.filter((x) => x !== id) }
      ])
    )
  }
}

export const useBookmarks = create<BookmarksStore>()(
  persist(
    (set, get) => ({
      ...createDefaultBookmarks(),

      addBookmark: ({ title, url, favicon, asFavorite, folderId }) => {
        const itemId = createBookmarkId()
        const item: BookmarkItem = {
          id: itemId,
          title: (title?.trim() || titleFromUrl(url)).slice(0, 120),
          url,
          favicon: favicon || faviconForUrl(url),
          createdAt: Date.now()
        }

        set((state) => {
          const folders = { ...state.folders }
          let spaces = state.spaces

          if (folderId && folders[folderId]) {
            folders[folderId] = {
              ...folders[folderId],
              itemIds: [...folders[folderId].itemIds, itemId]
            }
          } else if (asFavorite) {
            spaces = patchActiveSpace(state, (s) => ({
              ...s,
              favoriteIds: [...s.favoriteIds, itemId]
            }))
          } else {
            spaces = patchActiveSpace(state, (s) => ({
              ...s,
              itemIds: [...s.itemIds, itemId]
            }))
          }

          return {
            items: { ...state.items, [itemId]: item },
            folders,
            spaces
          }
        })

        return itemId
      },

      removeBookmark: (id) => {
        set((state) => {
          if (!state.items[id]) return state
          const { [id]: _removed, ...items } = state.items
          return {
            items,
            ...stripItemRefs(state, id)
          }
        })
      },

      toggleFavorite: (id) => {
        set((state) => {
          if (!state.items[id]) return state
          const space = activeSpace(state)
          const isFav = space.favoriteIds.includes(id)

          if (!isFav) {
            // Pin to favorites grid
            return {
              spaces: patchActiveSpace(state, (s) => ({
                ...s,
                favoriteIds: [...s.favoriteIds, id]
              }))
            }
          }

          // Unpin — if the item lives nowhere else, delete it entirely
          const inFolder = Object.values(state.folders).some((f) => f.itemIds.includes(id))
          const inLoose = space.itemIds.includes(id)
          if (!inFolder && !inLoose) {
            const { [id]: _removed, ...items } = state.items
            return {
              items,
              spaces: patchActiveSpace(state, (s) => ({
                ...s,
                favoriteIds: s.favoriteIds.filter((x) => x !== id)
              }))
            }
          }

          return {
            spaces: patchActiveSpace(state, (s) => ({
              ...s,
              favoriteIds: s.favoriteIds.filter((x) => x !== id)
            }))
          }
        })
      },

      isFavorite: (id) => activeSpace(get()).favoriteIds.includes(id),

      isBookmarkedUrl: (url) => {
        const key = normalizeUrlKey(url)
        if (!key) return null
        for (const item of Object.values(get().items)) {
          if (normalizeUrlKey(item.url) === key) return item.id
        }
        return null
      },

      addFolder: (title) => {
        const folderId = createFolderId()
        const folder: BookmarkFolder = {
          id: folderId,
          title: title.trim() || 'New Folder',
          itemIds: [],
          collapsed: false,
          createdAt: Date.now()
        }
        set((state) => ({
          folders: { ...state.folders, [folderId]: folder },
          spaces: patchActiveSpace(state, (s) => ({
            ...s,
            folderIds: [...s.folderIds, folderId]
          }))
        }))
        return folderId
      },

      removeFolder: (id) => {
        set((state) => {
          const folder = state.folders[id]
          if (!folder) return state
          const { [id]: _f, ...folders } = state.folders
          // promote folder items to loose space items
          return {
            folders,
            spaces: patchActiveSpace(state, (s) => ({
              ...s,
              folderIds: s.folderIds.filter((x) => x !== id),
              itemIds: [...s.itemIds, ...folder.itemIds.filter((iid) => !s.itemIds.includes(iid))]
            }))
          }
        })
      },

      renameFolder: (id, title) => {
        set((state) => {
          const folder = state.folders[id]
          if (!folder) return state
          return {
            folders: {
              ...state.folders,
              [id]: { ...folder, title: title.trim() || folder.title }
            }
          }
        })
      },

      toggleFolder: (id) => {
        set((state) => {
          const folder = state.folders[id]
          if (!folder) return state
          return {
            folders: {
              ...state.folders,
              [id]: { ...folder, collapsed: !folder.collapsed }
            }
          }
        })
      },

      moveToFolder: (itemId, folderId) => {
        set((state) => {
          if (!state.items[itemId]) return state
          // strip from all folders + space loose list
          const folders = Object.fromEntries(
            Object.entries(state.folders).map(([fid, folder]) => [
              fid,
              { ...folder, itemIds: folder.itemIds.filter((x) => x !== itemId) }
            ])
          ) as Record<string, BookmarkFolder>

          let spaces = state.spaces.map((s) => ({
            ...s,
            itemIds: s.itemIds.filter((x) => x !== itemId)
          }))

          if (folderId && folders[folderId]) {
            folders[folderId] = {
              ...folders[folderId],
              itemIds: [...folders[folderId].itemIds, itemId]
            }
          } else {
            spaces = spaces.map((s) =>
              s.id === state.activeSpaceId
                ? { ...s, itemIds: [...s.itemIds, itemId] }
                : s
            )
          }

          return { folders, spaces }
        })
      },

      renameSpace: (name) => {
        set((state) => ({
          spaces: patchActiveSpace(state, (s) => ({
            ...s,
            name: name.trim() || s.name
          }))
        }))
      },

      pinCurrentAsFavorite: (title, url, favicon) => {
        const existing = get().isBookmarkedUrl(url)
        if (existing) {
          if (!get().isFavorite(existing)) get().toggleFavorite(existing)
          return existing
        }
        return get().addBookmark({
          title: title || hostFromUrl(url) || titleFromUrl(url),
          url,
          favicon,
          asFavorite: true
        })
      }
    }),
    {
      name: 'browgent-bookmarks-v1',
      version: 1,
      partialize: (state) => ({
        version: state.version,
        items: state.items,
        folders: state.folders,
        spaces: state.spaces,
        activeSpaceId: state.activeSpaceId
      })
    }
  )
)
