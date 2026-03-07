/**
 * Interval-based data refresh hook.
 * Loads projects, plan, and machines via AstroClient.
 */
import { useEffect, useCallback } from 'react'
import type { AstroClient } from '../../client.js'
import type { Execution } from '../../client.js'
import { useProjectsStore } from '../stores/projects-store.js'
import { usePlanStore } from '../stores/plan-store.js'
import { useMachinesStore } from '../stores/machines-store.js'
import { useExecutionStore } from '../stores/execution-store.js'
import { useTuiStore } from '../stores/tui-store.js'

/** Derive a human-readable title from execution data */
function deriveTitle(
  nodeId: string,
  exec: Execution,
  projects: Array<{ id: string; name: string }>,
  planNodes: Array<{ id: string; title: string; projectId: string }>,
): string {
  const projectName = projects.find((p) => p.id === exec.projectId)?.name

  // Playground session: "Playground — ProjectName"
  if (nodeId.startsWith('playground-')) {
    // Extract first line of streamText as description if available
    const firstLine = exec.streamText?.split('\n').find((l) => l.trim().length > 0)?.trim()
    if (firstLine && firstLine.length > 5) {
      return `Playground: ${firstLine.slice(0, 50)}`
    }
    return `Playground${projectName ? ` — ${projectName}` : ''}`
  }

  // Plan generation: "Plan — ProjectName"
  if (nodeId.startsWith('plan-')) {
    return `Plan${projectName ? ` — ${projectName}` : ''}`
  }

  // Task execution: use plan node title
  const planNode = planNodes.find((n) => n.id === nodeId)
  if (planNode) {
    return planNode.title
  }

  // Fallback: project name or short ID
  return projectName ? `Task — ${projectName}` : nodeId.slice(0, 30)
}

export function usePolling(client: AstroClient, intervalMs = 10000) {
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

  const loadAllPlans = useCallback(async () => {
    try {
      const { nodes, edges } = await client.getFullPlan()
      usePlanStore.getState().setAllPlans(nodes, edges)
    } catch {
      // Full plan endpoint may not be available — fall back to per-project
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

  const loadExecutions = useCallback(async () => {
    try {
      const execMap = await client.getExecutions()
      const projects = useProjectsStore.getState().projects
      const planNodes = usePlanStore.getState().nodes

      const entries = Object.values(execMap).map((e: Execution) => {
        const nodeId = e.nodeClientId ?? e.nodeId ?? e.executionId
        return {
          executionId: e.executionId,
          nodeId,
          title: deriveTitle(nodeId, e, projects, planNodes),
          status: e.status,
          startedAt: e.startedAt,
        }
      })
      useExecutionStore.getState().seedHistorical(entries)
    } catch {
      // Executions endpoint may not be available — ignore
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
      loadExecutions(),
      loadUsage(),
      loadAllPlans(),
    ])
  }, [loadProjects, loadMachines, loadExecutions, loadUsage, loadAllPlans])

  // Initial load
  useEffect(() => {
    refreshAll()
  }, [refreshAll])

  // Switch plan view when selected project changes (instant from cache)
  useEffect(() => {
    if (selectedProjectId) {
      usePlanStore.getState().selectProject(selectedProjectId)
    } else {
      usePlanStore.getState().clear()
    }
  }, [selectedProjectId])

  // Periodic refresh
  useEffect(() => {
    const timer = setInterval(refreshAll, intervalMs)
    return () => clearInterval(timer)
  }, [refreshAll, intervalMs])

  return { refreshAll, loadProjects, loadPlan, loadAllPlans, loadMachines }
}
