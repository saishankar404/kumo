import { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { Paper } from "@/types";

const fontStack = "'GT Walsheim Pro', 'Satoshi', system-ui, -apple-system, sans-serif";

interface CollectionCardSpreadProps {
  papers: Paper[];
  onCardClick: (paper: Paper) => void;
  triggerAnimation: boolean;
}

type NodePos = { x: number; y: number; rotation: number };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const CollectionCardSpread = ({ papers, onCardClick, triggerAnimation }: CollectionCardSpreadProps) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<(HTMLDivElement | null)[]>([]);

  const [camera, setCamera] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ active: boolean; startX: number; startY: number; camX: number; camY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    camX: 0,
    camY: 0,
  });

  const nodePositions = useMemo<NodePos[]>(() => {
    const cols = Math.ceil(Math.sqrt(papers.length));
    const spacingX = 290;
    const spacingY = 350;
    const startX = -((cols - 1) * spacingX) / 2;
    const rows = Math.ceil(papers.length / cols);
    const startY = -((rows - 1) * spacingY) / 2;

    return papers.map((_, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return {
        x: startX + col * spacingX,
        y: startY + row * spacingY,
        rotation: (Math.random() - 0.5) * 3,
      };
    });
  }, [papers]);

  useEffect(() => {
    if (!canvasRef.current) return;
    gsap.to(canvasRef.current, {
      x: camera.x,
      y: camera.y,
      duration: 0.28,
      ease: "power3.out",
    });
  }, [camera]);

  useEffect(() => {
    if (!triggerAnimation) return;
    cardsRef.current.forEach((card, index) => {
      if (!card) return;
      const target = nodePositions[index];
      gsap.fromTo(
        card,
        { x: 0, y: 0, rotation: 0, scale: 0.96, opacity: 0 },
        {
          x: target.x,
          y: target.y,
          rotation: target.rotation,
          scale: 1,
          opacity: 1,
          duration: 0.95,
          delay: index * 0.035,
          ease: "expo.out",
        },
      );
    });
  }, [triggerAnimation, nodePositions]);

  const onPointerDownCanvas = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-node='true']")) return;
    dragState.current.active = true;
    dragState.current.startX = e.clientX;
    dragState.current.startY = e.clientY;
    dragState.current.camX = camera.x;
    dragState.current.camY = camera.y;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMoveCanvas = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current.active) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setCamera({
      x: clamp(dragState.current.camX + dx, -220, 220),
      y: clamp(dragState.current.camY + dy, -140, 140),
    });
  };

  const onPointerUpCanvas = () => {
    dragState.current.active = false;
  };

  const onNodePointerDown = (index: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const node = cardsRef.current[index];
    if (!node || !viewportRef.current) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const startPos = gsap.getProperty(node, "x") as number;
    const startPosY = gsap.getProperty(node, "y") as number;
    let dragged = false;

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragged = true;
      gsap.set(node, { x: startPos + dx, y: startPosY + dy });
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!dragged) {
        onCardClick(papers[index]);
        return;
      }
      const target = nodePositions[index];
      gsap.to(node, {
        x: target.x,
        y: target.y,
        rotation: target.rotation,
        duration: 0.45,
        ease: "power3.out",
      });
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      ref={viewportRef}
      className="relative w-full h-full overflow-hidden"
      onPointerDown={onPointerDownCanvas}
      onPointerMove={onPointerMoveCanvas}
      onPointerUp={onPointerUpCanvas}
      style={{ background: "#F6F6F6" }}
    >
      <div ref={canvasRef} className="absolute inset-0 flex items-center justify-center">
        {papers.map((paper, index) => (
          <div
            key={paper.id}
            ref={(el) => (cardsRef.current[index] = el)}
            data-node="true"
            className="absolute cursor-grab active:cursor-grabbing"
            style={{ width: 236, height: 310 }}
            onPointerDown={onNodePointerDown(index)}
          >
            <div className="w-full h-full rounded-2xl border border-border bg-white overflow-hidden" style={{ boxShadow: "0 10px 30px rgba(0,0,0,0.08)" }}>
              <div className="h-[58%] bg-[#EEEEEE] flex items-center justify-center">
                <span className="text-4xl text-muted-foreground/25 font-semibold">{paper.title.charAt(0)}</span>
              </div>
              <div className="p-4 h-[42%]">
                <p className="text-[11px] text-muted-foreground">{paper.date}</p>
                <h3 className="text-sm font-semibold leading-tight mt-1 line-clamp-2" style={{ fontFamily: fontStack }}>{paper.title}</h3>
                <p className="text-xs text-muted-foreground mt-2 line-clamp-1">{paper.authors[0]}{paper.authors.length > 1 ? " et al." : ""}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CollectionCardSpread;
