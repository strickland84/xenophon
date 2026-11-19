// The last seconds of play, kept as a short film to send to a friend (James, 2026-11-19: "Do 3": a clip, with the link
// onto his wing attached). A pilot presses Clip after something worth showing, so what is wanted is what has already
// happened: the game is filmed all the while, and the film is cut off at the press.
//
// A browser will film a canvas as it is drawn (MediaRecorder) but will not cut the last seconds out of a film that is
// still running. So two films run at once, each begun again every sixteen seconds, eight seconds apart: at any moment
// the older of the two holds the last eight to sixteen seconds, whole, and that one is stopped and handed over. Each
// frame of the game is drawn into a canvas of the film's own (720 rows or so, every art pixel a whole number of its
// px), over a strip with the game's name and the pilot's; the game's sound goes in with it where there is any.
//
// The page's only: nothing here is the engine's, and nothing of it is saved.

/** seconds of play a clip holds at the least (once that much has been flown), and it holds up to twice that */
export const CLIP_SPAN = 8
/** the film's size: about this many px across, and the strip under the picture this many px tall */
const ACROSS = 1280
const STRIP = 28
const FRAMES = 30
const BITS = 3_500_000

export interface Clip {
  blob: Blob
  /** its kind ('video/mp4', 'video/webm') and the name to save it under */
  type: string
  file: string
  /** how many seconds of play it holds */
  seconds: number
}

export interface Clipper {
  /** a frame of the game was drawn (the pixel picture, and the smooth flames over it if any): into the film */
  frame(picture: HTMLCanvasElement, over?: HTMLCanvasElement | null): void
  /** the last seconds, cut off now (null: nothing kept yet, or the film could not be made) */
  take(): Promise<Clip | null>
  dispose(): void
}

/** the kind of film this browser can make, the one that plays in most places first (null: none) */
export function clipKind(): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement === 'undefined') return null
  if (!('captureStream' in HTMLCanvasElement.prototype)) return null
  for (const kind of [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ])
    if (MediaRecorder.isTypeSupported(kind)) return kind
  return null
}

interface Film {
  rec: MediaRecorder
  parts: Blob[]
  /** ms it began */
  at: number
}

export function createClipper(o: {
  /** the game's sound, as a stream to film with the picture (null: none yet) */
  audio?: () => MediaStream | null
  /** what the strip under the picture says on its right: the pilot's callsign */
  mark?: () => string
  clock?: () => number
}): Clipper | null {
  const kind = clipKind()
  if (!kind) return null
  const clock = o.clock ?? (() => performance.now())
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  let stream: MediaStream | null = null
  const films: (Film | null)[] = [null, null]
  let gone = false

  function begin(slot: number) {
    if (!stream || gone) return
    const tracks = [...stream.getVideoTracks(), ...(o.audio?.()?.getAudioTracks() ?? [])]
    try {
      const rec = new MediaRecorder(new MediaStream(tracks), { mimeType: kind!, videoBitsPerSecond: BITS })
      const film: Film = { rec, parts: [], at: clock() }
      rec.ondataavailable = (e) => {
        if (e.data.size) film.parts.push(e.data)
      }
      rec.start()
      films[slot] = film
    } catch {
      films[slot] = null
    }
  }

  /** a film stopped, and what it holds (null: nothing) */
  function end(film: Film): Promise<Blob | null> {
    return new Promise((done) => {
      if (film.rec.state === 'inactive') return done(film.parts.length ? new Blob(film.parts, { type: kind!.split(';')[0] }) : null)
      film.rec.onstop = () => done(film.parts.length ? new Blob(film.parts, { type: kind!.split(';')[0] }) : null)
      film.rec.onerror = () => done(null)
      try {
        film.rec.stop()
      } catch {
        done(null)
      }
    })
  }

  return {
    frame(picture, over) {
      if (gone || !picture.width || !picture.height) return
      if (!stream) {
        // the film's size, from the first frame: every art pixel a whole number of its px, about ACROSS wide, even both ways
        const k = Math.max(2, Math.min(4, Math.round(ACROSS / picture.width)))
        canvas.width = (picture.width * k) & ~1
        canvas.height = (picture.height * k + STRIP + 1) & ~1
        stream = canvas.captureStream(FRAMES)
        begin(0)
      }
      const now = clock()
      // (the second film begins a span after the first; each is begun again once it holds two spans)
      if (!films[1] && films[0] && now - films[0].at >= CLIP_SPAN * 1000) begin(1)
      for (let i = 0; i < 2; i++) {
        const f = films[i]
        if (f && now - f.at >= CLIP_SPAN * 2000) {
          try {
            f.rec.stop()
          } catch {
            // (stopped already)
          }
          begin(i)
        }
      }
      // the picture, as large as fits in whole art pixels (the camera pulled in: fewer of them, larger), in the middle
      const room = canvas.height - STRIP
      // (the film is an even number of px each way, so it may be a px short of a whole number of art pixels: that px is cut off)
      const fit = Math.min((canvas.width + 1) / picture.width, (room + 1) / picture.height)
      const k = fit >= 1 ? Math.floor(fit) : fit
      const w = Math.round(picture.width * k)
      const h = Math.round(picture.height * k)
      const x = (canvas.width - w) >> 1
      const y = (room - h) >> 1
      ctx.fillStyle = '#05070f'
      ctx.fillRect(0, 0, canvas.width, room)
      ctx.imageSmoothingEnabled = fit < 1
      ctx.drawImage(picture, x, y, w, h)
      if (over && over.width && over.height) {
        ctx.imageSmoothingEnabled = true
        ctx.drawImage(over, x, y, w, h)
      }
      // the strip: whose game this is, and whose flight
      ctx.fillStyle = '#0b1023'
      ctx.fillRect(0, room, canvas.width, STRIP)
      ctx.fillStyle = '#f2c14e'
      ctx.fillRect(0, room, canvas.width, 2)
      ctx.font = '21px "Borrowed Pixel", monospace'
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      ctx.fillText('BORROWED STARS', 12, room + STRIP / 2 + 2)
      const mark = o.mark?.() ?? ''
      if (mark) {
        ctx.fillStyle = '#e8ecf5'
        ctx.textAlign = 'right'
        ctx.fillText(mark, canvas.width - 12, room + STRIP / 2 + 2)
      }
    },

    async take() {
      // the older of the two films: it holds the most
      const now = clock()
      let slot = -1
      for (let i = 0; i < 2; i++) if (films[i] && (slot < 0 || films[i]!.at < films[slot]!.at)) slot = i
      const film = slot >= 0 ? films[slot] : null
      if (!film) return null
      const seconds = (now - film.at) / 1000
      films[slot] = null
      const blob = await end(film)
      begin(slot)
      if (!blob || seconds < 0.5) return null
      const type = blob.type || kind.split(';')[0]
      return {
        blob,
        type,
        file: `xenophon-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${type.includes('mp4') ? 'mp4' : 'webm'}`,
        seconds,
      }
    },

    dispose() {
      gone = true
      for (const f of films)
        try {
          f?.rec.stop()
        } catch {
          // (stopped already)
        }
      for (const t of stream?.getTracks() ?? []) t.stop()
      stream = null
    },
  }
}
