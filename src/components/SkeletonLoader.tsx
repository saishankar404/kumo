import { useEffect, useRef } from "react";
import gsap from "gsap";

interface SkeletonLoaderProps {
  count?: number;
  type?: 'result' | 'card' | 'highlight';
}

const SkeletonLoader = ({ count = 5, type = 'result' }: SkeletonLoaderProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const shimmerElements = containerRef.current.querySelectorAll('.shimmer');
    
    shimmerElements.forEach((el) => {
      gsap.fromTo(
        el,
        { backgroundPosition: '200% 0' },
        {
          backgroundPosition: '-200% 0',
          duration: 1.2,
          ease: 'none',
          repeat: -1,
        }
      );
    });
  }, []);

  const renderResultSkeleton = () => (
    <div className="w-full px-4 py-3.5 rounded-2xl bg-card border border-border">
      <div className="flex items-center gap-2 mb-2">
        <div 
          className="shimmer h-2 w-2 rounded-full bg-muted"
          style={{
            background: 'linear-gradient(90deg, hsl(var(--muted)/0.5) 25%, hsl(var(--muted)/0.8) 50%, hsl(var(--muted)/0.5) 75%)',
            backgroundSize: '200% 100%',
          }}
        />
        <div 
          className="shimmer h-3 flex-1 rounded bg-muted"
          style={{
            background: 'linear-gradient(90deg, hsl(var(--muted)/0.5) 25%, hsl(var(--muted)/0.8) 50%, hsl(var(--muted)/0.5) 75%)',
            backgroundSize: '200% 100%',
          }}
        />
      </div>
      <div 
        className="shimmer h-4 w-3/4 mb-2 rounded bg-muted"
        style={{
          background: 'linear-gradient(90deg, hsl(var(--muted)/0.5) 25%, hsl(var(--muted)/0.8) 50%, hsl(var(--muted)/0.5) 75%)',
          backgroundSize: '200% 100%',
        }}
      />
      <div 
        className="shimmer h-3 w-full mb-1 rounded bg-muted"
        style={{
          background: 'linear-gradient(90deg, hsl(var(--muted)/0.5) 25%, hsl(var(--muted)/0.8) 50%, hsl(var(--muted)/0.5) 75%)',
          backgroundSize: '200% 100%',
        }}
      />
      <div 
        className="shimmer h-3 w-5/6 rounded bg-muted"
        style={{
          background: 'linear-gradient(90deg, hsl(var(--muted)/0.5) 25%, hsl(var(--muted)/0.8) 50%, hsl(var(--muted)/0.5) 75%)',
          backgroundSize: '200% 100%',
        }}
      />
      <div className="flex gap-1.5 mt-2">
        <div 
          className="shimmer h-4 w-12 rounded-full bg-muted"
          style={{
            background: 'linear-gradient(90deg, hsl(var(--muted)/0.5) 25%, hsl(var(--muted)/0.8) 50%, hsl(var(--muted)/0.5) 75%)',
            backgroundSize: '200% 100%',
          }}
        />
        <div 
          className="shimmer h-4 w-16 rounded-full bg-muted"
          style={{
            background: 'linear-gradient(90deg, hsl(var(--muted)/0.5) 25%, hsl(var(--muted)/0.8) 50%, hsl(var(--muted)/0.5) 75%)',
            backgroundSize: '200% 100%',
          }}
        />
      </div>
    </div>
  );

  const renderCardSkeleton = () => (
    <div className="rounded-3xl overflow-hidden bg-card border border-border" style={{ aspectRatio: '3/4' }}>
      <div 
        className="shimmer w-full h-2/3 bg-muted"
        style={{
          background: 'linear-gradient(90deg, hsl(var(--muted)/0.5) 25%, hsl(var(--muted)/0.8) 50%, hsl(var(--muted)/0.5) 75%)',
          backgroundSize: '200% 100%',
        }}
      />
      <div className="p-4">
        <div 
          className="shimmer h-4 w-3/4 mb-2 rounded bg-muted"
          style={{
            background: 'linear-gradient(90deg, hsl(var(--muted)/0.5) 25%, hsl(var(--muted)/0.8) 50%, hsl(var(--muted)/0.5) 75%)',
            backgroundSize: '200% 100%',
          }}
        />
        <div 
          className="shimmer h-3 w-1/2 rounded bg-muted"
          style={{
            background: 'linear-gradient(90deg, hsl(var(--muted)/0.5) 25%, hsl(var(--muted)/0.8) 50%, hsl(var(--muted)/0.5) 75%)',
            backgroundSize: '200% 100%',
          }}
        />
      </div>
    </div>
  );

  const renderHighlightSkeleton = () => (
    <div className="w-full px-4 py-3.5 rounded-2xl bg-card">
      <div className="flex items-center gap-2 mb-1.5">
        <div 
          className="shimmer w-2 h-2 rounded-full bg-muted"
          style={{
            background: 'linear-gradient(90deg, hsl(var(--muted)/0.5) 25%, hsl(var(--muted)/0.8) 50%, hsl(var(--muted)/0.5) 75%)',
            backgroundSize: '200% 100%',
          }}
        />
        <div 
          className="shimmer h-2.5 flex-1 rounded bg-muted"
          style={{
            background: 'linear-gradient(90deg, hsl(var(--muted)/0.5) 25%, hsl(var(--muted)/0.8) 50%, hsl(var(--muted)/0.5) 75%)',
            backgroundSize: '200% 100%',
          }}
        />
      </div>
      <div 
        className="shimmer h-3 w-full mb-1 rounded bg-muted"
        style={{
          background: 'linear-gradient(90deg, hsl(var(--muted)/0.5) 25%, hsl(var(--muted)/0.8) 50%, hsl(var(--muted)/0.5) 75%)',
          backgroundSize: '200% 100%',
        }}
      />
      <div 
        className="shimmer h-3 w-4/5 rounded bg-muted"
        style={{
          background: 'linear-gradient(90deg, hsl(var(--muted)/0.5) 25%, hsl(var(--muted)/0.8) 50%, hsl(var(--muted)/0.5) 75%)',
          backgroundSize: '200% 100%',
        }}
      />
    </div>
  );

  const renderSkeleton = () => {
    switch (type) {
      case 'card':
        return renderCardSkeleton();
      case 'highlight':
        return renderHighlightSkeleton();
      case 'result':
      default:
        return renderResultSkeleton();
    }
  };

  return (
    <div ref={containerRef} className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>{renderSkeleton()}</div>
      ))}
    </div>
  );
};

export default SkeletonLoader;
