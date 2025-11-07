const replacements = [
  [/O/g, '0'],
  [/o/g, '0'],
  [/I/g, '1'],
  [/l/g, '1'],
  [/[|]/g, '1'],
  [/S/g, '5'],
  [/s/g, '5'],
  [/Z/g, '2'],
  [/z/g, '2'],
  [/B/g, '8'],
  [/D/g, '0'],
  [/G/g, '6'],
  [/T/g, '7'],
  [/A/g, '4'],
  [/E/g, '3'],
]

export function extractSimNumber(rawText) {
  if (!rawText) return null

  let cleaned = rawText
    .replace(/\s+/g, '')
    .replace(/[—–-]/g, '')

  replacements.forEach(([pattern, replacement]) => {
    cleaned = cleaned.replace(pattern, replacement)
  })

  const digitSequences = cleaned.match(/\d{5,}/g) || []
  if (digitSequences.length === 0) {
    return null
  }

  const prioritize = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10]
  for (const length of prioritize) {
    const match = digitSequences.find(seq => seq.length === length)
    if (match) return match
  }

  const longest = digitSequences.reduce((acc, seq) => (seq.length > acc.length ? seq : acc), '')
  return longest || null
}

export function describeDetection(text, simNumber) {
  if (!text) return 'No text detected'
  if (simNumber) return `Detected ${simNumber.length} digits`
  const digits = text.match(/\d+/g)
  if (!digits?.length) return 'No digits detected'
  return `Digits found: ${digits.join(', ')}`
}


