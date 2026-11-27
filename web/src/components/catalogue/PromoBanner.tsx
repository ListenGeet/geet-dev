'use client';

import { ArrowUpRight } from '@phosphor-icons/react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/Icon';

export interface Promo {
  id: string;
  kicker: string;
  title: string;
  buttonLabel: string;
  imageUrl: string;
  link: string;
}

export default function PromoBanner({ promos }: { promos: Promo[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const touchStart = useRef<number | null>(null);
  const current = promos[index];
  const external = current?.link.startsWith('https://') ?? false;

  useEffect(() => setIndex(0), [promos.length]);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotion = () => setReducedMotion(motion.matches);
    const syncVisibility = () => setHidden(document.visibilityState !== 'visible');
    syncMotion();
    syncVisibility();
    motion.addEventListener('change', syncMotion);
    document.addEventListener('visibilitychange', syncVisibility);
    return () => {
      motion.removeEventListener('change', syncMotion);
      document.removeEventListener('visibilitychange', syncVisibility);
    };
  }, []);

  useEffect(() => {
    if (promos.length < 2 || paused || hidden || reducedMotion) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % promos.length), 6000);
    return () => window.clearInterval(timer);
  }, [hidden, paused, promos.length, reducedMotion]);

  if (!current) return null;
  const banner = (
    <>
      <Image
        className="promo-image"
        src={current.imageUrl}
        alt=""
        fill
        sizes="(max-width: 767px) 100vw, 1200px"
        unoptimized
        priority={index === 0}
      />
      <span className="promo-scrim" aria-hidden="true" />
      <span className="promo-copy">
        <span className="promo-kicker">{current.kicker || 'FEATURED'}</span>
        <strong>{current.title}</strong>
        {current.buttonLabel ? (
          <span className="promo-cta">
            {current.buttonLabel}
            {external ? <Icon icon={ArrowUpRight} size={16} /> : null}
          </span>
        ) : null}
      </span>
    </>
  );

  return (
    <section
      className="promo-wrap"
      aria-label="Featured announcements"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
      }}
      onPointerDown={(event) => {
        if (event.pointerType === 'touch') {
          touchStart.current = event.clientX;
          setPaused(true);
        }
      }}
      onPointerUp={(event) => {
        if (event.pointerType !== 'touch' || touchStart.current === null) return;
        const distance = event.clientX - touchStart.current;
        if (Math.abs(distance) > 48 && promos.length > 1)
          setIndex((value) => (value + (distance < 0 ? 1 : promos.length - 1)) % promos.length);
        touchStart.current = null;
        window.setTimeout(() => setPaused(false), 1800);
      }}
    >
      <div className="promo-banner">
        {external ? (
          <a
            className="promo-link"
            href={current.link}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${current.title} — ${current.buttonLabel || 'Listen'} (opens in a new tab)`}
          >
            {banner}
          </a>
        ) : (
          <Link className="promo-link" href={current.link}>
            {banner}
          </Link>
        )}
      </div>
      {promos.length > 1 ? (
        <div className="promo-indicators" aria-label="Choose announcement">
          {promos.map((promo, itemIndex) => (
            <button
              type="button"
              key={promo.id}
              aria-label={`Show announcement ${itemIndex + 1} of ${promos.length}`}
              aria-pressed={itemIndex === index}
              onClick={() => setIndex(itemIndex)}
            >
              <span className={itemIndex === index ? 'is-current' : ''} />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
