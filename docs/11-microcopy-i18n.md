# 11 · Microcopy and languages

## Voice
Plain, warm, short. Like a friend who works at the music shop, not a product page.
- Short sentences. Verbs first on buttons: **Play**, **Add friend**, **Create playlist**.
- Say what happened, then what to do.
- No exclamation marks, no emoji in UI text, no "Oops", "Whoops", "Awesome", "Unleash", "Seamless", "Supercharge", "magic".
- Never blame the user. Never fake enthusiasm.
- Numbers are real. "12 songs", never "lots of songs".
- The tagline "Music sounds better together." appears only in the footer, sign-in page, OG image, and the store listing description.

## Languages
UI: **English (default), ਪੰਜਾਬੀ, हिन्दी.** Switcher in footer and Profile. Stored in `profiles.language` (guests: local storage plus the `Accept-Language` header on first visit). Translations in message files per locale; Next.js internationalization without changing URLs (language is a preference, not a path).
- Brand name stays "Geet" in Latin script in all languages; the word "ਗੀਤ" / "गीत" (song) appears in copy where natural.
- Dates and numbers: use the locale's formatting; keep digits Latin (0-9) in all three UI languages for readability and consistency with song durations.
- Content is not translated: titles, artists, lyrics show as uploaded.

## Core strings

| Key | English | ਪੰਜਾਬੀ | हिन्दी |
|---|---|---|---|
| nav.home | Home | ਮੁੱਖ ਪੰਨਾ | होम |
| nav.search | Search | ਖੋਜ | खोजें |
| nav.library | Library | ਲਾਇਬ੍ਰੇਰੀ | लाइब्रेरी |
| nav.friends | Friends | ਦੋਸਤ | दोस्त |
| nav.ask | Ask | ਪੁੱਛੋ | पूछें |
| action.play | Play | ਚਲਾਓ | चलाएँ |
| action.pause | Pause | ਰੋਕੋ | रोकें |
| action.shuffle | Shuffle | ਮਿਲਾ ਕੇ ਚਲਾਓ | मिलाकर चलाएँ |
| action.signin | Sign in | ਸਾਈਨ ਇਨ | साइन इन |
| action.signup | Sign up | ਖਾਤਾ ਬਣਾਓ | खाता बनाएँ |
| action.signout | Sign out | ਸਾਈਨ ਆਊਟ | साइन आउट |
| action.cancel | Cancel | ਰੱਦ ਕਰੋ | रद्द करें |
| action.save | Save | ਸੰਭਾਲੋ | सहेजें |
| action.retry | Try again | ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ | फिर कोशिश करें |
| action.remove | Remove | ਹਟਾਓ | हटाएँ |
| action.report | Report this song | ਇਸ ਗੀਤ ਦੀ ਰਿਪੋਰਟ ਕਰੋ | इस गीत की रिपोर्ट करें |
| lib.favourites | Favourites | ਪਸੰਦੀਦਾ | पसंदीदा |
| lib.playlists | Playlists | ਪਲੇਲਿਸਟਾਂ | प्लेलिस्ट |
| lib.downloads | Downloads | ਡਾਊਨਲੋਡ | डाउनलोड |
| lib.history | History | ਇਤਿਹਾਸ | इतिहास |
| lib.create | Create playlist | ਪਲੇਲਿਸਟ ਬਣਾਓ | प्लेलिस्ट बनाएँ |
| search.placeholder | Songs, artists | ਗੀਤ, ਕਲਾਕਾਰ | गीत, कलाकार |
| guest.strip | You're hearing 40-second previews. | ਤੁਸੀਂ 40 ਸਕਿੰਟ ਦੇ ਝਲਕ ਸੁਣ ਰਹੇ ਹੋ। | आप 40 सेकंड की झलक सुन रहे हैं। |
| gate.title | Want the rest of this song? | ਪੂਰਾ ਗੀਤ ਸੁਣਨਾ ਹੈ? | पूरा गीत सुनना है? |
| gate.body | Sign in free to hear full songs, build playlists and listen with friends. | ਮੁਫ਼ਤ ਸਾਈਨ ਇਨ ਕਰੋ ਅਤੇ ਪੂਰੇ ਗੀਤ ਸੁਣੋ, ਪਲੇਲਿਸਟਾਂ ਬਣਾਓ ਅਤੇ ਦੋਸਤਾਂ ਨਾਲ ਸੁਣੋ। | मुफ़्त साइन इन करें और पूरे गीत सुनें, प्लेलिस्ट बनाएँ और दोस्तों के साथ सुनें। |
| gate.keep | Keep browsing | ਦੇਖਦੇ ਰਹੋ | देखते रहें |
| tagline | Music sounds better together. | ਸੰਗੀਤ ਸਾਥ ਵਿੱਚ ਹੋਰ ਵੀ ਸੋਹਣਾ ਲੱਗਦਾ ਹੈ। | संगीत साथ में और भी अच्छा लगता है। |
| friends.add | Add friend | ਦੋਸਤ ਜੋੜੋ | दोस्त जोड़ें |
| friends.accept | Accept | ਮਨਜ਼ੂਰ ਕਰੋ | स्वीकार करें |
| friends.decline | Decline | ਰੱਦ ਕਰੋ | अस्वीकार करें |
| chat.placeholder | Message | ਸੁਨੇਹਾ | संदेश |
| chat.seen | Seen | ਦੇਖਿਆ | देखा |
| jam.start | Start a jam | ਜੈਮ ਸ਼ੁਰੂ ਕਰੋ | जैम शुरू करें |
| jam.join | Join | ਸ਼ਾਮਲ ਹੋਵੋ | जुड़ें |
| jam.leave | Leave jam | ਜੈਮ ਛੱਡੋ | जैम छोड़ें |
| jam.host | Host controls playback | ਹੋਸਟ ਗੀਤ ਚਲਾਉਂਦਾ ਹੈ | होस्ट गीत नियंत्रित करता है |
| ask.title | Ask Geet | ਗੀਤ ਨੂੰ ਪੁੱਛੋ | गीत से पूछें |
| ask.sub | Only knows songs on Geet. | ਸਿਰਫ਼ Geet ਦੇ ਗੀਤਾਂ ਬਾਰੇ ਜਾਣਦਾ ਹੈ। | केवल Geet के गीतों के बारे में जानता है। |
| ask.placeholder | Ask for a song, mood or playlist | ਕੋਈ ਗੀਤ, ਮੂਡ ਜਾਂ ਪਲੇਲਿਸਟ ਮੰਗੋ | कोई गीत, मूड या प्लेलिस्ट माँगें |
| offline.banner | You're offline. Saved songs still play. | ਤੁਸੀਂ ਆਫ਼ਲਾਈਨ ਹੋ। ਸੰਭਾਲੇ ਗੀਤ ਚੱਲਦੇ ਰਹਿਣਗੇ। | आप ऑफ़लाइन हैं। सहेजे गए गीत चलते रहेंगे। |
| err.generic | Couldn't load this | ਇਹ ਲੋਡ ਨਹੀਂ ਹੋ ਸਕਿਆ | यह लोड नहीं हो सका |
| player.unavailable | Unavailable | ਉਪਲਬਧ ਨਹੀਂ | उपलब्ध नहीं |

