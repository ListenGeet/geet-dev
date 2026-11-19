import { Equalizer } from '@/components/Equalizer';

/** Phase 0 placeholder: black page, the Geet logo, the equalizer. The catalogue arrives in Phase 3. */
export default function Page() {
  return (
    <main className="stage">
      <h1 className="logo">
        <img
          src="/brand/geet-wordmark-white.png"
          width={1168}
          height={381}
          alt="Geet"
          style={{ width: 'min(240px, 60vw)', height: 'auto' }}
        />
      </h1>
      <Equalizer size={48} />
    </main>
  );
}
