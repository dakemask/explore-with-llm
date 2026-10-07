import type { ChatNode } from '../../db'
import type { useT } from '../../i18n'
import { setLabel } from '../../lib/chat'
import { promptDialog } from '../ui/Dialog'

/** Asks for a main node's label (prefilled with the current one) and saves it; empty removes it, Cancel keeps it. */
export async function editLabel(node: Pick<ChatNode, 'id' | 'label'>, t: ReturnType<typeof useT>) {
  const label = await promptDialog(t('label.title'), node.label ?? '', { placeholder: t('label.placeholder') })
  if (label !== null) await setLabel(node.id, label)
}
