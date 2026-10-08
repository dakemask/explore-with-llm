import { useMemo, useRef } from 'react'
import { db, type ChatNode } from '../../db'
import { resend, selectBranch } from '../../lib/chat'
import type { Hold } from '../../lib/hooks'
import type { ImageFile } from '../../lib/images'
import { forkKey } from '../../lib/tree'
import type { NodeActions } from './MessageNode'
import { useCurrentModel } from './ModelPicker'

/** The node shown at `node`'s fork, as rendered (`MessageNode` carries `data-fork`). */
export const atFork = (node: ChatNode, inner = '') => `[data-fork="${CSS.escape(forkKey(node))}"]${inner && ' ' + inner}`

/**
 * Retry / edit / branch switching for MessageNode, for main and side nodes alike. The returned object
 * never changes (memoized nodes stay put); it reads the latest nodes and model through a ref.
 * `hold` (the scroll area's) keeps things in place: a new attempt's top where the old node's was (its reply
 * is then followed until that top reaches the top of the screen), the switcher where it was clicked.
 */
export function useNodeActions(nodes: ChatNode[] | undefined, hold: Hold): NodeActions {
  const { provider, model } = useCurrentModel()
  const latest = useRef({ nodes, provider, model, hold })
  latest.current = { nodes, provider, model, hold }
  return useMemo<NodeActions>(() => {
    const again = (node: ChatNode, text: string, images: ImageFile[], system?: string) => {
      const { provider, model, hold } = latest.current
      if (!provider || !model) return
      hold(atFork(node), { follow: true })
      void resend(node, text, images, provider, model, system ?? node.system)
    }
    return {
      retry: async (node) => {
        const images = (await db.images.bulkGet(node.user.images ?? [])).filter((i) => !!i)
        again(node, node.user.text, images)
      },
      edit: again,
      select: (node, id) => {
        latest.current.hold(atFork(node, '[data-switcher]'))
        void selectBranch(node.conversationId, forkKey(node), id)
      },
    }
  }, [])
}
