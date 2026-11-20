import { LandingHero } from "../components/landing-hero";

const STEPS = [
  {
    title: "Drive",
    body: "Steer through traffic and away from the police for as long as you can. The run is simulated onchain, ten ticks a second.",
  },
  {
    title: "Trade",
    body: "Spectators buy RIDE or BUST on three lines: does the driver last 30, 60 or 90 seconds?",
  },
  {
    title: "Settle instantly",
    body: "Each line resolves from the game state the moment the run passes it or the police catch up. Winners claim straight away.",
  },
] as const;

const MAGICBLOCK = [
  {
    name: "Ephemeral Rollup",
    body: "The simulation and the markets run in a rollup at 10 Hz, with balances delegated from Solana.",
  },
  {
    name: "VRF",
    body: "Each course is built from a verifiable random seed drawn when the run starts.",
  },
  {
    name: "Cranks",
    body: "A scheduled crank advances the run. Nobody, not even the driver, can skip a tick.",
  },
  {
    name: "Session keys",
    body: "One signature starts an hour-long session, so driving and trading need no wallet popups.",
  },
] as const;

export default function Home() {
  return (
    <main>
      <LandingHero />
      <section
        id="how-it-works"
        className="mx-auto max-w-5xl scroll-mt-16 px-4 py-16 sm:px-6 sm:py-24"
      >
        <h2 className="font-display text-3xl font-extrabold italic sm:text-4xl">How a run works</h2>
        <ol className="mt-8 grid gap-6 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
              <span className="font-display text-sm font-semibold tracking-widest text-neon-pink">
                0{i + 1}
              </span>
              <h3 className="mt-1 font-display text-2xl font-extrabold italic">{step.title}</h3>
              <p className="mt-2 text-sm text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className="border-t border-white/10 bg-white/[0.02]">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
          <h2 className="font-display text-sm font-semibold tracking-widest text-muted uppercase">
            Built on MagicBlock
          </h2>
          <dl className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {MAGICBLOCK.map((item) => (
              <div key={item.name}>
                <dt className="font-semibold text-neon-cyan">{item.name}</dt>
                <dd className="mt-1 text-sm text-muted">{item.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </main>
  );
}
