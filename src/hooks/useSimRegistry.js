import { useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'sim-card-scanner:entries'

const normalizeNumber = (value) => {
  if (!value) return ''
  return value
    .toString()
    .replace(/[^0-9]/g, '')
}

export function useSimRegistry() {
  const [entries, setEntries] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed
        .filter(item => typeof item?.number === 'string')
        .map(item => ({
          id: item.id || crypto.randomUUID?.() || Date.now().toString(),
          number: normalizeNumber(item.number),
          source: item.source || 'unknown',
          timestamp: item.timestamp || new Date().toISOString(),
        }))
    } catch (error) {
      console.warn('[sim-card-scanner] Failed to parse stored entries', error)
      return []
    }
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  }, [entries])

  const addEntry = (number, meta = {}) => {
    const cleaned = normalizeNumber(number)
    if (!cleaned || cleaned.length < 10) {
      return { added: false, reason: 'invalid-length' }
    }

    const exists = entries.some(item => item.number === cleaned)
    if (exists) {
      return { added: false, reason: 'duplicate' }
    }

    const entry = {
      id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      number: cleaned,
      timestamp: new Date().toISOString(),
      source: meta.source || 'unknown',
      confidence: typeof meta.confidence === 'number' ? meta.confidence : null,
      attempts: meta.attempts || 1,
    }

    setEntries(prev => [...prev, entry])
    return { added: true, entry }
  }

  const removeEntry = (id) => {
    setEntries(prev => prev.filter(item => item.id !== id))
  }

  const clearEntries = () => {
    setEntries([])
  }

  const summary = useMemo(() => {
    const counts = entries.length
    const duplicates = counts - new Set(entries.map(item => item.number)).size
    return { counts, duplicates }
  }, [entries])

  return {
    entries,
    addEntry,
    removeEntry,
    clearEntries,
    summary,
  }
}


