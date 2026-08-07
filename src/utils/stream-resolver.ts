import { Stream } from '../api/addon-client'
import { checkCached, createTorrent, getTorrentList, requestDownloadLink } from '../api/torbox'

export interface ParsedStreamInfo {
  quality: string | null
  codec: string | null
  size: string | null
  seeders: number | null
  source: string | null
  hdr: boolean
  audio: string | null
}

export function parseStreamInfo(stream: Stream): ParsedStreamInfo {
  const text = `${stream.name || ''} ${stream.title || ''} ${stream.behaviorHints?.filename || ''}`

  // Quality
  let quality: string | null = null
  if (/2160p|4k|uhd/i.test(text)) quality = '4K'
  else if (/1080p|fhd/i.test(text)) quality = '1080p'
  else if (/720p|hd(?!r)/i.test(text)) quality = '720p'
  else if (/480p|sd/i.test(text)) quality = '480p'

  // Codec
  let codec: string | null = null
  if (/x\.?265|h\.?265|hevc/i.test(text)) codec = 'HEVC'
  else if (/x\.?264|h\.?264|avc/i.test(text)) codec = 'H.264'
  else if (/av1/i.test(text)) codec = 'AV1'

  // Size
  let size: string | null = null
  const sizeMatch = text.match(/(\d+\.?\d*)\s*(GB|MB|TB)/i)
  if (sizeMatch) size = `${sizeMatch[1]} ${sizeMatch[2].toUpperCase()}`

  // Seeders
  let seeders: number | null = null
  const seedMatch = text.match(/👤\s*(\d+)/i) || text.match(/(\d+)\s*seed/i)
  if (seedMatch) seeders = parseInt(seedMatch[1])

  // HDR
  const hdr = /hdr|dolby.?vision|dv/i.test(text)

  // Audio
  let audio: string | null = null
  if (/atmos/i.test(text)) audio = 'Atmos'
  else if (/dts[\s.-]?hd/i.test(text)) audio = 'DTS-HD'
  else if (/truehd/i.test(text)) audio = 'TrueHD'
  else if (/dd[p+]?\s?5\.1|eac3|ddp/i.test(text)) audio = 'DD+ 5.1'
  else if (/aac/i.test(text)) audio = 'AAC'

  // Source addon
  let source: string | null = null
  const sourceMatch = (stream.name || '').split('\n')[0]
  if (sourceMatch) source = sourceMatch

  return { quality, codec, size, seeders, hdr, audio, source }
}

export async function resolveStreamUrl(
  stream: Stream,
  torboxApiKey?: string
): Promise<string | null> {
  // Direct URL streams — free, no debrid needed
  if (stream.url) {
    return stream.url
  }

  // Torrent streams — need TorBox
  if (stream.infoHash) {
    if (!torboxApiKey) return null

    const magnet = `magnet:?xt=urn:btih:${stream.infoHash}`

    try {
      // 1. Create torrent on TorBox
      const result = await createTorrent(torboxApiKey, magnet)
      const torrentId = result.torrent_id

      // 2. Get torrent files
      const torrents = await getTorrentList(torboxApiKey, torrentId)
      const torrent = torrents[0]

      if (!torrent?.files?.length) {
        throw new Error('No files found in torrent')
      }

      // 3. Find the correct file
      let targetFile = torrent.files[0]
      if (stream.fileIdx !== undefined && stream.fileIdx !== null) {
        targetFile = torrent.files[stream.fileIdx] || targetFile
      } else {
        // Pick largest video file
        const videoExtensions = ['.mkv', '.mp4', '.avi', '.mov', '.webm']
        const videoFiles = torrent.files.filter(f =>
          videoExtensions.some(ext => f.name.toLowerCase().endsWith(ext))
        )
        if (videoFiles.length > 0) {
          targetFile = videoFiles.reduce((a, b) => a.size > b.size ? a : b)
        }
      }

      // 4. Get download link
      const downloadUrl = await requestDownloadLink(torboxApiKey, torrentId, targetFile.id)
      return downloadUrl
    } catch (err) {
      console.error('Failed to resolve TorBox stream:', err)
      return null
    }
  }

  return null
}

export async function batchCheckCached(
  hashes: string[],
  torboxApiKey: string
): Promise<Record<string, boolean>> {
  if (!torboxApiKey || hashes.length === 0) return {}

  try {
    const result = await checkCached(torboxApiKey, hashes)
    const cached: Record<string, boolean> = {}
    for (const hash of hashes) {
      cached[hash.toLowerCase()] = !!(result[hash.toLowerCase()] && 
        Object.keys(result[hash.toLowerCase()]).length > 0)
    }
    return cached
  } catch {
    return {}
  }
}
