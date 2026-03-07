/**
 * Interval-based data refresh hook.
 * Loads projects, plan, and machines via AstroClient.
 */
import { useEffect, useCallback } from 'react'
import type { AstroClient } from '../../client.js'
import { useProjectsStore } from '../stores/projects-store.js'
import { usePlanStore } from '../stores/plan-store.js'
import { useMachinesStore } from '../stores/machines-store.js'
import { useTuiStore } from '../stores/tui-store.js'

export function usePolling(client: AstroClient, intervalMs = 30000) {
  const selectedProjectId = useTuiStore((s) => s.selectedProjectId)

  const loadProjects = useCallback(async () => {
    useProjectsStore.getState().setLoading(true)
    try {
      const projects = await client.listProjects()
      useProjectsStore.getState().setProjects(projects)
    } catch (err) {
      useProjectsStore.getState().setError(err instanceof Error ? err.message : String(err))
    }
  }, [client])

  const loadPlan = useCallback(async (projectId: string) => {
    usePlanStore.getState().setLoading(true)
    try {
      const { nodes, edges } = await client.getPlan(projectId)
      usePlanStore.getState().setPlan(projectId, nodes, edges)
    } catch (err) {
      usePlanStore.getState().setError(err instanceof Error ? err.message : String(err))
    }
  }, [client])

  const loadMachines = useCallback(async () => {
    useMachinesStore.getState().setLoading(true)
    try {
      const machines = await client.listMachines()
      useMachinesStore.getState().setMachines(machines)
      useTuiStore.getState().setMachineCount(machines.filter((m) => m.isConnected).length)
    } catch (err) {
      useMachinesStore.getState().setError(err instanceof Error ? err.message : String(err))
    }
  }, [client])

  const loadUsage = useCallback(async () => {
    try {
      const history = await client.getUsageHistory(1)
      const today = new Date().toISOString().slice(0, 10)
      const todayEntry = history.find((d) => d.date === today)
      useTuiStore.getState().setTodayCost(todayEntry?.totalCostUsd ?? 0)
    } catch {
      // Usage endpoint may not be available — ignore
    }
  }, [client])

  const refreshAll = useCallback(async () => {
    await Promise.allSettled([
      loadProjects(),
      loadMachines(),
      loadUsage(),
      ...(selectedProjectId ? [loadPlan(selectedProjectId)] : []),
    ])
  }, [loadProjects, loadMachines, loadUsage, loadPlan, selectedProjectId])

  // Initial load
  useEffect(() => {
    refreshAll()
  }, [refreshAll])

  // Load plan when selected project changes
  useEffect(() => {
    if (selectedProjectId) {
      loadPlan(selectedProjectId)
    } else {
      usePlanStore.getState().clear()
    }
  }, [selectedProjectId, loadPlan])

  // Periodic refresh
  useEffect(() => {
    const timer = setInterval(refreshAll, intervalMs)
    return () => clearInterval(timer)
  }, [refreshAll, intervalMs])

  return { refreshAll, loadProjects, loadPlan, loadMachines }
}
