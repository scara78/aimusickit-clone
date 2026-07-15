import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowDownToLine,
  Check,
  CircleHelp,
  FileAudio,
  Gauge,
  Headphones,
  LoaderCircle,
  Music2,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UploadCloud,
  Volume2,
  Waves,
  X,
} from 'lucide-react'
import { type ChangeEvent, type DragEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { processAudio, type AudioSettings } from './audioEngine'
import './App.css'

const DEFAULT_SETTINGS: AudioSettings = {
  speed: 1,
  pitch: 0,
  volume: 0,
  highFrequencyReduction: 0,
}

type ProcessingState = 'idle' | 'loading' | 'processing' | 'complete' | 'error'

const formatBytes = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const formatDuration = (seconds: number) => {
  if (!Number.isFinite(seconds)) return '—'
  const minutes = Math.floor(seconds / 60)
  const remaining = Math.floor(seconds % 60).toString().padStart(2, '0')
  return `${minutes}:${remaining}`
}

const messageFromError = (caught: unknown) => {
  if (caught instanceof Error && caught.message) return caught.message
  if (typeof caught === 'string') return caught
  if (caught && typeof caught === 'object') {
    const problem = caught as { message?: unknown; name?: unknown; type?: unknown }
    const parts = [problem.message, problem.name, problem.type].filter((part): part is string => typeof part === 'string' && part.length > 0)
    if (parts.length > 0) return parts.join(': ')
  }
  return 'The local audio engine failed before it could start. Reload the page and try again.'
}

function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const originalAudioRef = useRef<HTMLAudioElement>(null)
  const processedAudioRef = useRef<HTMLAudioElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [duration, setDuration] = useState(0)
  const [settings, setSettings] = useState<AudioSettings>(DEFAULT_SETTINGS)
  const [state, setState] = useState<ProcessingState>('idle')
  const [status, setStatus] = useState('Ready when you are')
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isPlaying, setIsPlaying] = useState<'source' | 'result' | null>(null)

  const filterSummary = useMemo(() => {
    const frequency = Math.round(20000 - settings.highFrequencyReduction * 155)
    return settings.highFrequencyReduction === 0 ? 'Off' : `${frequency.toLocaleString()} Hz cutoff`
  }, [settings.highFrequencyReduction])

  useEffect(() => {
    return () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl)
      if (resultUrl) URL.revokeObjectURL(resultUrl)
    }
  }, [sourceUrl, resultUrl])

  const changeSetting = <K extends keyof AudioSettings>(key: K, value: AudioSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }))
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl)
      setResultUrl(null)
      setState('idle')
      setStatus('Settings changed — render a new preview.')
    }
  }

  const chooseFile = (nextFile?: File) => {
    if (!nextFile) return
    if (!nextFile.type.startsWith('audio/') && !/\.(mp3|wav|m4a|ogg|flac|aac|wma|aiff|aif|opus|webm|mp4)$/i.test(nextFile.name)) {
      setError('Please choose an audio file such as MP3, WAV, M4A, OGG, FLAC, AAC, WMA, AIFF, OPUS, WEBM, or MP4.')
      return
    }
    if (sourceUrl) URL.revokeObjectURL(sourceUrl)
    if (resultUrl) URL.revokeObjectURL(resultUrl)
    setFile(nextFile)
    setSourceUrl(URL.createObjectURL(nextFile))
    setResultUrl(null)
    setDuration(0)
    setError(null)
    setState('idle')
    setStatus('File ready — adjust the controls or render as-is.')
  }

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => chooseFile(event.target.files?.[0])
  const onDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault()
    setIsDragging(false)
    chooseFile(event.dataTransfer.files?.[0])
  }

  const reset = () => {
    setSettings(DEFAULT_SETTINGS)
    if (resultUrl) URL.revokeObjectURL(resultUrl)
    setResultUrl(null)
    setError(null)
    setState('idle')
    setStatus(file ? 'Restored neutral settings.' : 'Ready when you are')
  }

  const togglePlayer = async (kind: 'source' | 'result') => {
    const audio = kind === 'source' ? originalAudioRef.current : processedAudioRef.current
    if (!audio) return
    if (isPlaying === kind) {
      audio.pause()
      setIsPlaying(null)
      return
    }
    originalAudioRef.current?.pause()
    processedAudioRef.current?.pause()
    await audio.play()
    setIsPlaying(kind)
  }

  const renderAudio = async () => {
    if (!file) return
    setError(null)
    setState('loading')
    setStatus('Preparing the private browser audio engine…')
    try {
      const blob = await processAudio(file, settings, (message) => {
        setState('processing')
        setStatus(message)
      })
      if (resultUrl) URL.revokeObjectURL(resultUrl)
      setResultUrl(URL.createObjectURL(blob))
      setState('complete')
      setStatus('Rendering complete. Preview or save your MP3.')
    } catch (caught) {
      setError(messageFromError(caught))
      setState('error')
      setStatus('Processing did not finish.')
    }
  }

  const download = () => {
    if (!resultUrl || !file) return
    const safeName = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()
    const link = document.createElement('a')
    link.href = resultUrl
    link.download = `${safeName || 'audio'}-edited.mp3`
    link.click()
  }

  const preset = (values: Partial<AudioSettings>) => {
    setSettings((current) => ({ ...current, ...values }))
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl)
      setResultUrl(null)
    }
    setState('idle')
    setStatus('Settings changed — render a new preview.')
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#editor">Skip to editor</a>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Aura Audio home">
          <span className="brand-mark"><Waves size={19} /></span>
          <span>Aura <em>Audio</em></span>
        </a>
        <div className="privacy-chip"><ShieldCheck size={15} /> Files stay in this browser</div>
      </header>

      <main id="top">
        <section className="hero-section" aria-labelledby="hero-title">
          <motion.div
            className="eyebrow"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            <Sparkles size={14} /> Personal audio finishing suite
          </motion.div>
          <motion.h1 id="hero-title" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06, duration: 0.4 }}>
            Shape your sound.<br /><span>Keep it private.</span>
          </motion.h1>
          <p className="hero-copy">A local-first editor for authorized recordings, demos, stems, and works in progress. Nothing is uploaded to our servers.</p>
        </section>

        <section className="studio-grid" id="editor" aria-label="Audio editor">
          <div className="editor-card source-card">
            <div className="card-heading">
              <span className="section-index">01</span>
              <div><h2>Your source</h2><p>Upload a track you own or have permission to edit.</p></div>
            </div>

            {!file ? (
              <button
                className={`dropzone ${isDragging ? 'is-dragging' : ''}`}
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(event) => { event.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
              >
                <span className="upload-orb"><UploadCloud size={27} /></span>
                <strong>Drop audio here</strong>
                <span>or browse from your device</span>
                <small>MP3 · WAV · M4A · OGG · FLAC · AAC · WMA · AIFF · OPUS</small>
              </button>
            ) : (
              <div className="file-panel">
                <div className="file-icon"><FileAudio size={21} /></div>
                <div className="file-info"><strong title={file.name}>{file.name}</strong><span>{formatBytes(file.size)} <i /> {formatDuration(duration)}</span></div>
                <button className="icon-button" type="button" aria-label="Remove selected audio" onClick={() => { if (sourceUrl) URL.revokeObjectURL(sourceUrl); setFile(null); setSourceUrl(null); reset() }}><X size={18} /></button>
                <div className="audio-preview">
                  <button className="play-button" type="button" aria-label={isPlaying === 'source' ? 'Pause original audio' : 'Play original audio'} onClick={() => void togglePlayer('source')}>
                    {isPlaying === 'source' ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
                  </button>
                  <div className="waveform" aria-hidden="true">{Array.from({ length: 44 }, (_, index) => <i key={index} style={{ height: `${18 + ((index * 29) % 57)}%` }} />)}</div>
                  <span>Original</span>
                </div>
                <audio ref={originalAudioRef} src={sourceUrl ?? undefined} onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} onEnded={() => setIsPlaying(null)} />
              </div>
            )}
            <input ref={inputRef} className="sr-only" type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac,.aac,.wma,.aiff,.aif,.opus,.webm,.mp4" onChange={onInputChange} />
          </div>

          <div className="editor-card controls-card">
            <div className="card-heading controls-heading">
              <span className="section-index">02</span>
              <div><h2>Fine tune</h2><p>Neutral settings preserve your source. Use changes intentionally.</p></div>
              <button className="reset-button" type="button" onClick={reset}><RotateCcw size={15} /> Reset</button>
            </div>

            <div className="controls-stack">
              <RangeControl icon={<Gauge size={17} />} title="Playback speed" value={`${settings.speed.toFixed(2)}×`} min="0.5" max="1.2" step="0.01" current={settings.speed} onChange={(value) => changeSetting('speed', value)} labels={['0.5×', '1.0×', '1.2×']} />
              <div className="quick-controls"><button type="button" onClick={() => changeSetting('speed', 0.68)}>0.68× (84 BPM)</button><button type="button" onClick={() => changeSetting('speed', 0.87)}>0.87× (default)</button><button type="button" onClick={() => changeSetting('speed', 1)}>Original pace</button></div>
              <RangeControl icon={<Music2 size={17} />} title="Pitch" value={`${settings.pitch > 0 ? '+' : ''}${settings.pitch} semitones`} min="-8" max="8" step="1" current={settings.pitch} onChange={(value) => changeSetting('pitch', value)} labels={['−8', '0', '+8']} />
              <div className="quick-controls"><button type="button" onClick={() => changeSetting('pitch', -2)}>Down 2</button><button type="button" onClick={() => changeSetting('pitch', 0)}>Original key</button><button type="button" onClick={() => changeSetting('pitch', 2)}>Up 2</button></div>
              <RangeControl icon={<Volume2 size={17} />} title="Output gain" value={`${settings.volume > 0 ? '+' : ''}${settings.volume} dB`} min="-18" max="6" step="1" current={settings.volume} onChange={(value) => changeSetting('volume', value)} labels={['−18 dB', '0 dB', '+6 dB']} />
              <RangeControl icon={<SlidersHorizontal size={17} />} title="High-frequency reduction" value={filterSummary} min="0" max="100" step="1" current={settings.highFrequencyReduction} onChange={(value) => changeSetting('highFrequencyReduction', value)} labels={['Off', 'Gentle', 'Strong']} />
              <div className="quick-controls"><button type="button" onClick={() => changeSetting('highFrequencyReduction', 20)}>Gentle</button><button type="button" onClick={() => changeSetting('highFrequencyReduction', 50)}>Medium</button><button type="button" onClick={() => changeSetting('highFrequencyReduction', 80)}>Strong</button></div>
            </div>
          </div>

          <aside className="editor-card guide-card" aria-label="Editing guidance">
            <div className="guide-icon"><Headphones size={19} /></div>
            <h2>Made for your own work</h2>
            <p>Use this editor for recordings you created, licensed assets, or material you are authorized to modify.</p>
            <div className="guide-rule"><Check size={15} /> Processed locally in your browser</div>
            <div className="guide-rule"><Check size={15} /> Export a standard MP3 file</div>
            <div className="guide-rule"><Check size={15} /> No claim that it changes platform policies</div>
            <button type="button" className="preset-button" onClick={() => preset({ speed: 1, pitch: 0, volume: -1, highFrequencyReduction: 0 })}>Set a clean preview <ArrowDownToLine size={15} /></button>
          </aside>
        </section>

        <section className="render-section" aria-live="polite">
          <div className={`render-status ${state}`}><span className="status-icon">{state === 'complete' ? <Check size={16} /> : state === 'loading' || state === 'processing' ? <LoaderCircle size={16} className="spin" /> : state === 'error' ? <CircleHelp size={16} /> : <Waves size={16} />}</span><span>{status}</span></div>
          {error && <p className="error-message">{error}</p>}
          <div className="render-actions">
            <button className="primary-action" type="button" disabled={!file || state === 'loading' || state === 'processing'} onClick={() => void renderAudio()}>
              {state === 'loading' || state === 'processing' ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
              {state === 'loading' || state === 'processing' ? 'Rendering locally…' : 'Render audio'}
            </button>
            <button className="secondary-action" type="button" disabled={!resultUrl} onClick={download}><ArrowDownToLine size={18} /> Save MP3</button>
          </div>

          <AnimatePresence>
            {resultUrl && (
              <motion.div className="result-panel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
                <div className="result-header"><div><span className="result-kicker">NEW RENDER</span><h2>Your edited audio</h2></div><span className="wav-badge">MP3</span></div>
                <div className="audio-preview result-preview"><button className="play-button" type="button" aria-label={isPlaying === 'result' ? 'Pause edited audio' : 'Play edited audio'} onClick={() => void togglePlayer('result')}>{isPlaying === 'result' ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}</button><div className="waveform result-waveform" aria-hidden="true">{Array.from({ length: 44 }, (_, index) => <i key={index} style={{ height: `${22 + ((index * 17) % 65)}%` }} />)}</div><span>Edited</span></div>
                <audio ref={processedAudioRef} src={resultUrl} onEnded={() => setIsPlaying(null)} />
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>
      <footer><span>Browser-first audio processing</span><span>Audio stays on your device</span></footer>
    </div>
  )
}

type RangeControlProps = {
  icon: ReactNode
  title: string
  value: string
  min: string
  max: string
  step: string
  current: number
  labels: [string, string, string]
  onChange: (value: number) => void
}

function RangeControl({ icon, title, value, min, max, step, current, labels, onChange }: RangeControlProps) {
  return <div className="range-control"><div className="range-meta"><span className="range-title">{icon}{title}</span><output>{value}</output></div><input type="range" min={min} max={max} step={step} value={current} onChange={(event) => onChange(Number(event.target.value))} aria-label={title} /><div className="range-labels"><span>{labels[0]}</span><span>{labels[1]}</span><span>{labels[2]}</span></div></div>
}

export default App