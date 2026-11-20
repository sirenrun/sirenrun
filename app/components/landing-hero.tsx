"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const HeroStage = dynamic(() => import("./hero-stage"), { ssr: false });

/** Until there is a lobby, both buttons lead to the first channel. */
const FIRST_CHANNEL = "/c/1";

/** Sunset gradient shown before the scene loads and instead of it when there is no motion. */
function Poster() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 bg-[radial-gradient(ellipse_70%_45%_at_50%_58%,#ff9a3c_0%,#ff3d7f_28%,#3b0a5c_62%,#07060f_100%)]"
    />
  );
}

/**
 * Full-screen hero over an attract run: the real scene, fed by an offline bot run from the
 * local sim. Nothing here touches the chain. Rendering stops while the hero is off screen.
 */
export function LandingHero() {
  const hero = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const el = hero.current;
    if (el === null) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry?.isIntersecting ?? true),
      {
        threshold: 0.05,
      },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={hero} className="relative h-[calc(100dvh-4rem)] w-full overflow-hidden">
      <Poster />
      <HeroStage visible={visible} />
      {/* Darken the middle and bottom so the headline reads over any frame of the run. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgb(7_6_15/0.15)_0%,rgb(7_6_15/0.55)_45%,rgb(7_6_15/0.85)_100%)]"
      />
      <div className="relative flex h-full flex-col items-center justify-end gap-6 px-4 pb-16 text-center sm:pb-24">
        <h1 className="font-display text-5xl font-extrabold italic leading-none tracking-tight text-balance sm:text-7xl">
          Outrun the cops. Or bet they won&apos;t.
        </h1>
        <p className="max-w-xl text-base text-balance text-text/85 sm:text-lg">
          A fully onchain getaway. Markets settle the second the run ends.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href={FIRST_CHANNEL}
            className="rounded-md bg-neon-pink px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-[#e0267a]"
          >
            Drive
          </Link>
          <Link
            href={FIRST_CHANNEL}
            className="rounded-md border border-white/25 bg-black/30 px-6 py-3 text-base font-semibold backdrop-blur transition-colors hover:border-white/50"
          >
            Watch live
          </Link>
        </div>
        <p className="text-xs text-muted">Demo run: a bot drives the real simulation, offline.</p>
      </div>
    </section>
  );
}
