import { useMemo, useRef } from 'react'
import type { ChatNode } from '../../db'
import { resend, selectBranch } from '../../lib/chat'
import { forkKey, siblingsOf } from '../../lib/tree'
import type { NodeActions } from './MessageNode'
import { useCurrentModel } from './ModelPicker'

/**
 * Retry / edit / branch switching for MessageNode, for main and side nodes alike. The returned object
 * never changes (memoized nodes stay put); it reads the latest nodes and model through a ref.
 */
export function useNodeActions(nodes: ChatNode[] | undefined, beforeSend?: () => void): NodeActions {
  const { provider, model } = useCurrentModel()
  const latest = useRef({ nodes, provider, model, beforeSend })
  latest.current = { nodes, provider, model, beforeSend }
  return useMemo<NodeActions>(() => {
    const again = (node: ChatNode, text: string) => {
      const { provider, model, beforeSend } = latest.current
      if (!provider || !model) return
      beforeSend?.()
      void resend(node, text, provider, model)
    }
    return {
      retry: (node) => again(node, node.user.text),
      edit: again,
      switchBranch: (node, delta) => {
        const sibs = siblingsOf(latest.current.nodes ?? [], node)
        const target = sibs[sibs.findIndex((s) => s.id === node.id) + delta]
        if (target) void selectBranch(node.conversationId, forkKey(node), target.id)
      },
    }
  }, [])
}
