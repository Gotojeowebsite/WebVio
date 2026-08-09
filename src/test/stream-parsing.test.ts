import { describe, it, expect } from 'vitest'
import { parseStreamInfo } from '../utils/stream-resolver'
import { Stream } from '../api/addon-client'

describe('Stream row parsing (parseStreamInfo)', () => {
  it('parses quality, codec, hdr, audio, size, seeders from stream name/title', () => {
    const stream: Stream = {
      name: 'Torrentio\n4K HDR',
      title: 'Dune.Part.Two.2024.2160p.UHD.BluRay.x265.TrueHD.Atmos.7.1-EXTREME\n💾 24.5 GB 👤 320',
      infoHash: 'abc1234567890abcdef1234567890abcdef1234',
    }

    const info = parseStreamInfo(stream)
    expect(info.quality).toBe('4K')
    expect(info.hdr).toBe(true)
    expect(info.codec).toBe('x265')
    expect(info.size).toBe('24.5 GB')
    expect(info.seeders).toBe(320)
  })

  it('correctly handles 1080p direct stream', () => {
    const stream: Stream = {
      name: 'Direct Stream',
      title: 'Movie.2024.1080p.WEBRip.x264.AAC\n💾 2.1 GB',
      url: 'https://cdn.example.com/movie.mp4',
    }

    const info = parseStreamInfo(stream)
    expect(info.quality).toBe('1080p')
    expect(info.codec).toBe('x264')
    expect(info.size).toBe('2.1 GB')
    expect(info.seeders).toBeNull()
  })
})
