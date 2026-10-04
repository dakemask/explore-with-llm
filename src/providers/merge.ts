/** Keys whose string values identify something rather than stream in pieces; later values replace earlier ones. */
const IDENTITY_KEYS = new Set([
  'id',
  'object',
  'model',
  'role',
  'type',
  'format',
  'finish_reason',
  'system_fingerprint',
  'service_tier',
])

export const isObj = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Folds one streaming piece into an accumulated object, vendor-agnostically: objects merge,
 * array items with the same `index` merge (tool calls, reasoning_details…), other array items are appended,
 * nulls never overwrite.
 *
 * Strings depend on where they are. Inside a delta (`concat: true`) text arrives in pieces and is
 * joined, except identity keys. Outside a delta (`concat: false`) every chunk repeats the same metadata
 * (`id`, `model`, OpenRouter's `provider`…), so the latest value wins.
 */
export function mergeDelta(target: Record<string, any>, delta: Record<string, any>, concat = true) {
  for (const [key, v] of Object.entries(delta)) {
    const cur = target[key]
    if (v == null) {
      if (!(key in target)) target[key] = v
    } else if (typeof v === 'string') {
      target[key] = concat && typeof cur === 'string' && !IDENTITY_KEYS.has(key) ? cur + v : v
    } else if (Array.isArray(v)) {
      if (!Array.isArray(cur)) {
        target[key] = structuredClone(v)
        continue
      }
      for (const item of v) {
        const same = isObj(item) && typeof item.index === 'number' && cur.find((c) => isObj(c) && c.index === item.index)
        if (same) mergeDelta(same, item, concat)
        else cur.push(structuredClone(item))
      }
    } else if (isObj(v)) {
      if (isObj(cur)) mergeDelta(cur, v, concat)
      else target[key] = structuredClone(v)
    } else {
      target[key] = v
    }
  }
  return target
}
