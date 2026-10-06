import { useMemo, useRef } from 'react'
import { db, type ChatNode } from '../../db'
import { resend, selectBranch } from '../../lib/chat'
import type { ImageFile } from '../../lib/images'
import { forkKey } from '../../lib/tree'
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
    const again = (node: ChatNode, text: string, images: ImageFile[]) => {
      const { provider, model, beforeSend } = latest.current
      if (!provider || !model) return
      beforeSend?.()
      void resend(node, text, images, provider, model)
    }
    return {
      retry: async (node) => {
        const images = (await db.images.bulkGet(node.user.images ?? [])).filter((i) => !!i)
        again(node, node.user.text, images)
      },
      edit: again,
      select: (node, id) => void selectBranch(node.conversationId, forkKey(node), id),
    }
  }, [])
}
