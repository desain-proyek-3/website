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

const HERO_STATS = [
  ['312', 'PM records processed'],
  ['0.02mm', 'landmark precision'],
  ['4.2 hrs', 'median time to match'],
  ['Offline-first', 'works without a connection'],
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
      <header className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-5 sm:px-10 lg:px-16">
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
      <section className="mx-auto max-w-[1600px] px-6 pb-16 pt-10 sm:px-10 lg:px-16 lg:pb-24 lg:pt-16">
        <span className="chip bg-teal-50 text-teal-700 ring-1 ring-teal-200">
          <span className="h-1.5 w-1.5 rounded-full bg-teal-500 animate-pulseDot" />
          DVI PHASE 2 · ACTIVE
        </span>

        <h1 className="mt-6 max-w-[18ch] text-[40px] font-extrabold leading-[1.02] tracking-[-0.03em] text-ink sm:text-[58px] lg:text-[68px]">
          DENTIFY
          <span className="mt-2 block text-[22px] font-semibold tracking-[-0.01em] text-teal-700 sm:text-[30px] lg:text-[34px]">
            (Dental Identification)
          </span>
        </h1>

        <p className="mt-6 max-w-[68ch] text-[16.5px] leading-relaxed text-slate-600 lg:text-[18px]">
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

        <dl className="mt-14 grid grid-cols-2 gap-x-6 gap-y-8 border-t border-slate-200 pt-8 sm:grid-cols-4">
          {HERO_STATS.map(([v, k]) => (
            <div key={k} className="sm:border-l sm:border-slate-200 sm:pl-6 sm:first:border-l-0 sm:first:pl-0">
              <dt className="font-mono text-[26px] font-semibold text-teal-700 lg:text-[30px]">{v}</dt>
              <dd className="mt-1 text-[13px] leading-snug text-slate-500">{k}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Method */}
      <section id="method" className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-[1600px] px-6 py-16 sm:px-10 lg:px-16 lg:py-20">
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
      <section id="field" className="mx-auto max-w-[1600px] px-6 py-16 sm:px-10 lg:px-16 lg:py-20">
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
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-6 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-10 lg:px-16">
          <Logo />
          <p className="text-[12.5px] text-slate-500">
            Demo interface · not for operational identification without validation.
          </p>
        </div>
      </footer>
    </div>
  )
}
