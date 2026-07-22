/** Arc-style bookmarks model: favorites (pinned tiles) + folders + items */

export type BookmarkId = string

export interface BookmarkItem {
  id: BookmarkId
  title: string
  url: string
  favicon?: string
  createdAt: number
}

export interface BookmarkFolder {
  id: BookmarkId
  title: string
  /** Item ids in display order */
  itemIds: BookmarkId[]
  collapsed?: boolean
  createdAt: number
}

export interface BookmarkSpace {
  id: string
  name: string
  /** Pinned favorites shown as the Arc-style icon grid */
  favoriteIds: BookmarkId[]
  /** Folders in this space */
  folderIds: BookmarkId[]
  /** Loose (unfiled) bookmark ids, shown under the space list */
  itemIds: BookmarkId[]
}

export interface BookmarksState {
  version: 1
  items: Record<BookmarkId, BookmarkItem>
  folders: Record<BookmarkId, BookmarkFolder>
  spaces: BookmarkSpace[]
  activeSpaceId: string
}

export function faviconForUrl(url: string, size = 64): string {
  try {
    const normalized =
      url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`
    const host = new URL(normalized).hostname
    if (!host || host === 'localhost') return ''
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`
  } catch {
    return ''
  }
}

export function hostFromUrl(url: string): string {
  try {
    const normalized =
      url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`
    return new URL(normalized).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function titleFromUrl(url: string): string {
  const host = hostFromUrl(url)
  if (!host) return 'Bookmark'
  const base = host.split('.')[0] ?? host
  return base.charAt(0).toUpperCase() + base.slice(1)
}

function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`
}

export function createBookmarkId(): BookmarkId {
  return id('bm')
}

export function createFolderId(): BookmarkId {
  return id('fd')
}

/** Seed data that mirrors the Arc favorites + folders aesthetic */
export function createDefaultBookmarks(): BookmarksState {
  const now = Date.now()

  const github: BookmarkItem = {
    id: 'bm_github',
    title: 'GitHub',
    url: 'https://github.com',
    favicon: faviconForUrl('https://github.com'),
    createdAt: now
  }
  const gmail: BookmarkItem = {
    id: 'bm_gmail',
    title: 'Gmail',
    url: 'https://mail.google.com',
    favicon: faviconForUrl('https://mail.google.com'),
    createdAt: now
  }
  const linear: BookmarkItem = {
    id: 'bm_linear',
    title: 'Linear',
    url: 'https://linear.app',
    favicon: faviconForUrl('https://linear.app'),
    createdAt: now
  }
  const notion: BookmarkItem = {
    id: 'bm_notion',
    title: 'Notion',
    url: 'https://www.notion.so',
    favicon: faviconForUrl('https://www.notion.so'),
    createdAt: now
  }
  const cursor: BookmarkItem = {
    id: 'bm_cursor',
    title: 'Cursor',
    url: 'https://cursor.com',
    favicon: faviconForUrl('https://cursor.com'),
    createdAt: now
  }
  const apple: BookmarkItem = {
    id: 'bm_apple',
    title: 'Apple',
    url: 'https://www.apple.com',
    favicon: faviconForUrl('https://www.apple.com'),
    createdAt: now
  }
  const prs: BookmarkItem = {
    id: 'bm_prs',
    title: 'Pull requests',
    url: 'https://github.com/pulls',
    favicon: faviconForUrl('https://github.com'),
    createdAt: now
  }
  const docs: BookmarkItem = {
    id: 'bm_docs',
    title: 'MDN Web Docs',
    url: 'https://developer.mozilla.org',
    favicon: faviconForUrl('https://developer.mozilla.org'),
    createdAt: now
  }
  const google: BookmarkItem = {
    id: 'bm_google',
    title: 'Google',
    url: 'https://www.google.com',
    favicon: faviconForUrl('https://www.google.com'),
    createdAt: now
  }

  const bookmarksBar: BookmarkFolder = {
    id: 'fd_bar',
    title: 'Bookmarks Bar',
    itemIds: [docs.id, google.id],
    collapsed: false,
    createdAt: now
  }
  const pullRequests: BookmarkFolder = {
    id: 'fd_prs',
    title: 'Pull Requests',
    itemIds: [prs.id],
    collapsed: false,
    createdAt: now
  }

  const space: BookmarkSpace = {
    id: 'sp_default',
    name: 'Space 1',
    favoriteIds: [github.id, gmail.id, linear.id, notion.id, cursor.id, apple.id],
    folderIds: [bookmarksBar.id, pullRequests.id],
    itemIds: []
  }

  return {
    version: 1,
    items: {
      [github.id]: github,
      [gmail.id]: gmail,
      [linear.id]: linear,
      [notion.id]: notion,
      [cursor.id]: cursor,
      [apple.id]: apple,
      [prs.id]: prs,
      [docs.id]: docs,
      [google.id]: google
    },
    folders: {
      [bookmarksBar.id]: bookmarksBar,
      [pullRequests.id]: pullRequests
    },
    spaces: [space],
    activeSpaceId: space.id
  }
}
