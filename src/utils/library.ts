import { MetaPreview } from '../api/addon-client'

export type LibraryStatus = 'watching' | 'plantowatch' | 'completed' | 'hold' | 'dropped'

export interface LibraryItem extends MetaPreview {
  status: LibraryStatus
  addedAt: number
  updatedAt: number
  progressPercent?: number
  video?: { id?: string; season?: number; episode?: number; title?: string } | null
}

const STORAGE_KEY = 'webvio_library_items'

export function getLocalLibrary(): LibraryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export function saveLocalLibrary(items: LibraryItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch (err) {
    console.error('Failed to save local library:', err)
  }
}

export function isInLibrary(id: string): boolean {
  const items = getLocalLibrary()
  return items.some((item) => item.id === id)
}

export function getLibraryItem(id: string): LibraryItem | undefined {
  const items = getLocalLibrary()
  return items.find((item) => item.id === id)
}

export function toggleLibraryItem(
  meta: MetaPreview,
  status: LibraryStatus = 'plantowatch'
): { inLibrary: boolean; item?: LibraryItem } {
  const items = getLocalLibrary()
  const index = items.findIndex((i) => i.id === meta.id)

  if (index >= 0) {
    // Remove if already present
    items.splice(index, 1)
    saveLocalLibrary(items)
    return { inLibrary: false }
  } else {
    // Add to library
    const newItem: LibraryItem = {
      ...meta,
      status,
      addedAt: Date.now(),
      updatedAt: Date.now(),
    }
    items.unshift(newItem)
    saveLocalLibrary(items)
    return { inLibrary: true, item: newItem }
  }
}

export function updateLibraryItemStatus(id: string, status: LibraryStatus): void {
  const items = getLocalLibrary()
  const item = items.find((i) => i.id === id)
  if (item) {
    item.status = status
    item.updatedAt = Date.now()
    saveLocalLibrary(items)
  }
}

export function removeFromLibrary(id: string): void {
  const items = getLocalLibrary().filter((i) => i.id !== id)
  saveLocalLibrary(items)
}
