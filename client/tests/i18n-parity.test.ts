import { describe, it, expect } from 'vitest'
import de from '@/i18n/de.json'
import en from '@/i18n/en.json'
import fr from '@/i18n/fr.json'

function flat(o: Record<string, unknown>, p = ''): Record<string, string> {
  const r: Record<string, string> = {}
  for (const [k, v] of Object.entries(o)) {
    const k2 = p ? `${p}.${k}` : k
    if (typeof v === 'object' && v !== null) Object.assign(r, flat(v as Record<string, unknown>, k2))
    else r[k2] = String(v)
  }
  return r
}

const DE = flat(de)
const EN = flat(en)
const FR = flat(fr)

describe('i18n parity', () => {
  it('DE, EN, FR have identical key sets (bidirectional)', () => {
    const missingEN = Object.keys(DE).filter((k) => !(k in EN))
    const missingFR = Object.keys(DE).filter((k) => !(k in FR))
    const extraEN = Object.keys(EN).filter((k) => !(k in DE))
    const extraFR = Object.keys(FR).filter((k) => !(k in DE))
    expect({
      'DE→EN missing': missingEN,
      'DE→FR missing': missingFR,
      'orphan in EN': extraEN,
      'orphan in FR': extraFR,
    }).toEqual({
      'DE→EN missing': [],
      'DE→FR missing': [],
      'orphan in EN': [],
      'orphan in FR': [],
    })
  })

  it('every locale has actual (non-empty) translations', () => {
    const emptyKeys = Object.keys(DE).filter((k) => !DE[k] || !EN[k] || !FR[k])
    expect(emptyKeys).toEqual([])
  })
})