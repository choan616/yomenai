// 기본 사전의 읽기를 로컬 VOICEVOX 엔진으로 합성해 MP3 파일로 굳히는 빌드 스크립트
//
// 앱이 직접 음성을 주는 길 (context-notes 2026-10-03 「앱이 직접 음성을 준다」·「VOICEVOX 시범」). 카드·계정·키가 필요 없고
// 엔진은 이 PC 의 127.0.0.1 에서만 돈다. 읽기마다 `엔진 → WAV → ffmpeg → MP3` 로 한 파일을 만든다.
//
//   npx tsx tools/build-audio.ts --speaker 11 --voice kurono [--limit 12] [--concurrency 2]
//
// - 이어 돌 수 있다: 이미 있는 파일은 건너뛴다. 임시 파일에 쓴 뒤 이름을 바꿔서 중간에 끊겨도 깨진 파일이 남지 않는다
// - 결과는 `data/audio/<voice>/` (커밋하지 않는다). `index.json` 이 읽기 → 파일 이름 표다
// - 크레딧 표기가 필요한 음성이다. 앱에 올리기 전에 규약을 다시 확인한다 (context-notes 2026-10-03)
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { AUDIO_FORMAT, FFMPEG_ARGS, audioName, uniqueReadings } from './lib/audio.ts'

const { values: opt } = parseArgs({
  options: {
    speaker: { type: 'string' },
    voice: { type: 'string' },
    out: { type: 'string', default: 'data/audio' },
    limit: { type: 'string' },
    concurrency: { type: 'string', default: '2' },
    engine: { type: 'string', default: 'http://127.0.0.1:50021' },
    ffmpeg: { type: 'string', default: process.env.FFMPEG ?? 'ffmpeg' },
  },
})
if (!opt.speaker || !opt.voice) {
  console.error('사용법: tsx tools/build-audio.ts --speaker <엔진의 화자 id> --voice <폴더 이름> [--limit N] [--concurrency N]')
  process.exit(2)
}
const ENGINE = opt.engine!
// 엔진은 이 PC 에서만 돈다는 전제다. 다른 호스트로 읽기 목록을 보내지 않게 막는다
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(ENGINE)) {
  console.error(`엔진 주소가 로컬이 아니다: ${ENGINE}`)
  process.exit(2)
}

const post = async (path: string, init?: RequestInit): Promise<Response> => {
  const res = await fetch(`${ENGINE}${path}`, { method: 'POST', ...init })
  if (!res.ok) throw new Error(`${path} ${res.status}`)
  return res
}

/** WAV 를 ffmpeg 에 흘려 MP3 바이트를 받는다 */
function toMp3(wav: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = spawn(opt.ffmpeg!, FFMPEG_ARGS)
    const out: Buffer[] = []
    let err = ''
    p.stdout.on('data', (d: Buffer) => out.push(d))
    p.stderr.on('data', (d: Buffer) => (err += d))
    p.on('error', reject)
    p.on('close', (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg ${code}: ${err.trim()}`))))
    p.stdin.on('error', () => {}) // 먼저 죽으면 close 에서 코드로 보고된다
    p.stdin.end(wav)
  })
}

async function synth(text: string): Promise<Buffer> {
  const q = await (await post(`/audio_query?text=${encodeURIComponent(text)}&speaker=${opt.speaker}`)).json()
  const wav = Buffer.from(
    await (
      await post(`/synthesis?speaker=${opt.speaker}`, {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(q),
      })
    ).arrayBuffer(),
  )
  const mp3 = await toMp3(wav)
  if (mp3.length < 200) throw new Error(`결과가 너무 작다(${mp3.length}B)`)
  return mp3
}

async function main(): Promise<void> {
  const version = await (await fetch(`${ENGINE}/version`)).text().catch(() => '')
  if (!version) throw new Error(`엔진이 응답하지 않는다: ${ENGINE}/version`)
  await toMp3(Buffer.alloc(0)).catch((e: Error) => {
    if (/ENOENT/.test(e.message)) throw new Error('ffmpeg 를 찾지 못했다 (--ffmpeg 또는 FFMPEG 환경 변수)')
  })

  const base = JSON.parse(readFileSync('public/dict/base.json', 'utf8')) as { idioms: { reading: string }[] }
  let readings = uniqueReadings(base.idioms)
  if (opt.limit) readings = readings.slice(0, Number(opt.limit))

  const dir = join(opt.out!, opt.voice!)
  mkdirSync(dir, { recursive: true })
  const todo = readings.filter((r) => !existsSync(join(dir, audioName(r))))
  console.log(`엔진 ${version.trim()} · 읽기 ${readings.length}개 중 새로 만들 것 ${todo.length}개 → ${dir}`)

  const failed: { reading: string; why: string }[] = []
  const t0 = performance.now()
  let done = 0
  let next = 0
  const worker = async (): Promise<void> => {
    for (;;) {
      const reading = todo[next++]
      if (reading === undefined) return
      try {
        const file = join(dir, audioName(reading))
        writeFileSync(`${file}.tmp`, await synth(reading))
        renameSync(`${file}.tmp`, file)
      } catch (e) {
        failed.push({ reading, why: (e as Error).message })
      }
      done++
      if (done % 200 === 0 || done === todo.length) {
        const sec = (performance.now() - t0) / 1000
        const left = ((todo.length - done) * sec) / done
        console.log(`${done}/${todo.length} · 경과 ${(sec / 60).toFixed(1)}분 · 남은 약 ${(left / 60).toFixed(0)}분`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Number(opt.concurrency)) }, worker))

  // 표는 파일이 실제로 있는 읽기만 담는다
  const files: Record<string, string> = {}
  for (const r of readings) if (existsSync(join(dir, audioName(r)))) files[r] = audioName(r)
  writeFileSync(
    join(dir, 'index.json'),
    JSON.stringify({ voice: opt.voice, speaker: Number(opt.speaker), format: AUDIO_FORMAT, engine: version.trim(), files }),
  )
  console.log(`index.json — 파일 있는 읽기 ${Object.keys(files).length}개`)
  if (failed.length > 0) {
    console.error(`실패 ${failed.length}개`)
    for (const f of failed.slice(0, 20)) console.error(`  ${f.reading}: ${f.why}`)
    process.exitCode = 1
  }
}

main().catch((e: Error) => {
  console.error(e.message)
  process.exit(1)
})
