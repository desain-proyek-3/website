import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Fingerprint,
  Lock,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Timer,
} from 'lucide-react'
import Logo from '../components/Logo.jsx'
import Radiograph from '../components/Radiograph.jsx'

const BADGES = [
  { text: 'SCAN ID: AM-PM-03', pos: 'left-4 top-5 sm:-left-6 sm:top-10', tone: 'bg-white text-ink' },
  { text: 'PRECISION: 0.02MM', pos: 'right-4 top-1/3 sm:-right-5', tone: 'bg-viewer-700 text-signal-cyan ring-1 ring-signal-cyan/30' },
  { text: 'MATCH SCORE: +98.4%', pos: 'bottom-6 left-1/2 -translate-x-1/2 sm:left-8 sm:translate-x-0', tone: 'bg-teal-600 text-white' },
]

const STEPS = [
  {
    icon: ScanLine,
    title: 'Capture the post-mortem record',
    body: 'Portable panoramic and a three-view intraoral series. The engine checks exposure before the team leaves the body.',
  },
  {
    icon: Fingerprint,
    title: 'Extract dental features',
    body: '32 landmarks per arch — crown outline, restoration margins, rotation, root morphology — measured to 0.02 mm.',
  },
  {
    icon: ShieldCheck,
    title: 'Confirm with an odontologist',
    body: 'Candidate pairs arrive ranked with the reasoning attached. Nothing is released without a human signature.',
  },
]

