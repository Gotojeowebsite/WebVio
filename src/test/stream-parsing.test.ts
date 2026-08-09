import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseStreamInfo, resolveStreamUrl, batchCheckCached } from '../utils/stream-resolver'
import { Stream } from '../api/addon-client'
import * as torboxApi from '../api/torbox'

describe('Stream row parsing (parseStreamInfo)', () => {
  it('parses quality, source, codec, hdr, audio, size, bitrate, release group, rating, health', () => {
    const stream: Stream = {
      name: 'Torrentio\n4K HDR',
      title: 'Dune.Part.Two.2024.2160p.UHD.BluRay.x265.TrueHD.Atmos.7.1-EXTREME\n💾 24.5 GB 👤 320',
      infoHash: 'abc1234567890abcdef1234567890abcdef1234',
    }

    const info = parseStreamInfo(stream)
    expect(info.quality).toBe('4K')
    expect(info.source).toBe('BluRay')
    expect(info.hdr).toBe(true)
    expect(info.codec).toBe('HEVC')
    expect(info.audio).toBe('Atmos')
    expect(info.size).toBe('24.5 GB')
    expect(info.sizeBytes).toBeGreaterThan(20 * 1024 * 1024 * 1024)
    expect(info.bitrate).toBeDefined()
    expect(info.releaseGroup).toBe('EXTREME')
    expect(info.seeders).toBe(320)
    expect(info.health).toBe('healthy')
    expect(info.starRating).toBeGreaterThanOrEqual(4.5)
  })

  it('correctly handles 1080p direct stream with WebRip and AAC', () => {
    const stream: Stream = {
      name: 'Direct Stream',
      title: 'Movie.2024.1080p.WEBRip.x264.AAC\n💾 2.1 GB',
      url: 'https://cdn.example.com/movie.mp4',
    }

    const info = parseStreamInfo(stream)
    expect(info.quality).toBe('1080p')
    expect(info.source).toBe('WebRip')
    expect(info.codec).toBe('H.264')
    expect(info.audio).toBe('AAC')
    expect(info.size).toBe('2.1 GB')
    expect(info.seeders).toBeNull()
    expect(info.health).toBe('healthy')
    expect(info.starRating).toBeGreaterThanOrEqual(3.5)
  })

  it('extracts release group with meteor formatting and bitrate from text', () => {
    const stream: Stream = {
      name: '[TB] Meteor · Dooky',
      title: 'Show.S01E03.1080p.WEB-DL.DDP5.1.Atmos.H.264-FLUX\n💾 2.51 GB · 13.9 Mbps 👤 45',
      infoHash: 'def1234567890abcdef1234567890abcdef1234',
    }

    const info = parseStreamInfo(stream)
    expect(info.quality).toBe('1080p')
    expect(info.source).toBe('WEB-DL')
    expect(info.codec).toBe('H.264')
    expect(info.audio).toBe('Atmos')
    expect(info.size).toBe('2.51 GB')
    expect(info.bitrate).toBe('13.9 Mbps')
    expect(info.releaseGroup).toBe('[TB] Meteor · Dooky')
    expect(info.seeders).toBe(45)
    expect(info.health).toBe('healthy')
  })

  it('detects Dolby Vision, AV1, and DTS-HD audio', () => {
    const stream: Stream = {
      name: 'MediaFusion',
      title: 'Blade.Runner.2049.2160p.Dolby.Vision.AV01.DTS-HD.MA.7.1-FraMeSToR.mkv\n💾 38.2 GB 👥 85',
      infoHash: '1234567890abcdef1234567890abcdef12345678',
    }

    const info = parseStreamInfo(stream)
    expect(info.quality).toBe('4K')
    expect(info.hdr).toBe(true)
    expect(info.codec).toBe('AV1')
    expect(info.audio).toBe('DTS-HD')
    expect(info.releaseGroup).toBe('FraMeSToR')
    expect(info.seeders).toBe(85)
    expect(info.health).toBe('healthy')
    expect(info.starRating).toBe(5.0)
  })

  it('penalizes CAM quality releases with lower star rating', () => {
    const stream: Stream = {
      name: 'CAM Release',
      title: 'New.Release.2024.HDCAM.x264.MP3\n💾 800 MB 👤 5',
      infoHash: 'deadbeef1234567890abcdef1234567890abcdef',
    }

    const info = parseStreamInfo(stream)
    expect(info.source).toBe('CAM')
    expect(info.health).toBe('poor')
    expect(info.starRating).toBeLessThanOrEqual(2.5)
  })

  it('formats clean title by cleaning file extension and scene separators', () => {
    const stream: Stream = {
      name: 'Torrentio',
      title: 'The.Matrix.1999.1080p.BluRay.x264-SPARKS.mkv\n💾 8.5 GB',
      infoHash: 'matrixhash1234567890abcdef1234567890abcd',
    }

    const info = parseStreamInfo(stream)
    expect(info.cleanTitle).toBe('The Matrix 1999 1080p BluRay x264-SPARKS')
    expect(info.releaseGroup).toBe('SPARKS')
  })
})

describe('Stream resolution (resolveStreamUrl & batchCheckCached)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('resolves direct stream URL immediately without TorBox', async () => {
    const directStream: Stream = {
      name: 'Direct Stream',
      title: 'Direct Video',
      url: 'https://example.com/stream.mp4',
    }

    const resolved = await resolveStreamUrl(directStream)
    expect(resolved).toBe('https://example.com/stream.mp4')
  })

  it('returns null for torrent stream when no TorBox key is provided', async () => {
    const torrentStream: Stream = {
      name: 'Torrent',
      title: 'Torrent Video',
      infoHash: 'abc1234567890abcdef1234567890abcdef1234',
    }

    const resolved = await resolveStreamUrl(torrentStream)
    expect(resolved).toBeNull()
  })

  it('resolves torrent stream via TorBox API client', async () => {
    const torrentStream: Stream = {
      name: 'Torrent',
      title: 'Torrent Video',
      infoHash: 'abc1234567890abcdef1234567890abcdef1234',
    }

    vi.spyOn(torboxApi, 'createTorrent').mockResolvedValueOnce({
      torrent_id: 12345,
      hash: 'abc1234567890abcdef1234567890abcdef1234',
    })

    vi.spyOn(torboxApi, 'getTorrentList').mockResolvedValueOnce([
      {
        id: 12345,
        name: 'Movie.2024.mkv',
        size: 1024 * 1024 * 1024,
        files: [
          { id: 1, name: 'Sample.mp4', size: 1024 * 1024 },
          { id: 2, name: 'Movie.2024.1080p.mkv', size: 1024 * 1024 * 1000 },
        ],
      },
    ] as any)

    vi.spyOn(torboxApi, 'requestDownloadLink').mockResolvedValueOnce(
      'https://debrid.torbox.app/download/12345/video.mkv'
    )

    const resolved = await resolveStreamUrl(torrentStream, 'fake_api_key')
    expect(resolved).toBe('https://debrid.torbox.app/download/12345/video.mkv')
    expect(torboxApi.requestDownloadLink).toHaveBeenCalledWith('fake_api_key', 12345, 2)
  })

  it('checks batch cached torrent hashes on TorBox', async () => {
    vi.spyOn(torboxApi, 'checkCached').mockResolvedValueOnce({
      hash1: { name: 'Movie 1', size: 1000 },
      hash2: {},
    })

    const cached = await batchCheckCached(['HASH1', 'HASH2'], 'test_key')
    expect(cached['hash1']).toBe(true)
    expect(cached['hash2']).toBe(false)
  })
})
