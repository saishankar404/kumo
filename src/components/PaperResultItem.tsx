import { Paper } from "@/types";

const fontStack = "'GT Walsheim Pro', 'Satoshi', system-ui, -apple-system, sans-serif";

interface PaperResultItemProps {
  paper: Paper;
  onClick: (paper: Paper) => void;
}

const PaperResultItem = ({ paper, onClick }: PaperResultItemProps) => {
  return (
    <button
      onClick={() => onClick(paper)}
      className="w-full text-left px-4 py-3.5 rounded-2xl transition-colors hover:bg-accent/50 bg-card border border-border"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
        <p className="text-[11px] text-muted-foreground truncate">
          {paper.authors.slice(0, 3).join(", ")}
          {paper.authors.length > 3 && " et al."}
        </p>
        <span className="text-[10px] text-muted-foreground ml-auto">{paper.date}</span>
      </div>
      
      <h3 
        className="text-sm font-medium text-foreground leading-snug mb-1.5"
        style={{ fontFamily: fontStack }}
      >
        {paper.title}
      </h3>
      
      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
        {paper.description}
      </p>
      
      {paper.journal && (
        <div className="flex items-center gap-2 mt-2">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-background text-muted-foreground">
            {paper.journal}
          </span>
          {paper.citations && (
            <span className="text-[10px] text-muted-foreground">
              {paper.citations} citations
            </span>
          )}
        </div>
      )}
    </button>
  );
};

export default PaperResultItem;