export default function Landing() {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="mx-auto flex max-w-[1180px] items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        <nav className="hidden items-center gap-8 text-[14px] font-medium text-slate-600 md:flex">
          <a className="hover:text-teal-700" href="#method">Method</a>
          <a className="hover:text-teal-700" href="#field">In the field</a>
          <a className="hover:text-teal-700" href="#safeguards">Safeguards</a>
        </nav>
        <Link to="/identify" className="btn-primary text-[13.5px]">
          Open workspace
        </Link>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-[1180px] items-center gap-12 px-5 pb-16 pt-8 sm:px-8 lg:grid-cols-[1.02fr_1fr] lg:gap-16 lg:pb-24 lg:pt-14">
        <div>
          <span className="chip bg-teal-50 text-teal-700 ring-1 ring-teal-200">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-500 animate-pulseDot" />
            DVI PHASE 2 · ACTIVE
          </span>

          <h1 className="mt-6 text-[40px] font-extrabold leading-[1.02] tracking-[-0.03em] text-ink sm:text-[58px]">
            DENTIFY
            <span className="mt-2 block text-[22px] font-semibold tracking-[-0.01em] text-teal-700 sm:text-[30px]">
              (Dental Identification)
            </span>
          </h1>

          <p className="mt-6 max-w-[54ch] text-[16.5px] leading-relaxed text-slate-600">
            Teeth outlast almost everything a disaster leaves behind. Dentify reads the dental
            biometrics in a post-mortem radiograph and matches them against ante-mortem clinic
            records, so families get an answer in hours instead of weeks — and every match carries
            the evidence a forensic odontologist needs to sign it off.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link to="/identify" className="btn-primary h-12 px-6 text-[15px] shadow-lift">
              Start Identification
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/analysis" className="btn-ghost h-12 px-6 text-[15px]">
              See a worked case
            </Link>
          </div>

          <dl className="mt-12 grid max-w-[520px] grid-cols-3 gap-6 border-t border-slate-200 pt-7">
            {[
              ['312', 'PM records processed'],
              ['0.02mm', 'landmark precision'],
              ['4.2 hrs', 'median time to match'],
            ].map(([v, k]) => (
              <div key={k}>
                <dt className="font-mono text-[22px] font-semibold text-teal-700">{v}</dt>
                <dd className="mt-1 text-[12.5px] leading-snug text-slate-500">{k}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Radiography viewer card */}
        <div className="relative">
          <div className="card-dark overflow-hidden p-4 shadow-lift sm:p-5">
            <div className="flex items-center justify-between pb-3">
              <div className="flex items-center gap-2 text-slate-400">
                <span className="h-2 w-2 rounded-full bg-signal-amber animate-pulseDot" />
                <span className="font-mono text-[11px] tracking-[.14em]">RADIOGRAPHY VIEWER</span>
              </div>
              <span className="font-mono text-[11px] text-slate-500">PANORAMIC · 16 SEP</span>
            </div>

            <div className="relative overflow-hidden rounded-xl bg-viewer-900">
              <Radiograph record="pm" overlay intensity={62} className="block w-full" />
              {/* single orchestrated motion: the scan sweep */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 animate-sweep bg-gradient-to-b from-transparent via-teal-400/20 to-transparent" />
              <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10" />
            </div>

            <div className="grid grid-cols-3 gap-3 pt-4">
              {[
                ['LANDMARKS', '32/32'],
                ['EXPOSURE', 'OK'],
                ['ARCHES', 'UP + LOW'],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-white/[0.04] px-3 py-2.5">
                  <div className="font-mono text-[10px] tracking-[.14em] text-slate-500">{k}</div>
                  <div className="mt-1 font-mono text-[13px] font-semibold text-teal-300">{v}</div>
                </div>
              ))}
            </div>
          </div>

          {BADGES.map((b) => (
            <span
              key={b.text}
              className={`chip absolute font-semibold shadow-card ${b.pos} ${b.tone}`}
            >
              {b.text}
            </span>
          ))}
        </div>
      </section>

      {/* Method */}
      <section id="method" className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-[1180px] px-5 py-16 sm:px-8 lg:py-20">
          <h2 className="max-w-[24ch] text-[28px] font-bold leading-tight tracking-tight text-ink sm:text-[34px]">
            Three steps between a recovered body and a confirmed name
          </h2>
          <ol className="mt-12 grid gap-8 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <li key={title} className="border-t-2 border-teal-600 pt-5">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[13px] font-semibold text-teal-700">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <Icon className="h-[18px] w-[18px] text-teal-600" />
                </div>
                <h3 className="mt-3 text-[17px] font-semibold text-ink">{title}</h3>
                <p className="mt-2 max-w-[42ch] text-[14px] leading-relaxed text-slate-600">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Field + safeguards */}
      <section id="field" className="mx-auto max-w-[1180px] px-5 py-16 sm:px-8 lg:py-20">
        <div className="grid gap-6 lg:grid-cols-3">
          <article className="card p-7 lg:col-span-2">
            <Timer className="h-6 w-6 text-teal-600" />
            <h3 className="mt-4 text-[20px] font-semibold text-ink">Built for a posko, not a lab</h3>
            <p className="mt-3 max-w-[60ch] text-[14.5px] leading-relaxed text-slate-600">
              Dentify runs on a field laptop with the case database held locally. When the network
              drops, scanning and scoring continue; records reconcile with the command server once
              the link returns. Reviewers see exactly which candidate pairs were scored offline.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {[
                ['Offline-first', 'Full matching without a connection'],
                ['Interpol DVI', 'Exports to form F1, section D'],
                ['Two-person rule', 'Every release needs a second reviewer'],
              ].map(([t, d]) => (
                <div key={t} className="rounded-xl bg-slate-50 p-4">
                  <div className="text-[13.5px] font-semibold text-ink">{t}</div>
                  <p className="mt-1 text-[12.5px] leading-snug text-slate-500">{d}</p>
                </div>
              ))}
            </div>
          </article>

          <article id="safeguards" className="card bg-viewer-800 p-7 text-slate-300">
            <Lock className="h-6 w-6 text-teal-400" />
            <h3 className="mt-4 text-[20px] font-semibold text-white">The AI never closes a case</h3>
            <p className="mt-3 text-[14.5px] leading-relaxed text-slate-400">
              Scores are a queue order, not a verdict. Identification is released by a named
              odontologist, recorded in the log with the evidence that supported it.
            </p>
            <div className="mt-6 flex items-center gap-2 rounded-xl bg-white/[0.05] px-4 py-3">
              <Sparkles className="h-4 w-4 text-teal-300" />
              <span className="font-mono text-[11.5px] tracking-wide text-teal-200">
                HUMAN SIGN-OFF REQUIRED
              </span>
            </div>
          </article>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Logo />
          <p className="text-[12.5px] text-slate-500">
            Demo interface · not for operational identification without validation.
          </p>
        </div>
      </footer>
    </div>
  )
}
