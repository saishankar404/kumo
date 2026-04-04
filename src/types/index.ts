// Shared TypeScript types for Kumo application

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  date: string;
  description: string;
  url?: string;
  thumbnailUrl?: string;
  journal?: string;
  citations?: number;
}

export interface Highlight {
  id: string;
  text: string;
  page: number;
  color: string;
  paperId: string;
  paperTitle: string;
  createdAt: string;
  tags?: string[];
}

export interface Note {
  id: string;
  text: string;
  paperId: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  paperIds: string[];
  papers?: Paper[];
  color?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SearchSuggestion {
  id: string;
  label: string;
  type: 'paper' | 'tag' | 'collection' | 'recent';
  icon?: unknown; // HugeIcon type
  data?: unknown; // Additional data specific to the suggestion type
}

export interface Tag {
  id: string;
  name: string;
  color?: string;
  count?: number;
}
