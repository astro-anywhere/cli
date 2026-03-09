/**
 * Plan nodes/edges store with per-project caching.
 * All plans are loaded once via getFullPlan() and cached in-memory.
 * Switching projects is instant — no network request needed.
 */
import { create } from 'zustand'
import type { PlanNode, PlanEdge } from '../../client.js'
import { buildTree, renderTreeLines, type TreeLine, type TreeNode } from '../lib/tree-builder.js'

const nodeStatusGen = new Map<string, number>()

export interface PlanState {
  /** Currently displayed project */
  projectId: string | null
  nodes: PlanNode[]
  edges: PlanEdge[]
  treeRoots: TreeNode[]
  treeLines: TreeLine[]
  collapsedNodes: Set<string>
  loading: boolean
  error: string | null
  /** Cache: projectId → { nodes, edges } */
  cache: Map<string, { nodes: PlanNode[]; edges: PlanEdge[] }>
}

export interface PlanActions {
  setPlan: (projectId: string, nodes: PlanNode[], edges: PlanEdge[]) => void
  /** Bulk-load all plans into cache (from getFullPlan) */
  setAllPlans: (nodes: PlanNode[], edges: PlanEdge[]) => void
  /** Switch to a cached project plan (instant, no fetch) */
  selectProject: (projectId: string) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  toggleCollapse: (nodeId: string) => void
  updateNodeStatus: (nodeId: string, status: string) => void
  mergeNode: (node: PlanNode) => void
  bumpNodeStatusGen: (nodeId: string) => number
  getNodeStatusGen: (nodeId: string) => number
  clear: () => void
}

function buildView(nodes: PlanNode[], edges: PlanEdge[], collapsedNodes: Set<string>) {
  const treeRoots = buildTree(nodes, edges)
  const treeLines = renderTreeLines(treeRoots, collapsedNodes)
  return { treeRoots, treeLines }
}

export const usePlanStore = create<PlanState & PlanActions>((set, get) => ({
  projectId: null,
  nodes: [],
  edges: [],
  treeRoots: [],
  treeLines: [],
  collapsedNodes: new Set(),
  loading: false,
  error: null,
  cache: new Map(),

  setPlan: (projectId, nodes, edges) => {
    const { collapsedNodes, cache } = get()
    // Update cache
    const next = new Map(cache)
    next.set(projectId, { nodes, edges })
    const { treeRoots, treeLines } = buildView(nodes, edges, collapsedNodes)
    set({ projectId, nodes, edges, treeRoots, treeLines, loading: false, error: null, cache: next })
  },

  setAllPlans: (allNodes, allEdges) => {
    const { projectId, collapsedNodes } = get()
    // Group by projectId
    const next = new Map<string, { nodes: PlanNode[]; edges: PlanEdge[] }>()
    const nodesByProject = new Map<string, PlanNode[]>()
    for (const node of allNodes) {
      const list = nodesByProject.get(node.projectId) ?? []
      list.push(node)
      nodesByProject.set(node.projectId, list)
    }
    // Build edge lookup: edges reference node clientIds, group by source node's project
    const nodeProjectMap = new Map<string, string>()
    for (const node of allNodes) {
      nodeProjectMap.set(node.id, node.projectId)
    }
    const edgesByProject = new Map<string, PlanEdge[]>()
    for (const edge of allEdges) {
      const pid = nodeProjectMap.get(edge.source) ?? nodeProjectMap.get(edge.target)
      if (pid) {
        const list = edgesByProject.get(pid) ?? []
        list.push(edge)
        edgesByProject.set(pid, list)
      }
    }
    for (const [pid, nodes] of nodesByProject) {
      next.set(pid, { nodes, edges: edgesByProject.get(pid) ?? [] })
    }

    // If current project is in cache, update the displayed view
    const update: Partial<PlanState> = { cache: next, loading: false, error: null }
    if (projectId && next.has(projectId)) {
      const cached = next.get(projectId)!
      const { treeRoots, treeLines } = buildView(cached.nodes, cached.edges, collapsedNodes)
      Object.assign(update, { nodes: cached.nodes, edges: cached.edges, treeRoots, treeLines })
    }
    set(update)
  },

  selectProject: (projectId) => {
    const { cache, collapsedNodes, projectId: currentProjectId } = get()
    if (projectId === currentProjectId) return
    const cached = cache.get(projectId)
    if (cached) {
      const { treeRoots, treeLines } = buildView(cached.nodes, cached.edges, collapsedNodes)
      set({ projectId, nodes: cached.nodes, edges: cached.edges, treeRoots, treeLines, loading: false, error: null })
    } else {
      // Not in cache = project has no plan nodes yet
      set({ projectId, nodes: [], edges: [], treeRoots: [], treeLines: [], loading: false, error: null })
    }
  },

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),

  toggleCollapse: (nodeId) => {
    const { collapsedNodes, treeRoots } = get()
    const next = new Set(collapsedNodes)
    if (next.has(nodeId)) {
      next.delete(nodeId)
    } else {
      next.add(nodeId)
    }
    const treeLines = renderTreeLines(treeRoots, next)
    set({ collapsedNodes: next, treeLines })
  },

  updateNodeStatus: (nodeId, status) => {
    const { nodes, edges, collapsedNodes, projectId, cache } = get()
    const updated = nodes.map((n) => (n.id === nodeId ? { ...n, status } : n))
    const { treeRoots, treeLines } = buildView(updated, edges, collapsedNodes)
    // Also update cache
    if (projectId) {
      const next = new Map(cache)
      next.set(projectId, { nodes: updated, edges })
      set({ nodes: updated, treeRoots, treeLines, cache: next })
    } else {
      set({ nodes: updated, treeRoots, treeLines })
    }
  },

  mergeNode: (node) => {
    const { nodes, edges, collapsedNodes, projectId, cache } = get()
    const idx = nodes.findIndex((n) => n.id === node.id)
    const updated = idx >= 0
      ? nodes.map((n) => (n.id === node.id ? node : n))
      : [...nodes, node]
    const { treeRoots, treeLines } = buildView(updated, edges, collapsedNodes)
    if (projectId) {
      const next = new Map(cache)
      next.set(projectId, { nodes: updated, edges })
      set({ nodes: updated, treeRoots, treeLines, cache: next })
    } else {
      set({ nodes: updated, treeRoots, treeLines })
    }
  },

  bumpNodeStatusGen: (nodeId) => {
    const gen = (nodeStatusGen.get(nodeId) ?? 0) + 1
    nodeStatusGen.set(nodeId, gen)
    return gen
  },

  getNodeStatusGen: (nodeId) => {
    return nodeStatusGen.get(nodeId) ?? 0
  },

  clear: () => set({
    projectId: null,
    nodes: [],
    edges: [],
    treeRoots: [],
    treeLines: [],
    loading: false,
    error: null,
  }),
}))
