import React, { useState, useRef, useEffect } from 'react'
import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'
import { pipeline, env } from '@xenova/transformers'
import './WasmPlayer.css'

// Skip local model checks for transformers.js in browser
env.allowLocalModels = false

export default function WasmPlayer() {
  const [loaded, setLoaded] = useState(false)
  const [loadingText, setLoadingText] = useState('')
  const [ffmpeg] = useState(() => new FFmpeg())
  const videoRef = useRef<HTMLVideoElement>(null)
  
  const [videoSrc, setVideoSrc] = useState('')
  const [progress, setProgress] = useState(0)
  const [transcribing, setTranscribing] = useState(false)
  const [transcript, setTranscript] = useState<{text: string}[]>([])

  useEffect(() => {
    loadFfmpeg()
  }, [])

  const loadFfmpeg = async () => {
    setLoadingText('Loading FFmpeg (WASM)...')
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
    
    ffmpeg.on('progress', ({ progress, time }) => {
      setProgress(progress * 100)
    })

    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    })
    
    setLoaded(true)
    setLoadingText('Ready')
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return
    const file = e.target.files[0]
    
    setLoadingText('Transcoding video to MP4...')
    setProgress(0)

    // Write file to FFmpeg VFS
    await ffmpeg.writeFile('input', await fetchFile(file))

    // Run transcoding: input -> output.mp4
    // -c:v copy if possible, but for unsupported codecs we'll re-encode to h264 for the browser
    // Using ultrafast preset for PoC speed
    await ffmpeg.exec(['-i', 'input', '-preset', 'ultrafast', 'output.mp4'])
    
    // Also extract audio for transcription
    setLoadingText('Extracting audio for transcription...')
    await ffmpeg.exec(['-i', 'input', '-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1', 'audio.wav'])

    setLoadingText('Done!')
    
    // Read the MP4 output
    const mp4Data = await ffmpeg.readFile('output.mp4')
    const mp4Blob = new Blob([new Uint8Array(mp4Data as Uint8Array)], { type: 'video/mp4' })
    const url = URL.createObjectURL(mp4Blob)
    setVideoSrc(url)

    // Read the WAV output and start transcription
    const wavData = await ffmpeg.readFile('audio.wav')
    const wavBlob = new Blob([new Uint8Array(wavData as Uint8Array)], { type: 'audio/wav' })
    const wavUrl = URL.createObjectURL(wavBlob)
    
    transcribeAudio(wavUrl)
  }

  const transcribeAudio = async (audioUrl: string) => {
    setTranscribing(true)
    try {
      setLoadingText('Loading Whisper Model (AI Transcription)...')
      // automatic-speech-recognition uses whisper-tiny.en by default
      const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en')
      
      setLoadingText('Transcribing audio locally...')
      
      // We need to fetch the blob URL and get its array buffer for transformers.js
      const response = await fetch(audioUrl)
      const buffer = await response.arrayBuffer()
      // Create AudioContext to decode audio data
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 })
      const audioBuffer = await audioContext.decodeAudioData(buffer)
      
      // Get PCM data from the first channel
      const pcmData = audioBuffer.getChannelData(0)
      
      const result = await transcriber(pcmData, {
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: true
      }) as any
      
      if (Array.isArray(result?.chunks)) {
        setTranscript(result.chunks)
      } else if (result?.text) {
        setTranscript([{ text: result.text }])
      }
      
      setLoadingText('Transcription complete.')
    } catch (e) {
      console.error(e)
      setLoadingText('Transcription failed.')
    } finally {
      setTranscribing(false)
    }
  }

  return (
    <div className="wasm-player-container">
      <h1>WASM Universal Decoder & AI Transcriber (PoC)</h1>
      <p>This runs entirely in your browser using WebAssembly. Everything is 100% free and private.</p>
      
      <div className="status-bar">
        <span>Status: {loaded ? '✅ FFmpeg Loaded' : '⏳ Loading Engine...'}</span>
        <span className="loading-text">{loadingText}</span>
      </div>

      {progress > 0 && progress < 100 && (
        <div className="progress-bar-container">
          <div className="progress-bar" style={{ width: `${progress}%` }}></div>
        </div>
      )}

      {loaded && (
        <div className="upload-container">
          <label className="btn btn-primary">
            Upload Unsupported Video (e.g. MKV, AVI)
            <input type="file" accept="video/*,.mkv,.avi" hidden onChange={handleFileUpload} />
          </label>
        </div>
      )}

      <div className="player-content">
        <div className="video-section">
          {videoSrc ? (
            <video ref={videoRef} src={videoSrc} controls autoPlay className="wasm-video" />
          ) : (
            <div className="video-placeholder">Video will appear here</div>
          )}
        </div>

        <div className="transcript-section">
          <h3>Live Transcription (Whisper AI) {transcribing && '...'}</h3>
          <div className="transcript-box">
            {transcript.length === 0 ? (
              <p className="text-muted">No transcription yet.</p>
            ) : (
              transcript.map((chunk: any, i) => (
                <div key={i} className="transcript-chunk">
                  {chunk.timestamp && <span className="timestamp">[{chunk.timestamp[0]}s - {chunk.timestamp[1]}s]</span>}
                  <p>{chunk.text}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
