import { describe, expect, it } from 'vitest'
import type { ChatNode } from './db/types'
import { cleanName, fallbackTitle, sideFallbackTitle } from './lib/naming'

describe('naming', () => {
  it('keeps only the name from the model output', () => {
    expect(cleanName('<think>hmm</think>\n\n“量子纠缠入门”。')).toBe('量子纠缠入门')
    expect(cleanName('The name is: "Rust lifetimes"\nextra')).toBe('Rust lifetimes')
    expect(cleanName('**标题：** 猫的习性')).toBe('猫的习性')
    expect(cleanName('  \n')).toBe('')
  })

  it('falls back to the first line, or "Image"', () => {
    expect(fallbackTitle('first line\nsecond', 0, 'en')).toBe('first line')
    expect(fallbackTitle('', 1, 'en')).toBe('Image')
    expect(fallbackTitle('x'.repeat(50), 0, 'en')).toBe('x'.repeat(40) + '…')
  })

  it('titles a side question by its own words, else the quote', () => {
    const root = { user: { text: '> quoted text\n> more\n\nwhy is that?' } } as ChatNode
    expect(sideFallbackTitle(root, 'quoted text')).toBe('why is that?')
    const onlyQuote = { user: { text: '> quoted\n' } } as ChatNode
    expect(sideFallbackTitle(onlyQuote, 'quoted  text')).toBe('quoted text')
    expect(sideFallbackTitle(undefined, 'draft text')).toBe('draft text')
  })
})
