import { preprocessQuery } from './search-engine';

export interface HighlightMatch {
  start: number;
  end: number;
  text: string;
}

export function extractSearchTerms(query: string): string[] {
  const cleaned = preprocessQuery(query);
  if (!cleaned) return [];

  const terms: string[] = [];
  
  const quotedMatches = cleaned.match(/"([^"]+)"/g);
  if (quotedMatches) {
    quotedMatches.forEach(match => {
      const term = match.replace(/"/g, '').trim();
      if (term) terms.push(term.toLowerCase());
    });
  }

  const withoutQuotes = cleaned.replace(/"[^"]+"/g, '').trim();
  const words = withoutQuotes.split(/\s+/).filter(w => w.length > 2);
  
  const stopWords = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'own', 'say', 'she', 'too', 'use', 'from', 'this', 'that', 'with', 'have', 'will', 'your', 'than', 'them', 'been', 'will', 'would', 'there', 'their', 'what', 'about', 'which', 'when', 'make', 'like', 'time', 'just', 'know', 'take', 'people', 'into', 'year', 'good', 'some', 'could', 'them', 'see', 'other', 'than', 'then', 'look', 'only', 'come', 'over', 'such', 'also', 'back', 'after', 'use', 'first', 'paper', 'study', 'research', 'method', 'result', 'based', 'using', 'using', 'proposed']);
  
  words.forEach(word => {
    const cleanWord = word.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanWord.length > 2 && !stopWords.has(cleanWord)) {
      terms.push(cleanWord);
    }
  });

  return [...new Set(terms)].slice(0, 8);
}

export function findHighlightMatches(text: string, query: string): HighlightMatch[] {
  const terms = extractSearchTerms(query);
  if (terms.length === 0) return [];

  const matches: HighlightMatch[] = [];
  const lowerText = text.toLowerCase();

  terms.forEach(term => {
    let start = 0;
    while (true) {
      const idx = lowerText.indexOf(term, start);
      if (idx === -1) break;
      
      const beforeChar = idx === 0 ? ' ' : lowerText[idx - 1];
      const afterChar = idx + term.length >= lowerText.length ? ' ' : lowerText[idx + term.length];
      
      const isWordBoundary = /[^a-z0-9]/.test(beforeChar) && /[^a-z0-9]/.test(afterChar);
      
      if (isWordBoundary || term.length > 4) {
        matches.push({
          start: idx,
          end: idx + term.length,
          text: text.substring(idx, idx + term.length),
        });
      }
      
      start = idx + term.length;
    }
  });

  matches.sort((a, b) => a.start - b.start);

  const merged: HighlightMatch[] = [];
  for (const match of matches) {
    const last = merged[merged.length - 1];
    if (last && match.start <= last.end) {
      last.end = Math.max(last.end, match.end);
      last.text = text.substring(last.start, last.end);
    } else {
      merged.push({ ...match });
    }
  }

  return merged.slice(0, 12);
}

export function highlightAbstractWithMatches(text: string, matches: HighlightMatch[]): string {
  if (matches.length === 0) return escapeHtml(text);

  let result = '';
  let lastEnd = 0;

  matches.forEach(match => {
    if (match.start > lastEnd) {
      result += escapeHtml(text.substring(lastEnd, match.start));
    }
    result += `<mark class="highlight-match">${escapeHtml(match.text)}</mark>`;
    lastEnd = match.end;
  });

  if (lastEnd < text.length) {
    result += escapeHtml(text.substring(lastEnd));
  }

  return result;
}

export function highlightAbstract(text: string, query: string): string {
  const matches = findHighlightMatches(text, query);
  return highlightAbstractWithMatches(text, matches);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function getHighlightedTerms(query: string): string[] {
  return extractSearchTerms(query);
}