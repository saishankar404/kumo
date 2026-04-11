import { useEffect, useRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, ArrowUpRight01Icon, Tag01Icon, HighlighterIcon, Note01Icon } from "@hugeicons/core-free-icons";
import gsap from "gsap";
import { Paper, Highlight, Note } from "@/types";

const fontStack = "'GT Walsheim Pro', 'Satoshi', system-ui, -apple-system, sans-serif";

interface PaperInfoPanelProps {
  paper: Paper;
  highlights?: Highlight[];
  notes?: Note[];
  tags?: string[];
  open: boolean;
  onClose: () => void;
}

const PaperInfoPanel = ({ paper, highlights = [], notes = [], tags = [], open, onClose }: PaperInfoPanelProps) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      // Panel slide in
      gsap.fromTo(
        panelRef.current,
        { x: '100%' },
        { x: 0, duration: 0.3, ease: 'power3.out' }
      );
      
      // Backdrop dim
      gsap.to(backdropRef.current, {
        opacity: 0.4,
        duration: 0.3,
        ease: 'power2.out'
      });
    } else if (panelRef.current && backdropRef.current) {
      // Panel slide out
      gsap.to(panelRef.current, {
        x: '100%',
        duration: 0.3,
        ease: 'power3.in'
      });
      
      // Backdrop fade out
      gsap.to(backdropRef.current, {
        opacity: 0,
        duration: 0.3,
        ease: 'power2.in'
      });
    }
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        className="fixed inset-0 bg-black opacity-0 pointer-events-none z-40"
        style={{ pointerEvents: open ? 'auto' : 'none' }}
        role="button"
        tabIndex={0}
        aria-label="Close panel"
        onClick={onClose}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed right-0 top-0 h-full w-[25vw] border-l border-border rounded-l-3xl overflow-hidden z-50 flex flex-col"
        style={{ boxShadow: "-8px 0 40px rgba(0,0,0,0.08)", transform: 'translateX(100%)', backgroundColor: "#F6F6F6" }}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-border flex items-start justify-between">
          <div className="flex-1">
            <h2
              className="text-base font-bold text-foreground leading-tight mb-1"
              style={{ fontFamily: fontStack }}
            >
              {paper.title}
            </h2>
            <p className="text-xs text-muted-foreground">
              {paper.authors.slice(0, 2).join(", ")}
              {paper.authors.length > 2 && " et al."}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close panel"
            className="w-11 h-11 rounded-full hover:bg-accent flex items-center justify-center transition-colors flex-shrink-0 ml-3"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.8} className="text-muted-foreground" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Highlights Section */}
          {highlights.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <HugeiconsIcon icon={HighlighterIcon} size={16} strokeWidth={1.8} className="text-muted-foreground" />
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Highlights ({highlights.length})
                </h3>
              </div>
              <div className="space-y-2">
                {highlights.map((highlight) => (
                  <div
                    key={highlight.id}
                    className="p-3 rounded-xl"
                    style={{ backgroundColor: highlight.color + "40" }}
                  >
                    <p className="text-xs text-foreground leading-relaxed mb-1">{highlight.text}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">Page {highlight.page}</span>
                      {highlight.tags && highlight.tags.length > 0 && (
                        <div className="flex gap-1">
                          {highlight.tags.map((tag) => (
                            <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full bg-background text-muted-foreground">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes Section */}
          {notes.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <HugeiconsIcon icon={Note01Icon} size={16} strokeWidth={1.8} className="text-muted-foreground" />
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Notes ({notes.length})
                </h3>
              </div>
              <div className="space-y-2">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="p-3 rounded-xl bg-accent/30"
                  >
                    <p className="text-xs text-foreground leading-relaxed">{note.text}</p>
                    <span className="text-[10px] text-muted-foreground mt-1 block">
                      {new Date(note.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tags Section */}
          {tags.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <HugeiconsIcon icon={Tag01Icon} size={16} strokeWidth={1.8} className="text-muted-foreground" />
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Tags
                </h3>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-2.5 py-1 rounded-full bg-accent text-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Paper Info Section */}
          <div>
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">
              Paper Info
            </h3>
            <div className="space-y-2 text-xs">
              <div>
                <span className="text-muted-foreground">Published:</span>
                <span className="text-foreground ml-2">{paper.date}</span>
              </div>
              {paper.journal && (
                <div>
                  <span className="text-muted-foreground">Journal:</span>
                  <span className="text-foreground ml-2">{paper.journal}</span>
                </div>
              )}
              {paper.citations !== undefined && (
                <div>
                  <span className="text-muted-foreground">Citations:</span>
                  <span className="text-foreground ml-2">{paper.citations}</span>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Authors:</span>
                <p className="text-foreground mt-1 leading-relaxed">
                  {paper.authors.join(", ")}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer with Open Paper CTA */}
        <div className="px-6 py-4 border-t border-border">
          <button
            onClick={() => paper.url && window.open(paper.url, '_blank')}
            disabled={!paper.url}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ fontFamily: fontStack }}
          >
            <span>Open Paper</span>
            <HugeiconsIcon icon={ArrowUpRight01Icon} size={16} strokeWidth={2} />
          </button>
        </div>
      </div>
    </>
  );
};

export default PaperInfoPanel;