**Native review needed.** These are drafts. Particular points for the reviewer: "ਝਲਕ / झलक" for "preview", "ਜੈਮ / जैम" for "jam" (a loanword; alternatives welcome), and the tagline phrasing.

## Notification texts (push and in-app)
| Event | Title | Body |
|---|---|---|
| Friend request | Friend request | {name} wants to be friends on Geet. |
| Accepted | {name} accepted | You're now friends. |
| Message | {name} | {first 80 chars} (track: "Sent you a song: {title}") |
| Suggestion | {name} suggested a song | {title} by {artist} |
| Jam invite | {name} invited you to a jam | Tap to join. |

Push payloads contain no private message text if the user chose "Hide message previews" (a v2 setting; v1 always shows the first 80 characters).

## Report reasons (fixed list)
Copyright · Wrong or misleading info · Offensive or hateful · Spam · Other (with a text box, max 500).

## Confirm dialogs
| Action | Title | Button |
|---|---|---|
| Delete playlist | Delete “{name}”? | Delete playlist |
| Remove friend | Remove {name}? | Remove friend |
| Block | Block {name}? They won't be able to find or message you. | Block |
| Clear history | Clear your listening history? | Clear history |
| Remove all downloads | Remove all downloaded songs from this device? | Remove all |
| Delete my upload | Delete “{title}”? It will be removed from Geet for everyone. | Delete song |
| Admin remove | Remove “{title}”? Its audio and cover are deleted and it disappears everywhere. | Remove song |
| Delete account | Delete your account? Type DELETE to confirm. | Delete account |
| End jam | End this jam for everyone? | End jam |

## SEO and store text
- Title pattern: `{Page} · Geet`. Home: "Geet · Music sounds better together".
- Meta description (home): "Free music with friends. Listen together, build playlists, and save songs for offline."
- Manifest description (provided): "Free music with friends."
