import { contextBridge, ipcRenderer } from 'electron'

/**
 * Pet-only channel names (must match `IPC` in shared/types).
 * Do not import from `@shared` here: multi-entry preload builds extract
 * shared modules into `chunks/*.js`, and Electron's sandboxed preload
 * cannot require those files ("module not found" → window.browgent missing).
 */
const PET = {
  STATE: 'pet:state',
  DRAG_START: 'pet:dragStart',
  DRAG_BY: 'pet:dragBy',
  DRAG_END: 'pet:dragEnd',
  CLICK: 'pet:click',
  HIDE: 'pet:hide'
} as const

const api = {
  dragStart: (): Promise<void> => ipcRenderer.invoke(PET.DRAG_START),
  dragBy: (dx: number, dy: number): Promise<void> =>
    ipcRenderer.invoke(PET.DRAG_BY, dx, dy),
  dragEnd: (): Promise<void> => ipcRenderer.invoke(PET.DRAG_END),
  click: (): Promise<void> => ipcRenderer.invoke(PET.CLICK),
  hide: (): Promise<void> => ipcRenderer.invoke(PET.HIDE),
  onState: (
    cb: (state: {
      theme: string
      mood: string
      visible: boolean
      x?: number
      y?: number
      dragging?: boolean
    }) => void
  ): (() => void) => {
    const listener = (
      _: Electron.IpcRendererEvent,
      state: {
        theme: string
        mood: string
        visible: boolean
        x?: number
        y?: number
        dragging?: boolean
      }
    ): void => cb(state)
    ipcRenderer.on(PET.STATE, listener)
    return () => ipcRenderer.removeListener(PET.STATE, listener)
  }
}

contextBridge.exposeInMainWorld('browgentPet', api)

export type BrowgentPetAPI = typeof api
