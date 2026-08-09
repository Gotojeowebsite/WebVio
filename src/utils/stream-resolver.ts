import { Stream } from '../api/addon-client'
import { checkCached, createTorrent, getTorrentList, requestDownloadLink } from '../api/torbox'

export interface ParsedStreamInfo {
  quality: '4K' | '1080p' | '720p' | '480p' | string | null
  source: 'WEB-DL' | 'WebRip' | 'BluRay' | 'HDTV' | 'CAM' | string | null
  codec: 'HEVC' | 'H.264' | 'AV1' | 'VP9' | string | null
  audio: 'Atmos' | 'DTS-HD' | 'TrueHD' | 'DD+ 5.1' | 'AAC 5.1' | 'AAC' | string | null
  size: string | null
  sizeBytes: number | null
  bitrate: string | null
  releaseGroup: string | null
  cleanTitle: string
  starRating: number
  health: 'healthy' | 'average' | 'poor'
  hdr: boolean
  seeders: number | null
  addonSource: string | null
}

export function parseStreamInfo(stream: Stream): ParsedStreamInfo {
  const name = stream.name || ''
  const title = stream.title || ''
  const filename = stream.behaviorHints?.filename || ''
  const text = `${name}\n${title}\n${filename}`

  // 1. Addon Source Extraction (e.g. [AddonName], ⚙️ AddonName, or stream.name first line)
  let addonSource: string | null = null
  const aioGearMatch = text.match(/⚙️\s*([a-zA-Z0-9_ .-]+)/)
  const aioBracketMatch = text.match(/\[([a-zA-Z0-9_ .-]+)\]/)
  if (aioGearMatch) {
    addonSource = aioGearMatch[1].trim()
  } else if (aioBracketMatch && !/^(4k|1080p|720p|480p|hevc|h\.?264|av1|web-?dl|bluray)$/i.test(aioBracketMatch[1])) {
    addonSource = aioBracketMatch[1].trim()
  } else {
    const firstLineName = name.split('\n')[0]?.replace(/^\[.*?\]\s*/, '').trim()
    if (firstLineName) addonSource = firstLineName
  }

  // 2. Quality Extraction (4K, 1080p, 720p, 480p)
  let quality: '4K' | '1080p' | '720p' | '480p' | string | null = null
  if (/2160p|4k|uhd|3840x2160/i.test(text)) {
    quality = '4K'
  } else if (/1080p|fhd|1920x1080|1080i/i.test(text)) {
    quality = '1080p'
  } else if (/720p|1280x720|\bhd\b(?!r)/i.test(text)) {
    quality = '720p'
  } else if (/480p|576p|sd|480i|360p|\bdvd\b/i.test(text)) {
    quality = '480p'
  }

  // 3. Source Release Type Extraction (WEB-DL, WebRip, BluRay, HDTV, CAM, etc.)
  let source: 'WEB-DL' | 'WebRip' | 'BluRay' | 'HDTV' | 'CAM' | string | null = null
  if (/remux|blu-?ray|bdrip|brrip|bd-?remux|uhd-?remux/i.test(text)) {
    source = 'BluRay'
  } else if (/web-?dl|webdl|amzn|nf|dsnp|atvp|hmax|\bmax\b|hulu|itunes/i.test(text)) {
    source = 'WEB-DL'
  } else if (/web-?rip|webrip/i.test(text)) {
    source = 'WebRip'
  } else if (/hdtv|pdtv|dsr|tvrip/i.test(text)) {
    source = 'HDTV'
  } else if (/cam|camrip|hdcam|hd-ts|\bts\b|telesync|telecine|\btc\b|scr|screener|dvdscr/i.test(text)) {
    source = 'CAM'
  } else if (/dvdrip|dvd-?r/i.test(text)) {
    source = 'DVDRip'
  }

  // 4. Codec Extraction (HEVC, H.264, AV1, VP9, etc.)
  let codec: 'HEVC' | 'H.264' | 'AV1' | 'VP9' | string | null = null
  if (/x\.?265|h\.?265|hevc/i.test(text)) {
    codec = 'HEVC'
  } else if (/x\.?264|h\.?264|avc/i.test(text)) {
    codec = 'H.264'
  } else if (/av0?1/i.test(text)) {
    codec = 'AV1'
  } else if (/vp9/i.test(text)) {
    codec = 'VP9'
  } else if (/xvid|divx/i.test(text)) {
    codec = 'XviD'
  }

  // 5. HDR / Dolby Vision
  const hdr = /dolby.?vision|\bdv\b|dovi|hdr10\+|hdr10|\bhdr\b/i.test(text)

  // 6. Audio Extraction
  let audio: 'Atmos' | 'DTS-HD' | 'TrueHD' | 'DD+ 5.1' | 'AAC 5.1' | 'AAC' | string | null = null
  if (/atmos/i.test(text)) {
    audio = 'Atmos'
  } else if (/dts[\s.-]?(?:hd[\s.-]?(?:ma)?|x|es)/i.test(text)) {
    audio = 'DTS-HD'
  } else if (/truehd/i.test(text)) {
    audio = 'TrueHD'
  } else if (/dts/i.test(text)) {
    audio = 'DTS'
  } else if (/dd[p+]?\s?(?:5\.1|7\.1)|eac3|ddp\s?(?:5\.1|7\.1)?|dolby\s?digital\s?plus/i.test(text)) {
    audio = 'DD+ 5.1'
  } else if (/ac3|dd\s?5\.1|dolby\s?digital/i.test(text)) {
    audio = 'DD 5.1'
  } else if (/aac\s?(?:5\.1|7\.1)/i.test(text)) {
    audio = 'AAC 5.1'
  } else if (/aac/i.test(text)) {
    audio = 'AAC'
  } else if (/flac/i.test(text)) {
    audio = 'FLAC'
  } else if (/mp3/i.test(text)) {
    audio = 'MP3'
  }

  // 7. File Size and Size in Bytes
  let size: string | null = null
  let sizeBytes: number | null = null
  const sizeMatch = text.match(/(?:💾|📁|size:?)?\s*(\d+(?:\.\d+)?)\s*(GB|MB|TB|GiB|MiB|TiB)/i)
  if (sizeMatch) {
    const val = parseFloat(sizeMatch[1])
    const unit = sizeMatch[2].toUpperCase().replace('I', '')
    size = `${val} ${unit}`
    if (unit === 'GB') sizeBytes = Math.round(val * 1024 * 1024 * 1024)
    else if (unit === 'MB') sizeBytes = Math.round(val * 1024 * 1024)
    else if (unit === 'TB') sizeBytes = Math.round(val * 1024 * 1024 * 1024 * 1024)
  }

  // 8. Bitrate (extracted or calculated from size and duration)
  let bitrate: string | null = null
  const directBitrateMbpsMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:mbps|mb\/s|mbit\/s)/i)
  const directBitrateKbpsMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:kbps|kb\/s|kbit\/s)/i)

  if (directBitrateMbpsMatch) {
    bitrate = `${parseFloat(directBitrateMbpsMatch[1]).toFixed(1)} Mbps`
  } else if (directBitrateKbpsMatch) {
    bitrate = `${(parseFloat(directBitrateKbpsMatch[1]) / 1000).toFixed(1)} Mbps`
  } else if (sizeBytes) {
    // Check if this looks like a TV episode (~45 min) or a Movie (~110 min)
    const isEpisode = /s\d+e\d+|episode|\bep\b/i.test(text)
    const durationSeconds = isEpisode ? 2700 : 6600
    const calcMbps = (sizeBytes * 8) / (durationSeconds * 1_000_000)
    if (calcMbps > 0) {
      bitrate = `${calcMbps.toFixed(1)} Mbps`
    }
  }

  // 9. Seeders
  let seeders: number | null = null
  const seedMatch = text.match(/[👤👥]\s*(\d+)/u) || text.match(/(\d+)\s*seeds?/i) || text.match(/(\d+)\s*peers?/i)
  if (seedMatch) {
    seeders = parseInt(seedMatch[1], 10)
  }

  // 10. Release Group Extraction
  let releaseGroup: string | null = null
  // Check pattern like [TB] Meteor · Dooky or [FLUX]
  const meteorMatch = text.match(/(\[[A-Za-z0-9_.-]+\]\s*[A-Za-z0-9_.-]+\s*·\s*[A-Za-z0-9_.-]+)/)
  if (meteorMatch) {
    releaseGroup = meteorMatch[1].trim()
  } else {
    // Check for standard release groups at end of title: -GROUP or [GROUP]
    const groupSuffixMatch = text.match(/-([A-Za-z0-9]+)(?:\.[a-zA-Z0-9]{2,4})?(?:\s|$|\n)/)
    const groupBracketMatch = text.match(/\[([A-Za-z0-9_.-]{2,15})\](?:\s|$|\n)/)
    if (groupSuffixMatch && !/^(mkv|mp4|avi|srt|sub|rar|zip|7z)$/i.test(groupSuffixMatch[1])) {
      releaseGroup = groupSuffixMatch[1].trim()
    } else if (groupBracketMatch && !/^(4k|1080p|720p|480p|hevc|h264|x264|x265|hdr)$/i.test(groupBracketMatch[1])) {
      releaseGroup = groupBracketMatch[1].trim()
    }
  }

  // 11. Clean Title Extraction
  let cleanTitle = filename || (title.includes('\n') ? title.split('\n')[0] : title) || name.split('\n')[0] || 'Unknown Stream'
  // Remove common addon brackets e.g. [Addon] or ⚙️ Addon
  cleanTitle = cleanTitle.replace(/^\[.*?\]\s*/, '').replace(/^⚙️.*?\n/, '').trim()
  // Remove file extension
  cleanTitle = cleanTitle.replace(/\.(mkv|mp4|avi|webm|mov|flv|ts)$/i, '')
  // Replace noisy dots/underscores between words if it looks like a scene release title
  if (/^[A-Za-z0-9]+[._][A-Za-z0-9]+/.test(cleanTitle) && !cleanTitle.includes(' ')) {
    cleanTitle = cleanTitle.replace(/[._]/g, ' ')
  }

  // 12. Stream Health Calculation
  let health: 'healthy' | 'average' | 'poor' = 'healthy'
  if (stream.url) {
    health = 'healthy'
  } else if ((stream as { isCached?: boolean }).isCached === true) {
    health = 'healthy'
  } else if (seeders !== null) {
    if (seeders >= 30) health = 'healthy'
    else if (seeders >= 8) health = 'average'
    else health = 'poor'
  } else {
    health = stream.infoHash ? 'average' : 'healthy'
  }

  // 13. Star Rating Calculation (1.0 to 5.0)
  let score = 2.5
  if (quality === '4K') score += 1.4
  else if (quality === '1080p') score += 1.0
  else if (quality === '720p') score += 0.5
  else if (quality === '480p') score += 0.1

  if (source === 'BluRay') score += 0.5
  else if (source === 'WEB-DL') score += 0.4
  else if (source === 'WebRip') score += 0.2
  else if (source === 'CAM') score -= 1.5

  if (codec === 'HEVC' || codec === 'AV1') score += 0.3
  if (hdr) score += 0.3
  if (audio === 'Atmos' || audio === 'TrueHD' || audio === 'DTS-HD') score += 0.3
  else if (audio === 'DD+ 5.1') score += 0.2

  if (health === 'healthy') score += 0.5
  else if (health === 'poor') score -= 0.8

  const starRating = Math.max(1.0, Math.min(5.0, Math.round(score * 10) / 10))

  return {
    quality,
    source,
    codec,
    audio,
    size,
    sizeBytes,
    bitrate,
    releaseGroup,
    cleanTitle,
    starRating,
    health,
    hdr,
    seeders,
    addonSource,
  }
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
