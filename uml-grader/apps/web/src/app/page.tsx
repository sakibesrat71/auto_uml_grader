import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.28),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(20,184,166,0.22),_transparent_32%),linear-gradient(135deg,_#082f49,_#0f172a_48%,_#134e4a)] px-6 py-12">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-5xl items-center">
        <section className="grid w-full gap-8 rounded-[2rem] border border-white/12 bg-white/10 p-8 text-white shadow-2xl backdrop-blur xl:grid-cols-[1.15fr_0.85fr]">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.3em] text-cyan-200">
              Auto UML Grader
            </p>
            <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
              Grade faster, submit with confidence, and see what needs action instantly.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-200">
              Jump into the student dashboard, teacher dashboard, or auth flow from one place.
              Protected routes will always send logged-out users back to login first.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                href="/student/dashboard"
                className="rounded-full bg-cyan-400 px-5 py-3 text-center font-semibold text-slate-950 transition hover:bg-cyan-300"
              >
                Student Dashboard
              </Link>
              <Link
                href="/dashboard"
                className="rounded-full border border-white/25 bg-white/10 px-5 py-3 text-center font-semibold text-white transition hover:bg-white/18"
              >
                Dashboard
              </Link>
              <Link
                href="/login"
                className="rounded-full border border-white/25 bg-white/10 px-5 py-3 text-center font-semibold text-white transition hover:bg-white/18"
              >
                Login
              </Link>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-white/14 bg-slate-950/45 p-6">
            <p className="text-sm font-medium text-cyan-200">Quick routes</p>
            <div className="mt-5 grid gap-3">
              <Link
                href="/signup"
                className="rounded-2xl bg-white px-5 py-4 font-medium text-slate-950 transition hover:bg-cyan-50"
              >
                Sign up
              </Link>
              <Link
                href="/signup/verify"
                className="rounded-2xl border border-white/20 bg-white/6 px-5 py-4 font-medium text-white transition hover:bg-white/12"
              >
                Verify OTP
              </Link>
              <Link
                href="/teacher/dashboard"
                className="rounded-2xl border border-white/20 bg-white/6 px-5 py-4 font-medium text-white transition hover:bg-white/12"
              >
                Teacher Dashboard
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
