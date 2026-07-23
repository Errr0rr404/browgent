import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/types'

const api = {
  dragStart: (): Promise<void> => ipcRenderer.invoke(IPC.PET_DRAG_START),
  dragBy: (dx: number, dy: number): Promise<void> =>
    ipcRenderer.invoke(IPC.PET_DRAG_BY, dx, dy),
  dragEnd: (): Promise<void> => ipcRenderer.invoke(IPC.PET_DRAG_END),
  click: (): Promise<void> => ipcRenderer.invoke(IPC.PET_CLICK),
  hide: (): Promise<void> => ipcRenderer.invoke(IPC.PET_HIDE),
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
    ipcRenderer.on(IPC.PET_STATE, listener)
    return () => ipcRenderer.removeListener(IPC.PET_STATE, listener)
  }
}

contextBridge.exposeInMainWorld('browgentPet', api)

export type BrowgentPetAPI = typeof api
