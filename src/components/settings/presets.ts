import { nanoid } from 'nanoid'
import type { Protocol, Provider } from '../../db'

interface Preset {
  id: string
  name: string
  protocol: Protocol
  baseUrl: string
  models: string[]
}

export const PRESETS: Preset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    protocol: 'openai-chat',
    baseUrl: 'https://api.deepseek.com',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  { id: 'openai', name: 'OpenAI', protocol: 'openai-chat', baseUrl: 'https://api.openai.com/v1', models: [] },
  { id: 'custom', name: '', protocol: 'openai-chat', baseUrl: '', models: [] },
]

export function createProvider(presetId: string): Provider {
  const p = PRESETS.find((x) => x.id === presetId) ?? PRESETS[PRESETS.length - 1]
  return {
    id: nanoid(),
    name: p.name,
    protocol: p.protocol,
    baseUrl: p.baseUrl,
    apiKey: '',
    models: [...p.models],
    createdAt: Date.now(),
  }
}
