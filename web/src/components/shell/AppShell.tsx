'use client';

import {
  ArrowLeft,
  ArrowRight,
  Books,
  Bell,
  ChatCircleDots,
  House,
  MagnifyingGlass,
  UserCircle,
  UsersThree,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { AccountMenu } from '@/components/auth/AccountMenu';
import { Icon } from '@/components/Icon';
import { useMe } from '@/components/auth/MeProvider';
import { PlayerChrome } from '@/components/player/PlayerChrome';
import { usePlayer } from '@/components/player/PlayerProvider';
import { useLocale, type Language } from '@/lib/locale';

const tabs = [
  { href: '/', key: 'home' as const, Icon: House },
  { href: '/search', key: 'search' as const, Icon: MagnifyingGlass },
  { href: '/library', key: 'library' as const, Icon: Books },
  { href: '/friends', key: 'friends' as const, Icon: UsersThree },
  { href: '/assistant', key: 'ask' as const, Icon: ChatCircleDots },
];

function AskMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 5.5h16v11H11l-4.5 3v-3H4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M8 13v-3m4 4V8m4 5v-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function activePath(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

function SearchControl({
  mobile = false,
  inputRef,
}: {
  mobile?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { api, status } = useMe();
  const params = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search);
  const [value, setValue] = useState(params?.get('q') ?? '');
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (pathname === '/search')
      setValue(new URLSearchParams(window.location.search).get('q') ?? '');
    const sync = (event: Event) => setValue((event as CustomEvent<string>).detail ?? '');
    window.addEventListener('geet:search-value', sync);
    return () => window.removeEventListener('geet:search-value', sync);
  }, [pathname]);
  const submit = (next: string) => {
    setValue(next);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const q = next.trim();
      router.push(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
    }, 250);
  };
  return (
    <label className={`shell-search ${mobile ? 'shell-search-mobile' : ''}`}>
      <Icon icon={MagnifyingGlass} size={20} />
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => submit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') submit('');
          if (event.key === 'Enter') {
            if (value.trim()) {
              if (status === 'guest') {
                try {
                  const recent = JSON.parse(
                    localStorage.getItem('geet-searches') ?? '[]',
                  ) as string[];
                  localStorage.setItem(
                    'geet-searches',
                    JSON.stringify(
                      [value.trim(), ...recent.filter((item) => item !== value.trim())].slice(0, 8),
                    ),
                  );
                } catch {
                  /* storage can be unavailable */
                }
              } else {
                void api('/api/search/history', {
                  method: 'POST',
                  body: { query: value.trim() },
                }).catch(() => undefined);
              }
            }
            router.push(value.trim() ? `/search?q=${encodeURIComponent(value.trim())}` : '/search');
          }
        }}
        id="header-search"
        name="q"
        placeholder="Songs, artists"
        aria-label="Search songs and artists"
      />
      {value ? (
        <button type="button" aria-label="Clear search" onClick={() => submit('')}>
          ×
        </button>
      ) : mobile ? null : (
        <kbd>/</kbd>
      )}
    </label>
  );
}

function AskTab({ active, label }: { active: boolean; label: string }) {
  return (
    <span className="tab-icon" aria-label={label}>
      <AskMark />
      {active ? <span className="active-tab-bar" /> : null}
    </span>
  );
}

