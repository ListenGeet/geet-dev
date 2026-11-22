'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useMe } from '@/components/auth/MeProvider';

export type Language = 'en' | 'pa' | 'hi';
type Key =
  | 'home'
  | 'search'
  | 'library'
  | 'friends'
  | 'ask'
  | 'signIn'
  | 'signUp'
  | 'play'
  | 'pause'
  | 'loading'
  | 'nothing'
  | 'songsSoon'
  | 'newOnGeet'
  | 'popularWeek'
  | 'popularArtists'
  | 'searchPlaceholder'
  | 'tryAgain'
  | 'keepBrowsing'
  | 'previewStrip';

const copy: Record<Language, Record<Key, string>> = {
  en: {
    home: 'Home',
    search: 'Search',
    library: 'Library',
    friends: 'Friends',
    ask: 'Ask',
    signIn: 'Sign in',
    signUp: 'Sign up',
    play: 'Play',
    pause: 'Pause',
    loading: 'Loading',
    nothing: 'Nothing here yet',
    songsSoon: 'Songs will appear here soon.',
    newOnGeet: 'New on Geet',
    popularWeek: 'Popular this week',
    popularArtists: 'Popular artists',
    searchPlaceholder: 'Songs, artists',
    tryAgain: 'Try again',
    keepBrowsing: 'Keep browsing',
    previewStrip: "You're hearing 40-second previews.",
  },
  pa: {
    home: 'ਮੁੱਖ ਪੰਨਾ',
    search: 'ਖੋਜ',
    library: 'ਲਾਇਬ੍ਰੇਰੀ',
    friends: 'ਦੋਸਤ',
    ask: 'ਪੁੱਛੋ',
    signIn: 'ਸਾਈਨ ਇਨ',
    signUp: 'ਖਾਤਾ ਬਣਾਓ',
    play: 'ਚਲਾਓ',
    pause: 'ਰੋਕੋ',
    loading: 'ਲੋਡ ਹੋ ਰਿਹਾ ਹੈ',
    nothing: 'ਹਾਲੇ ਇੱਥੇ ਕੁਝ ਨਹੀਂ',
    songsSoon: 'ਗੀਤ ਜਲਦੀ ਇੱਥੇ ਆਉਣਗੇ।',
    newOnGeet: 'Geet ਉੱਤੇ ਨਵੇਂ',
    popularWeek: 'ਇਸ ਹਫ਼ਤੇ ਦੇ ਪ੍ਰਸਿੱਧ',
    popularArtists: 'ਪ੍ਰਸਿੱਧ ਕਲਾਕਾਰ',
    searchPlaceholder: 'ਗੀਤ, ਕਲਾਕਾਰ',
    tryAgain: 'ਫਿਰ ਕੋਸ਼ਿਸ਼ ਕਰੋ',
    keepBrowsing: 'ਦੇਖਦੇ ਰਹੋ',
    previewStrip: 'ਤੁਸੀਂ 40 ਸਕਿੰਟ ਦੇ ਪ੍ਰੀਵਿਊ ਸੁਣ ਰਹੇ ਹੋ।',
  },
  hi: {
    home: 'होम',
    search: 'खोजें',
    library: 'लाइब्रेरी',
    friends: 'दोस्त',
    ask: 'पूछें',
    signIn: 'साइन इन',
    signUp: 'खाता बनाएँ',
    play: 'चलाएँ',
    pause: 'रोकें',
    loading: 'लोड हो रहा है',
    nothing: 'यहाँ अभी कुछ नहीं है',
    songsSoon: 'गीत जल्द यहाँ दिखेंगे।',
    newOnGeet: 'Geet पर नए',
    popularWeek: 'इस हफ़्ते लोकप्रिय',
    popularArtists: 'लोकप्रिय कलाकार',
    searchPlaceholder: 'गीत, कलाकार',
    tryAgain: 'फिर कोशिश करें',
    keepBrowsing: 'देखते रहें',
    previewStrip: 'आप 40 सेकंड के प्रीव्यू सुन रहे हैं।',
  },
};

interface LocaleState {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: Key) => string;
}

const Context = createContext<LocaleState | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { me, api } = useMe();
  const [language, setLanguageState] = useState<Language>('en');
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem('geet-language');
    } catch {
      /* storage may be disabled */
    }
    const available = ['en', 'pa', 'hi'];
    const preferred = navigator.language.toLowerCase().startsWith('pa')
      ? 'pa'
      : navigator.language.toLowerCase().startsWith('hi')
        ? 'hi'
        : 'en';
    const next = (me?.language ??
      (available.includes(saved ?? '') ? saved : preferred)) as Language;
    setLanguageState(next);
    document.documentElement.lang = next;
  }, [me?.language]);
  const setLanguage = useCallback(
    (next: Language) => {
      setLanguageState(next);
      try {
        localStorage.setItem('geet-language', next);
      } catch {
        /* storage may be disabled */
      }
      document.documentElement.lang = next;
      if (me)
        void api('/api/me', { method: 'PATCH', body: { language: next } }).catch(() => undefined);
    },
    [api, me],
  );
  const value = useMemo(
    () => ({ language, setLanguage, t: (key: Key) => copy[language][key] }),
    [language, setLanguage],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useLocale() {
  const value = useContext(Context);
  if (!value) throw new Error('useLocale must be used inside LocaleProvider');
  return value;
}
