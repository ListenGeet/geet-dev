const letters: Record<string, string> = {
  क: 'k',
  ख: 'kh',
  ग: 'g',
  घ: 'gh',
  ङ: 'n',
  च: 'ch',
  छ: 'chh',
  ज: 'j',
  झ: 'jh',
  ञ: 'n',
  ट: 't',
  ठ: 'th',
  ड: 'd',
  ढ: 'dh',
  ण: 'n',
  त: 't',
  थ: 'th',
  द: 'd',
  ध: 'dh',
  न: 'n',
  प: 'p',
  फ: 'ph',
  ब: 'b',
  भ: 'bh',
  म: 'm',
  य: 'y',
  र: 'r',
  ल: 'l',
  व: 'v',
  श: 'sh',
  ष: 'sh',
  स: 's',
  ह: 'h',
  क़: 'q',
  ख़: 'kh',
  ग़: 'gh',
  ज़: 'z',
  फ़: 'f',
  ड़: 'r',
  ढ़: 'rh',
  ਸ: 's',
  ਹ: 'h',
  ਕ: 'k',
  ਖ: 'kh',
  ਗ: 'g',
  ਘ: 'gh',
  ਙ: 'ng',
  ਚ: 'ch',
  ਛ: 'chh',
  ਜ: 'j',
  ਝ: 'jh',
  ਞ: 'ny',
  ਟ: 't',
  ਠ: 'th',
  ਡ: 'd',
  ਢ: 'dh',
  ਣ: 'n',
  ਤ: 't',
  ਥ: 'th',
  ਦ: 'd',
  ਧ: 'dh',
  ਨ: 'n',
  ਪ: 'p',
  ਫ: 'ph',
  ਬ: 'b',
  ਭ: 'bh',
  ਮ: 'm',
  ਯ: 'y',
  ਰ: 'r',
  ਲ: 'l',
  ਵ: 'v',
  ੜ: 'r',
  ਖ਼: 'kh',
  ਗ਼: 'gh',
  ਜ਼: 'z',
  ਫ਼: 'f',
  ਲ਼: 'l',
};

const matras: Record<string, string> = {
  'ा': 'aa',
  'ि': 'i',
  'ी': 'ee',
  'ु': 'u',
  'ू': 'oo',
  'े': 'e',
  'ै': 'ai',
  'ो': 'o',
  'ौ': 'au',
  'ृ': 'ri',
  'ਾ': 'aa',
  'ਿ': 'i',
  'ੀ': 'ee',
  'ੁ': 'u',
  'ੂ': 'oo',
  'ੇ': 'e',
  'ੈ': 'ai',
  'ੋ': 'o',
  'ੌ': 'au',
};

const independent: Record<string, string> = {
  ऋ: 'ri',
  अ: 'a',
  आ: 'aa',
  इ: 'i',
  ई: 'ee',
  उ: 'u',
  ऊ: 'oo',
  ए: 'e',
  ऐ: 'ai',
  ओ: 'o',
  औ: 'au',
  ੳ: 'u',
  ਅ: 'a',
  ੲ: 'i',
  ਆ: 'aa',
  ਇ: 'i',
  ਈ: 'ee',
  ਉ: 'u',
  ਊ: 'oo',
  ਏ: 'e',
  ਐ: 'ai',
  ਓ: 'o',
  ਔ: 'au',
};

/** A readable search key for Gurmukhi and Devanagari titles (ISO-like, optimized for common song spelling). */
export function romanizeIndic(value: string): string | null {
  if (!/[\u0900-\u097f\u0a00-\u0a7f]/u.test(value)) return null;
  const chars = Array.from(value.normalize('NFKC'));
  let output = '';
  for (const char of chars) {
    if (independent[char]) {
      output += independent[char];
    } else if (letters[char]) {
      output += `${letters[char]}a`;
    } else if (matras[char]) {
      output = output.endsWith('a') ? output.slice(0, -1) + matras[char] : output + matras[char];
    } else if (char === '्' || char === '੍') {
      if (output.endsWith('a')) output = output.slice(0, -1);
    } else if (char === 'ं' || char === 'ਂ' || char === 'ँ') {
      output += 'n';
    } else if (char === 'ः') {
      output += 'h';
    } else if (char === '़' || char === 'ੱ' || char === 'ੑ' || char === '੒' || char === '੓') {
      // Nukta, addak, and tone marks do not add a search letter.
    } else {
      output += char;
    }
  }
  return output
    .replace(/a(?=\b|$)/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLocaleLowerCase('en');
}
