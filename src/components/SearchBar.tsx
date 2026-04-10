import { useState, useRef, useEffect } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, File01Icon, Tag01Icon, Clock01Icon } from "@hugeicons/core-free-icons";
import gsap from "gsap";

const fontStack = "'GT Walsheim Pro', 'Satoshi', system-ui, -apple-system, sans-serif";

interface SearchBarProps {
  onSearch: (query: string) => void;
  initialQuery?: string;
  placeholder?: string;
}

const recentSearches = [
  { icon: Clock01Icon, label: "Transformer architecture" },
  { icon: Clock01Icon, label: "BERT pre-training" },
  { icon: Clock01Icon, label: "Diffusion models" },
];

const suggestions = [
  { icon: File01Icon, label: "Attention Is All You Need", type: "Paper" },
  { icon: Tag01Icon, label: "Machine Learning", type: "Tag" },
  { icon: File01Icon, label: "Neural Network Pruning", type: "Paper" },
  { icon: Tag01Icon, label: "NLP", type: "Tag" },
];

const SearchBar = ({ onSearch, initialQuery = "", placeholder = "Search papers, collections, highlights..." }: SearchBarProps) => {
  const [query, setQuery] = useState(initialQuery);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
    }
  }, [initialQuery]);

  useEffect(() => {
    if (showDropdown && dropdownRef.current) {
      gsap.fromTo(
        dropdownRef.current,
        { opacity: 0, y: -10, scale: 0.97 },
        { opacity: 1, y: 0, scale: 1, duration: 0.25, ease: "power3.out" }
      );
    }
  }, [showDropdown]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) && e.target !== inputRef.current) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
      setShowDropdown(false);
    }
  };

  const handleSuggestionClick = (label: string) => {
    setQuery(label);
    onSearch(label);
    setShowDropdown(false);
  };

  return (
    <div className="relative w-full">
      <form onSubmit={handleSubmit} className="relative">
        <div className="flex items-center gap-3 px-5 py-3.5 border border-border rounded-2xl bg-card hover:border-accent transition-colors">
          <HugeiconsIcon icon={Search01Icon} size={20} strokeWidth={1.8} className="text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setShowDropdown(true)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            style={{ fontFamily: fontStack }}
          />
          <kbd className="hidden sm:inline-flex h-6 items-center gap-1 rounded-md border border-border px-2 text-[10px] text-muted-foreground">
            ⏎
          </kbd>
        </div>
      </form>

      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-2 bg-card rounded-2xl border border-border overflow-hidden z-50"
          style={{ boxShadow: "0 24px 80px rgba(0,0,0,0.12)" }}
        >
          {/* Recent */}
          {recentSearches.length > 0 && (
            <div className="px-5 py-3">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Recent</p>
              {recentSearches.map((item, i) => (
                <button
                  key={i}
                  onClick={() => handleSuggestionClick(item.label)}
                  aria-label={`Search for ${item.label}`}
                  className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm text-foreground hover:bg-accent/60 transition-colors"
                >
                  <HugeiconsIcon icon={item.icon} size={16} strokeWidth={1.8} className="text-muted-foreground" />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div className="px-5 py-3 border-t border-border">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Suggestions</p>
              {suggestions.map((item, i) => (
                <button
                  key={i}
                  onClick={() => handleSuggestionClick(item.label)}
                  aria-label={`Search for ${item.label}`}
                  className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-sm text-foreground hover:bg-accent/60 transition-colors"
                >
                  <HugeiconsIcon icon={item.icon} size={16} strokeWidth={1.8} className="text-muted-foreground" />
                  <span className="flex-1 text-left">{item.label}</span>
                  <span className="text-[11px] text-muted-foreground">{item.type}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
