/**
 * Search input handler — no visual rendering (rendered inline by CommandLine).
 * This component only provides the useInput hook for keyboard handling.
 */
import { useInput } from 'ink'
import { useSearchStore } from '../../stores/search-store.js'
import { useTuiStore } from '../../stores/tui-store.js'

export function SearchOverlay() {
  const isOpen = useSearchStore((s) => s.isOpen)
  const query = useSearchStore((s) => s.query)
  const results = useSearchStore((s) => s.results)
  const items = useSearchStore((s) => s.items)
  const selectedIndex = useSearchStore((s) => s.selectedIndex)
  const { setQuery, moveUp, moveDown, close } = useSearchStore()
  const { setSelectedProject, setSelectedNode, setSelectedMachine, focusPanel, openDetail } = useTuiStore()

  useInput((input, key) => {
    if (!isOpen) return

    if (key.escape) {
      close()
      return
    }

    if (key.upArrow) {
      moveUp()
      return
    }

    if (key.downArrow || key.tab) {
      moveDown()
      return
    }

    if (key.return) {
      const displayList = query.length > 0 ? results : items
      const item = displayList[selectedIndex]
      if (item) {
        switch (item.type) {
          case 'project':
            setSelectedProject(item.id)
            focusPanel('projects')
            break
          case 'task':
            setSelectedNode(item.id)
            focusPanel('plan')
            openDetail('node', item.id)
            break
          case 'machine':
            setSelectedMachine(item.id)
            focusPanel('machines')
            break
        }
      }
      close()
      return
    }

    if (key.backspace || key.delete) {
      setQuery(query.slice(0, -1))
      return
    }

    if (input && input.length === 1 && !key.ctrl && !key.meta) {
      setQuery(query + input)
    }
  }, { isActive: isOpen })

  return null
}