function NavItems({ mode }: { mode: 'bottom' | 'rail' | 'side' }) {
  const pathname = usePathname();
  const { t } = useLocale();
  return (
    <nav className={`shell-nav shell-nav-${mode}`} aria-label="Main navigation">
      {tabs.map(({ href, key, Icon: Glyph }) => {
        const active = activePath(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className={`nav-item ${active ? 'nav-active' : ''}`}
            aria-current={active ? 'page' : undefined}
            onClick={(event) => {
              if (active && href === '/') {
                event.preventDefault();
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }
            }}
          >
            {key === 'ask' ? (
              <AskTab active={active} label={t(key)} />
            ) : (
              <span className="tab-icon">
                <Icon icon={Glyph} on={active} />
                {active ? <span className="active-tab-bar" /> : null}
              </span>
            )}
            <span className="nav-label">{t(key)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function LanguageSwitcher() {
  const { language, setLanguage } = useLocale();
  const options: { value: Language; label: string }[] = [
    { value: 'en', label: 'English' },
    { value: 'pa', label: 'ਪੰਜਾਬੀ' },
    { value: 'hi', label: 'हिन्दी' },
  ];
  return (
    <div className="language-switcher" aria-label="Language">
      {options.map((item, index) => (
        <span key={item.value}>
          <button
            className={language === item.value ? 'language-current' : ''}
            type="button"
            aria-pressed={language === item.value}
            onClick={() => setLanguage(item.value)}
          >
            {item.label}
          </button>
          {index < options.length - 1 ? <span aria-hidden="true"> · </span> : null}
        </span>
      ))}
    </div>
  );
}

function Footer() {
  const { t } = useLocale();
  const { me } = useMe();
  return (
    <footer className="site-footer">
      <div className="footer-columns">
        <div className="footer-brand">
          <img src="/brand/geet-wordmark-white-bars.png" alt="Geet" width={67} height={22} />
          <p>
            Music sounds <span>better together.</span>
          </p>
        </div>
        <div>
          <h2>Listen</h2>
          <Link href="/">Home</Link>
          <Link href="/search">Search</Link>
          {me?.role === 'admin' ? <Link href="/upload">Upload a song</Link> : null}
        </div>
        <div>
          <h2>Help</h2>
          <Link href="/copyright">Report a song</Link>
          <Link href="/copyright">Copyright and takedowns</Link>
          <a href="mailto:hello@listengeet.com">Contact</a>
        </div>
        <div>
          <h2>Legal and open source</h2>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <a href="https://github.com/listengeet/geet">Open source</a>
          <Link href="/copyright">Licence</Link>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© 2026 Geet</span>
        <LanguageSwitcher />
      </div>
      <span className="sr-only">{t('home')}</span>
    </footer>
  );
}

function DesktopHeader({ togglePanel }: { togglePanel: () => void }) {
  const router = useRouter();
  const { status } = useMe();
  const player = usePlayer();
  const [shortcutOpen, setShortcutOpen] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const playerRef = useRef(player);
  playerRef.current = player;
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const current = playerRef.current;
      if (window.innerWidth < 1024) return;
      if (
        event.target instanceof HTMLElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)
      )
        return;
      if (event.key === '/' && search.current) {
        event.preventDefault();
        search.current.focus();
      }
      if (event.key === '?') {
        event.preventDefault();
        setShortcutOpen(true);
      }
      if (event.code === 'Space') {
        event.preventDefault();
        void current.toggle();
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        if (event.shiftKey) void current.next();
        else current.seek(current.currentTime + 5);
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        if (event.shiftKey) void current.previous();
        else current.seek(current.currentTime - 5);
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        current.setVolume(current.volume + 0.05);
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        current.setVolume(current.volume - 0.05);
      }
      if (event.key.toLowerCase() === 'm') current.setVolume(current.muted ? 1 : 0);
      if (event.key.toLowerCase() === 'l' && !current.isSignedIn) current.openGate('favourite');
      if (event.key.toLowerCase() === 'q') {
        if (current.isSignedIn) current.showQueue(true);
        else current.openGate('playlist');
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);
  return (
    <>
      <header className="desktop-header">
        <button className="btn-icon header-history" aria-label="Back" onClick={() => router.back()}>
          <Icon icon={ArrowLeft} />
        </button>
        <button
          className="btn-icon header-history"
          aria-label="Forward"
          onClick={() => router.forward()}
        >
          <Icon icon={ArrowRight} />
        </button>
        <SearchControl inputRef={search} />
        <div className="header-spacer" />
        {status === 'guest' ? (
          <>
            <Link className="header-signin" href="/sign-in">
              Sign up
            </Link>
            <Link className="btn btn-primary btn-sm" href="/sign-in">
              Log in
            </Link>
          </>
        ) : (
          <>
            <button className="btn-icon" aria-label="Notifications">
              <Icon icon={Bell} />
            </button>
            <AccountMenu />
          </>
        )}
        <button
          className="btn-icon panel-toggle"
          aria-label="Toggle right panel"
          onClick={togglePanel}
        >
          <Icon icon={UserCircle} />
        </button>
      </header>
      {shortcutOpen ? (
        <div className="dialog-backdrop" onClick={() => setShortcutOpen(false)}>
          <section
            className="shortcuts-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Keyboard shortcuts"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="btn-icon dialog-close"
              aria-label="Close"
              onClick={() => setShortcutOpen(false)}
            >
              ×
            </button>
            <h2>Keyboard shortcuts</h2>
            <p>
              <kbd>Space</kbd> Play or pause
            </p>
            <p>
              <kbd>←</kbd> <kbd>→</kbd> Seek 5 seconds
            </p>
            <p>
              <kbd>Shift</kbd> + arrow Previous or next
            </p>
            <p>
              <kbd>M</kbd> Mute · <kbd>/</kbd> Search · <kbd>Q</kbd> Queue
            </p>
          </section>
        </div>
      ) : null}
    </>
  );
}

function RightPanel({
  tab,
  setTab,
  close,
}: {
  tab: string;
  setTab: (tab: string) => void;
  close: () => void;
}) {
  const player = usePlayer();
  return (
    <aside className="right-panel">
      <div className="right-panel-tabs">
        <button className={tab === 'now' ? 'right-tab-active' : ''} onClick={() => setTab('now')}>
          Now playing
        </button>
        <button
          className={tab === 'queue' ? 'right-tab-active' : ''}
          onClick={() => setTab('queue')}
        >
          Queue
        </button>
        <button
          className={tab === 'friends' ? 'right-tab-active' : ''}
          onClick={() => setTab('friends')}
        >
          Friends
        </button>
        <button className="btn-icon" aria-label="Close panel" onClick={close}>
          ×
        </button>
      </div>
      {tab === 'queue' ? (
        <div className="right-panel-content">
          <h2>Queue</h2>
          {player.track ? (
            <p>
              {player.track.title}
              <br />
              <span>{player.track.artist}</span>
            </p>
          ) : (
            <p>Play a song to see what's next.</p>
          )}
        </div>
      ) : tab === 'friends' ? (
        <div className="right-panel-content">
          <h2>Friends</h2>
          <p>Nobody's listening right now.</p>
        </div>
      ) : (
        <div className="right-panel-content">
          {player.track ? (
            <>
              <img src={player.track.coverUrl ?? '/illustrations/cover-fallback.svg'} alt="" />
              <h2>{player.track.title}</h2>
              <p>{player.track.artist}</p>
              <button className="btn-secondary" onClick={() => void player.showLyrics()}>
                Open lyrics
              </button>
            </>
          ) : (
            <p>Nothing is playing.</p>
          )}
        </div>
      )}
    </aside>
  );
}

function pageTitle(pathname: string) {
  if (pathname === '/search') return 'Search';
  if (pathname === '/library') return 'Library';
  if (pathname.startsWith('/friends')) return 'Friends';
  if (pathname === '/assistant') return 'Ask Geet';
  if (pathname.startsWith('/artist/')) return 'Artist';
  if (pathname.startsWith('/t/')) return 'Song';
  if (pathname.startsWith('/u/')) return 'Profile';
  return pathname.split('/').filter(Boolean).at(-1)?.replaceAll('-', ' ') ?? 'Geet';
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { t } = useLocale();
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState('now');
  const [scrolled, setScrolled] = useState(false);
  const [toast, setToast] = useState('');
  const [offline, setOffline] = useState(false);
  const { status } = useMe();
  const bare =
    pathname.startsWith('/sign-in') ||
    pathname.startsWith('/sign-up') ||
    pathname === '/onboarding';
  const title = pageTitle(pathname);
  const showFooter =
    pathname === '/' ||
    pathname.startsWith('/t/') ||
    pathname.startsWith('/u/') ||
    ['/terms', '/privacy', '/copyright'].includes(pathname);

  useEffect(() => {
    setOffline(!navigator.onLine);
    const connection = () => setOffline(!navigator.onLine);
    try {
      setPanelOpen(localStorage.getItem('geet-right-panel') === '1');
    } catch {
      /* storage can be unavailable */
    }
    const listen = () =>
      setPanelOpen((open) => {
        const next = !open;
        localStorage.setItem('geet-right-panel', next ? '1' : '0');
        return next;
      });
    const scroll = () => setScrolled(window.scrollY > 0);
    let toastTimer = 0;
    const showToast = (event: Event) => {
      setToast(String((event as CustomEvent<string>).detail ?? ''));
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => setToast(''), 4000);
    };
    window.addEventListener('geet:right-panel-toggle', listen);
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('geet:toast', showToast);
    return () => {
      window.removeEventListener('geet:right-panel-toggle', listen);
      window.removeEventListener('online', connection);
      window.removeEventListener('offline', connection);
      window.removeEventListener('scroll', scroll);
      window.removeEventListener('geet:toast', showToast);
      window.clearTimeout(toastTimer);
    };
  }, []);

  if (bare) return <>{children}</>;
  return (
    <div className={`app-shell ${scrolled ? 'has-scrolled' : ''}`}>
      <header className="phone-header">
        <Link href="/" aria-label="Geet home">
          <img src="/brand/geet-wordmark-white-bars.png" alt="Geet" width={62} height={20} />
        </Link>
        <span className="phone-title">{pathname === '/' ? '' : title}</span>
        <div className="phone-account">
          {status === 'guest' ? (
            <>
              <Link className="phone-signin" href="/sign-in">
                {t('signIn')}
              </Link>
              <Link className="btn btn-primary btn-sm" href="/sign-up">
                {t('signUp')}
              </Link>
            </>
          ) : (
            <>
              <button className="btn-icon" aria-label="Notifications">
                <Icon icon={Bell} />
              </button>
              <AccountMenu />
            </>
          )}
        </div>
      </header>
      {offline ? (
        <div className="offline-banner" role="status">
          You’re offline · Downloads are available in Your Library
        </div>
      ) : null}
      <div className="tablet-rail">
        <Link className="rail-logo" href="/" aria-label="Geet home">
          <img src="/icons/icon-192.png" alt="" width={40} height={40} />
        </Link>
        <NavItems mode="rail" />
        <div className="rail-account">
          <AccountMenu />
        </div>
      </div>
      <aside className="desktop-sidebar">
        <Link className="sidebar-logo" href="/">
          <img src="/brand/geet-wordmark-white.png" alt="Geet" width={92} height={30} />
        </Link>
        <NavItems mode="side" />
        <div className="sidebar-library">
          <h2>Your library</h2>
          <Link href="/library">Favourites</Link>
          <Link href="/library">Downloads</Link>
        </div>
        <div className="sidebar-bottom">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <span>© 2026 Geet</span>
        </div>
      </aside>
      <div className="shell-center">
        <DesktopHeader
          togglePanel={() => window.dispatchEvent(new Event('geet:right-panel-toggle'))}
        />
        <div className="shell-columns">
          <main className="app-main">
            <div className="mobile-search-wrap">
              {pathname === '/search' ? <SearchControl mobile /> : null}
            </div>
            {children}
            {showFooter ? <Footer /> : null}
          </main>
          {panelOpen && (
            <RightPanel
              tab={panelTab}
              setTab={(next) => {
                setPanelTab(next);
                localStorage.setItem('geet-right-tab', next);
              }}
              close={() => setPanelOpen(false)}
            />
          )}
        </div>
      </div>
      <PlayerChrome />
      <NavItems mode="bottom" />
      {toast ? (
        <div className="app-toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
