import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Play,
  ArrowLeft,
  Star,
  Zap,
  Inbox,
  CheckCircle2,
  Sparkles,
  Check,
  Plus,
  Tv,
  Film,
  Calendar,
  Clock,
  ExternalLink,
  Layers,
} from 'lucide-react'
import { useAddonStore } from '../store/addon-store'
import { useAuthStore } from '../store/auth-store'
import { AddonClient, Meta, Video } from '../api/addon-client'
import { getNextUpDetails, getEpisodeWatchStatus, getEpisodeWatchProgress } from '../api/simkl-sync'
import StreamPicker from '../components/detail/StreamPicker'
import { isInLibrary, toggleLibraryItem } from '../utils/library'
import './detail.css'

export default function Detail() {
  const { type, id } = useParams<{ type: string; id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { addons, loadFromStorage } = useAddonStore()
  const { simklHistory, simklProgress, recordSimklEpisode, recordSimklMovie } = useAuthStore()

  const [meta, setMeta] = useState<Meta | null>(null)
  const [loading, setLoading] = useState(true)
  const [streamPickerOpen, setStreamPickerOpen] = useState(false)
  const [selectedVideoId, setSelectedVideoId] = useState<string>('')
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null)
  const [inLibraryState, setInLibraryState] = useState(false)
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    if (!type || !id) return
    setLoading(true)
    let mounted = true

    // Check query params for initial autoplay or direct episode
    const initialEpisode = searchParams.get('episode')
    const initialSeason = searchParams.get('season')
    const initialAutoplay = searchParams.get('autoplay') === 'true'

    const fetchMeta = async () => {
      let currentAddons = addons
      if (currentAddons.length === 0) {
        await loadFromStorage()
        currentAddons = useAddonStore.getState().addons
      }

      const enabledAddons = currentAddons.filter((a) => a.enabled)
      const providersToTry = [
        ...enabledAddons.map((a) => ({ url: a.manifestUrl, manifest: a.manifest })),
        { url: 'https://v3-cinemeta.strem.io/manifest.json', manifest: null },
        { url: 'https://anime-kitsu.strem.fun/manifest.json', manifest: null },
      ]

      const typesToTry = [type, 'series', 'movie', 'anime', 'tv'].filter(Boolean) as string[]

      for (const provider of providersToTry) {
        try {
          const client = new AddonClient(provider.url)
          if (provider.manifest) {
            client.manifest = provider.manifest
          }

          for (const tryType of typesToTry) {
            try {
              const result = await client.getMeta(tryType, id)
              if (!mounted) return

              if (result && result.meta) {
                setMeta(result.meta)
                setInLibraryState(isInLibrary(result.meta.id))
                setLoading(false)

                if (initialEpisode) {
                  setSelectedVideoId(initialEpisode)
                  setStreamPickerOpen(true)
                } else if (initialAutoplay) {
                  const defaultVid =
                    result.meta.videos && result.meta.videos.length > 0
                      ? result.meta.videos[0].id
                      : result.meta.id
                  setSelectedVideoId(defaultVid)
                  setStreamPickerOpen(true)
                }

                if (initialSeason) {
                  setSelectedSeason(Number(initialSeason))
                }
                return
              }
            } catch {
              // Try next type
            }
          }
        } catch {
          continue
        }
      }
      if (mounted) setLoading(false)
    }

    fetchMeta()

    return () => {
      mounted = false
    }
  }, [type, id, addons, loadFromStorage, searchParams])

  // Compute Next Up episode details
  const nextUpInfo = useMemo(() => {
    void simklProgress
    return getNextUpDetails(meta, simklHistory)
  }, [meta, simklHistory, simklProgress])

  // Get list of seasons from videos
  const seasons = useMemo(() => {
    if (!meta?.videos) return []
    return [
      ...new Set(
        meta.videos
          .filter((v) => v.season !== undefined && v.season > 0)
          .map((v) => v.season!)
      ),
    ].sort((a, b) => a - b)
  }, [meta?.videos])

  // Set default active season based on Next Up episode if not set
  useEffect(() => {
    if (selectedSeason === null && nextUpInfo?.nextEpisode?.season) {
      setSelectedSeason(nextUpInfo.nextEpisode.season)
    }
  }, [nextUpInfo, selectedSeason])

  const activeSeason = selectedSeason !== null ? selectedSeason : seasons.length > 0 ? seasons[0] : 1

  const episodesInSeason = useMemo(() => {
    if (!meta?.videos) return []
    if (seasons.length > 0) {
      return meta.videos.filter((v) => v.season === activeSeason)
    }
    return meta.videos
  }, [meta?.videos, seasons.length, activeSeason])

  const isShow =
    type === 'series' ||
    type === 'anime' ||
    type === 'tv' ||
    (meta?.videos && meta.videos.length > 0)

  const handlePlay = (videoId?: string) => {
    if (!meta || !type) return
    const targetVideoId =
      videoId ||
      (nextUpInfo?.nextEpisode
        ? nextUpInfo.nextEpisode.id
        : episodesInSeason && episodesInSeason.length > 0
        ? episodesInSeason[0].id
        : meta.videos && meta.videos.length > 0
        ? meta.videos[0].id
        : meta.id)

    setSelectedVideoId(targetVideoId)
    setStreamPickerOpen(true)
  }

  const handleToggleWatched = async (ep: Video) => {
    if (!meta) return
    const sNum = ep.season || activeSeason
    const eNum = ep.episode || 1
    await recordSimklEpisode(meta.id, sNum, eNum)
  }

  const handleToggleMovieWatched = async () => {
    if (!meta) return
    await recordSimklMovie(meta.id)
  }

  const handleToggleLibrary = () => {
    if (!meta) return
    const res = toggleLibraryItem(meta, 'plantowatch')
    setInLibraryState(res.inLibrary)
  }

  if (loading) {
    return (
      <div className="detail-page">
        <div className="detail-loading">
          <div className="loading-spinner" />
          <p>Loading metadata & streaming sources...</p>
        </div>
      </div>
    )
  }

  if (!meta) {
    return (
      <div className="detail-page">
        <div className="empty-state card-glass">
          <Inbox size={48} aria-hidden="true" style={{ marginBottom: '16px', opacity: 0.5 }} />
          <h3>Content Not Found</h3>
          <p>We couldn't retrieve metadata for this title. Check your installed addons or try another search.</p>
          <button className="btn btn-primary" onClick={() => navigate(-1)}>
            Go Back
          </button>
        </div>
      </div>
    )
  }

  // Hero Play Button CTA text
  let playButtonText = 'Play Movie'
  if (isShow) {
    if (nextUpInfo?.nextEpisode) {
      const ep = nextUpInfo.nextEpisode
      const s = ep.season || 1
      const e = ep.episode || 1
      if (nextUpInfo.isResume && nextUpInfo.progressPercent > 0) {
        playButtonText = `Resume S${s}E${e} (${nextUpInfo.progressPercent}%)`
      } else {
        playButtonText = `Play S${s}E${e}`
      }
    } else if (episodesInSeason.length > 0) {
      playButtonText = `Play S${activeSeason}E1`
    } else {
      playButtonText = 'Play Episodes'
    }
  }

  const trailerLink = meta.trailers && meta.trailers.length > 0 ? meta.trailers[0] : null

  return (
    <div className="detail-page">
      {/* ── 16:9 Backdrop Hero with Poster Overlay on Left ────────────────── */}
      <section className="detail-hero-section">
        <div
          className="detail-hero-backdrop"
          style={{
            backgroundImage: meta.background
              ? `url(${meta.background})`
              : meta.poster
              ? `url(${meta.poster})`
              : 'none',
          }}
        />
        <div className="detail-hero-gradient" />
        <div className="detail-hero-gradient-cap" />

        <div className="detail-hero-container">
          {/* Left Poster Overlay Card */}
          <div className="detail-poster-wrapper">
            <div className="detail-poster-card card-glass">
              {meta.poster && !imgError ? (
                <img
                  src={meta.poster}
                  alt={meta.name}
                  className="detail-poster-img"
                  onError={() => setImgError(true)}
                />
              ) : (
                <div className="detail-poster-fallback">
                  {isShow ? <Tv size={48} /> : <Film size={48} />}
                  <span>{meta.name}</span>
                </div>
              )}

              {/* Quick Play button overlay on poster */}
              <button
                type="button"
                className="detail-poster-play-overlay"
                onClick={() => handlePlay()}
                aria-label={`Play ${meta.name}`}
              >
                <div className="play-icon-circle">
                  <Play size={24} fill="currentColor" />
                </div>
              </button>
            </div>
          </div>

          {/* Right Metadata Column */}
          <div className="detail-metadata-column">
            {meta.logo ? (
              <img src={meta.logo} alt={meta.name} className="detail-logo-img" />
            ) : (
              <h1 className="detail-main-title">{meta.name}</h1>
            )}

            <div className="detail-chips-row">
              {meta.year && (
                <span className="detail-chip">
                  <Calendar size={13} aria-hidden="true" />
                  <span>{meta.year}</span>
                </span>
              )}
              {meta.runtime && (
                <span className="detail-chip">
                  <Clock size={13} aria-hidden="true" />
                  <span>{meta.runtime}</span>
                </span>
              )}
              {meta.imdbRating && (
                <span className="detail-chip detail-chip-rating">
                  <Star size={13} fill="#f5c518" color="#f5c518" aria-hidden="true" />
                  <span>{meta.imdbRating}</span>
                </span>
              )}
              {meta.type && (
                <span className="detail-chip detail-chip-type">
                  {meta.type.toUpperCase()}
                </span>
              )}
              {meta.genres?.slice(0, 4).map((genre) => (
                <span key={genre} className="detail-chip">
                  {genre}
                </span>
              ))}
            </div>

            {meta.description && (
              <p className="detail-synopsis-text">{meta.description}</p>
            )}

            {/* Director & Creator info if present */}
            {meta.director && meta.director.length > 0 && (
              <div className="detail-director-row">
                <span className="director-label">Director:</span>
                <span className="director-names">{meta.director.join(', ')}</span>
              </div>
            )}

            {/* Cast chips */}
            {meta.cast && meta.cast.length > 0 && (
              <div className="detail-cast-wrapper">
                <span className="cast-heading">Starring:</span>
                <div className="detail-cast-chips">
                  {meta.cast.slice(0, 8).map((actor) => (
                    <span key={actor} className="detail-cast-chip">
                      {actor}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Hero Action Buttons */}
            <div className="detail-hero-actions">
              <button
                type="button"
                className="btn btn-primary btn-lg detail-main-play-btn"
                onClick={() => handlePlay()}
              >
                <Play size={20} fill="currentColor" aria-hidden="true" />
                <span>{playButtonText}</span>
              </button>

              <button
                type="button"
                className={`btn btn-secondary btn-lg ${inLibraryState ? 'detail-library-active' : ''}`}
                onClick={handleToggleLibrary}
              >
                {inLibraryState ? (
                  <>
                    <Check size={18} color="#10b981" aria-hidden="true" />
                    <span>In Library</span>
                  </>
                ) : (
                  <>
                    <Plus size={18} aria-hidden="true" />
                    <span>Add to Library</span>
                  </>
                )}
              </button>

              {!isShow && (
                <button
                  type="button"
                  className="btn btn-secondary btn-lg"
                  onClick={handleToggleMovieWatched}
                  title="Mark Movie as Watched"
                >
                  <CheckCircle2 size={18} aria-hidden="true" />
                  <span>Mark Watched</span>
                </button>
              )}

              {trailerLink && (
                <a
                  href={
                    trailerLink.source.startsWith('http')
                      ? trailerLink.source
                      : `https://www.youtube.com/watch?v=${trailerLink.source}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-lg"
                >
                  <ExternalLink size={16} aria-hidden="true" />
                  <span>Trailer</span>
                </a>
              )}

              <button
                type="button"
                className="btn btn-ghost btn-lg"
                onClick={() => navigate(-1)}
                aria-label="Go back"
              >
                <ArrowLeft size={18} aria-hidden="true" />
                <span>Back</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Season Dropdown / Tabs + Episode Cards Grid ──────────────────── */}
      {isShow && (
        <section className="detail-episodes-section">
          <div className="episodes-header-bar">
            <div className="episodes-title-group">
              <h2 className="episodes-section-title">
                <span className="episodes-title-accent" />
                <span>Episodes</span>
                <span className="episodes-count-badge">
                  {episodesInSeason.length} {episodesInSeason.length === 1 ? 'Episode' : 'Episodes'}
                </span>
              </h2>

              {nextUpInfo && (
                <span className="episodes-watched-status">
                  {nextUpInfo.watchedCount} of {nextUpInfo.totalEpisodes} watched
                </span>
              )}
            </div>

            <div className="episodes-action-hint">
              <Zap size={14} color="var(--accent-violet)" aria-hidden="true" />
              <span>Click any episode card to launch instant stream picker</span>
            </div>
          </div>

          {/* Season Selector Tabs */}
          {seasons.length > 1 && (
            <div className="season-selector-bar" role="tablist" aria-label="Seasons">
              <div className="season-tabs-scroll">
                {seasons.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="tab"
                    aria-selected={activeSeason === s}
                    className={`season-selector-tab ${activeSeason === s ? 'active' : ''}`}
                    onClick={() => setSelectedSeason(s)}
                  >
                    <Layers size={14} aria-hidden="true" />
                    <span>Season {s}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Episode Cards Grid */}
          <div className="episode-cards-grid">
            {[...episodesInSeason]
              .sort((a, b) => (a.episode || 0) - (b.episode || 0))
              .map((ep, idx) => {
                const sNum = ep.season !== undefined ? ep.season : activeSeason
                const eNum = ep.episode !== undefined ? ep.episode : idx + 1
                const isNextUp = nextUpInfo?.nextEpisode?.id === ep.id
                const isWatched =
                  getEpisodeWatchStatus(meta.id, sNum, eNum, simklHistory) ||
                  simklProgress[`${meta.id}:${sNum}:${eNum}`]?.completed ||
                  simklProgress[ep.id]?.completed
                const progress = getEpisodeWatchProgress(ep.id, meta.id, sNum, eNum)

                // Episode thumbnail fallback: episode thumbnail or backdrop or poster
                const epThumbnail = ep.thumbnail || meta.background || meta.poster

                return (
                  <div
                    key={ep.id || `ep-${sNum}-${eNum}-${idx}`}
                    className={`episode-card card-glass ${isNextUp ? 'is-next-up' : ''} ${
                      isWatched ? 'is-watched' : ''
                    }`}
                    onClick={() => handlePlay(ep.id)}
                    role="button"
                    tabIndex={0}
                    aria-label={`Play S${sNum}E${eNum} ${ep.title || `Episode ${eNum}`}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        handlePlay(ep.id)
                      }
                    }}
                  >
                    {/* Thumbnail 16:9 Image with overlay & Next Up glowing border */}
                    <div className="episode-card-thumb-wrapper">
                      {epThumbnail ? (
                        <img
                          src={epThumbnail}
                          alt={ep.title || `Episode ${eNum}`}
                          className="episode-card-thumb-img"
                          loading="lazy"
                        />
                      ) : (
                        <div className="episode-card-thumb-fallback">
                          <Tv size={28} opacity={0.4} />
                        </div>
                      )}

                      <div className="episode-card-thumb-overlay">
                        <div className="episode-play-pill">
                          <Play size={14} fill="currentColor" />
                          <span>Play</span>
                        </div>
                      </div>

                      {/* Episode Badge: S1:E4 */}
                      <span className="episode-num-badge">
                        {ep.season && ep.episode ? `S${ep.season}:E${ep.episode}` : `E${eNum}`}
                      </span>

                      {/* Next Up Glowing Badge */}
                      {isNextUp && (
                        <span className="episode-nextup-glowing-badge">
                          <Sparkles size={11} aria-hidden="true" />
                          <span>NEXT UP</span>
                        </span>
                      )}

                      {/* Watched Badge */}
                      {isWatched && (
                        <span className="episode-watched-pill">
                          <Check size={11} aria-hidden="true" />
                        </span>
                      )}

                      {/* Bottom Progress Bar */}
                      {!isWatched && progress.percent > 0 && (
                        <div className="episode-card-progress-track">
                          <div
                            className="episode-card-progress-fill"
                            style={{ width: `${progress.percent}%` }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Episode Card Details */}
                    <div className="episode-card-body">
                      <div className="episode-card-title-row">
                        <h4 className="episode-card-title" title={ep.title || `Episode ${eNum}`}>
                          {ep.title || `Episode ${eNum}`}
                        </h4>

                        <button
                          type="button"
                          className={`episode-card-check-btn ${isWatched ? 'watched' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleToggleWatched(ep)
                          }}
                          title={isWatched ? 'Watched' : 'Mark as Watched'}
                          aria-label={isWatched ? 'Watched' : 'Mark as Watched'}
                        >
                          <Check size={15} aria-hidden="true" />
                        </button>
                      </div>

                      <div className="episode-card-meta-row">
                        {ep.released && (
                          <span className="episode-card-date">
                            {new Date(ep.released).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        )}
                        {!isWatched && progress.percent > 0 && (
                          <span className="episode-card-progress-label">
                            {progress.percent}% watched
                          </span>
                        )}
                      </div>

                      {ep.overview && (
                        <p className="episode-card-overview" title={ep.overview}>
                          {ep.overview}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
          </div>
        </section>
      )}

      {/* ── One-Click StreamPicker Modal ──────────────────────────────────── */}
      {streamPickerOpen && meta && type && (
        <StreamPicker
          isOpen={streamPickerOpen}
          onClose={() => setStreamPickerOpen(false)}
          type={type}
          videoId={selectedVideoId}
          meta={meta}
        />
      )}
    </div>
  )
}
