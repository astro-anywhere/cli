/**
 * Session settings for playground/plan-gen: machine + working directory.
 * Initialized from local environment on first use.
 */
import { create } from 'zustand'

export interface SessionSettingsState {
  machineId: string | null
  machineName: string | null
  workingDirectory: string

  /** Which settings field is focused (null = none, input area is focused) */
  focusedField: 'machine' | 'workdir' | null
  /** Whether a picker is open */
  pickerOpen: boolean
}

export interface SessionSettingsActions {
  setMachine: (id: string, name: string) => void
  setWorkingDirectory: (dir: string) => void
  setFocusedField: (field: 'machine' | 'workdir' | null) => void
  setPickerOpen: (open: boolean) => void
  init: (machineId: string, machineName: string, workingDirectory: string) => void
}

export const useSessionSettingsStore = create<SessionSettingsState & SessionSettingsActions>((set) => ({
  machineId: null,
  machineName: null,
  workingDirectory: process.cwd(),
  focusedField: null,
  pickerOpen: false,

  setMachine: (id, name) => set({ machineId: id, machineName: name }),
  setWorkingDirectory: (workingDirectory) => set({ workingDirectory }),
  setFocusedField: (focusedField) => set({ focusedField, pickerOpen: false }),
  setPickerOpen: (pickerOpen) => set({ pickerOpen }),
  init: (machineId, machineName, workingDirectory) => set({ machineId, machineName, workingDirectory }),
}))
