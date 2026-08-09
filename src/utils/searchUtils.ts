import { MetaPreview } from '../api/addon-client';

// Common acronyms & alternative titles mapping
const POPULAR_ALIASES: Record<string, string[]> = {
  'aot': ['attack on titan', 'shingeki no kyojin'],
  'snk': ['attack on titan', 'shingeki no kyojin'],
  'ds': ['demon slayer', 'kimetsu no yaiba'],
  'kny': ['demon slayer', 'kimetsu no yaiba'],
  'jjk': ['jujutsu kaisen'],
  'mha': ['my hero academia', 'boku no hero academia'],
  'bnha': ['my hero academia', 'boku no hero academia'],
  'fma': ['fullmetal alchemist'],
  'fmab': ['fullmetal alchemist brotherhood'],
  'csm': ['chainsaw man'],
  'op': ['one piece'],
  'naruto': ['naruto shippuden', 'boruto'],
  'hxh': ['hunter x hunter'],
  'got': ['game of thrones', 'house of the dragon'],
  'hotd': ['house of the dragon'],
  'lotr': ['the lord of the rings', 'the rings of power'],
  'bb': ['breaking bad', 'better call saul'],
  'bcs': ['better call saul'],
  'tlou': ['the last of us'],
  'st': ['stranger things'],
  'sw': ['star wars', 'the mandalorian', 'andor'],
  'mcu': ['marvel', 'avengers', 'loki'],
}

/**
 * Levenshtein Distance for typo tolerance
 */
function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const matrix: number[][] = []

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        )
      }
    }
  }
  return matrix[b.length][a.length]
}

/**
 * Smart Title & Relevance Scorer
 */
export function calculateRelevanceScore(item: MetaPreview, rawQuery: string): number {
  if (!item || !item.name) return 0

  const normalize = (str: string) =>
    str
      .toLowerCase()
      .replace(/[:\-–—.,'"!@#$%^&*()_+=[\]{};/\\|<>?`~]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const cleanQuery = normalize(rawQuery)
  const cleanTitle = normalize(item.name)

  if (!cleanQuery || !cleanTitle) return 0

  // Check alias expansion (e.g. "aot" -> "attack on titan")
  const aliasExpansions = POPULAR_ALIASES[cleanQuery] || []
  for (const alias of aliasExpansions) {
    if (cleanTitle === alias || cleanTitle.startsWith(alias)) return 9500
    if (cleanTitle.includes(alias)) return 7000
  }

  // 1. Exact full title match (e.g. "Demon Slayer" === "Demon Slayer")
  if (cleanTitle === cleanQuery) {
    return 10000
  }

  // 2. Title starts with exact query phrase (e.g. "Demon Slayer: Kimetsu no Yaiba")
  if (cleanTitle.startsWith(cleanQuery)) {
    return 8000 + Math.max(0, 100 - cleanTitle.length)
  }

  // 3. Title contains exact query phrase
  if (cleanTitle.includes(cleanQuery)) {
    return 5500 + Math.max(0, 100 - cleanTitle.length)
  }

  // 4. Tokenized word matching
  const queryTokens = cleanQuery.split(' ').filter(t => t.length > 0)
  const titleTokens = cleanTitle.split(' ').filter(t => t.length > 0)

  let matchedTokens = 0
  let exactTokenMatches = 0
  let typoMatches = 0

  for (const qToken of queryTokens) {
    let matched = false
    for (const tToken of titleTokens) {
      if (tToken === qToken) {
        matched = true
        exactTokenMatches++
        break
      }
      if (qToken.length >= 3 && tToken.startsWith(qToken)) {
        matched = true
        break
      }
      if (tToken.length >= 4 && tToken.includes(qToken)) {
        matched = true
        break
      }
      // Typo tolerance: if word length >= 4 and edit distance <= 1 (or >= 7 and dist <= 2)
      if (qToken.length >= 4 && tToken.length >= 4) {
        const dist = levenshtein(qToken, tToken)
        if (dist <= 1 || (qToken.length >= 7 && dist <= 2)) {
          matched = true
          typoMatches++
          break
        }
      }
    }
    if (matched) matchedTokens++
  }

  // If all query tokens matched
  if (matchedTokens === queryTokens.length) {
    return 4000 + exactTokenMatches * 200 - typoMatches * 100
  }

  // For multi-word queries: majority match (>= 60%)
  if (queryTokens.length > 1) {
    const ratio = matchedTokens / queryTokens.length
    if (ratio >= 0.6) {
      return 2500 * ratio
    }

    // Check item aliases (e.g. Kitsu Japanese titles)
    const aliases = (item as any).aliases as string[] | undefined
    if (Array.isArray(aliases)) {
      for (const alias of aliases) {
        const cleanAlias = normalize(alias)
        if (cleanAlias.startsWith(cleanQuery)) return 7500
        if (cleanAlias.includes(cleanQuery)) return 5000
        const aliasTokens = cleanAlias.split(' ')
        const aMatched = queryTokens.filter(qT => aliasTokens.some(aT => aT === qT || aT.startsWith(qT))).length
        if (aMatched >= queryTokens.length * 0.6) return 3000
      }
    }

    return 0
  }

  // For single-word query: check startsWith, token overlap or typo
  if (queryTokens.length === 1) {
    const singleToken = queryTokens[0]
    if (titleTokens.some(t => t.startsWith(singleToken))) {
      return 3000
    }
    if (titleTokens.some(t => t.includes(singleToken) && singleToken.length >= 3)) {
      return 1800
    }
    // Typo match for single word
    if (singleToken.length >= 4) {
      for (const tToken of titleTokens) {
        if (levenshtein(singleToken, tToken) <= (singleToken.length > 6 ? 2 : 1)) {
          return 1500
        }
      }
    }
  }

  return 0
}