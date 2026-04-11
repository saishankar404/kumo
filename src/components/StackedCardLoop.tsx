import { useEffect, useMemo, useRef } from "react";
import { gsap } from "gsap";
import { InertiaPlugin } from "gsap/InertiaPlugin";

gsap.registerPlugin(InertiaPlugin);

type StackedCardLoopProps = {
  className?: string;
  fontFamily?: string;
};

type CardDefinition = {
  className: string;
  content: JSX.Element;
};

const DEFAULT_FONT_STACK = "'GT Walsheim Pro', 'Satoshi', system-ui, -apple-system, sans-serif";

const CARD_IMAGES = [
  { src: "/card-1.png", alt: "Research card one" },
  { src: "/card-2.jpeg", alt: "Research card two" },
  { src: "/card-3.jpeg", alt: "Research card three" },
  { src: "/card-4.jpeg", alt: "Research card four" },
  { src: "/card-5.jpeg", alt: "Research card five" },
  { src: "/card-6.jpeg", alt: "Research card six" },
  { src: "/card-7.jpg", alt: "Research card seven" },
] as const;

const CARD_DATA: CardDefinition[] = CARD_IMAGES.map((image) => ({
  className: "fp-loop-card-photo",
  content: (
    <img
      className="fp-loop-card-image"
      src={image.src}
      alt={image.alt}
      loading="lazy"
      decoding="async"
    />
  ),
}));

const StackedCardLoop = ({ className, fontFamily = DEFAULT_FONT_STACK }: StackedCardLoopProps) => {
  const interactionRef = useRef<HTMLDivElement>(null);
  const galleryRef = useRef<HTMLDivElement>(null);

  const sequenceCards = useMemo(() => {
    return CARD_DATA.slice(0, 7);
  }, []);

  const loopCards = useMemo(() => {
    return [...sequenceCards, ...sequenceCards, ...sequenceCards];
  }, [sequenceCards]);

  useEffect(() => {
    const interaction = interactionRef.current;
    const gallery = galleryRef.current;

    if (!interaction || !gallery) return;

    const cards = Array.from(gallery.querySelectorAll<HTMLElement>(".fp-loop-card"));
    if (cards.length === 0) return;

    const allowHoverInertia = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const hoverTimelines = new Map<HTMLElement, gsap.core.Timeline>();
    const hoverStates = new Map<HTMLElement, { x: number; y: number; rotation: number }>();
    const hoverHandlers: Array<{ card: HTMLElement; handler: () => void }> = [];

    let oldX: number | null = null;
    let oldY: number | null = null;
    let deltaX = 0;
    let deltaY = 0;

    const trackMouseDelta = (event: PointerEvent) => {
      if (oldX === null || oldY === null) {
        oldX = event.clientX;
        oldY = event.clientY;
        return;
      }
      deltaX = event.clientX - oldX;
      deltaY = event.clientY - oldY;
      oldX = event.clientX;
      oldY = event.clientY;
    };

    if (allowHoverInertia) {
      interaction.addEventListener("pointermove", trackMouseDelta);

      cards.forEach((card) => {
        hoverStates.set(card, { x: 0, y: 0, rotation: 0 });

        const onPointerEnter = () => {
          if (isDragging) return;

          const state = hoverStates.get(card);
          if (!state) return;

          const existing = hoverTimelines.get(card);
          if (existing) {
            existing.kill();
            hoverTimelines.delete(card);
          }

          const timeline = gsap.timeline({
            onComplete: () => {
              hoverTimelines.delete(card);
              timeline.kill();
            },
          });

          timeline.timeScale(1.2);
          timeline.to(state, {
            inertia: {
              x: { velocity: deltaX * 30, end: 0 },
              y: { velocity: deltaY * 30, end: 0 },
            },
          });
          timeline.fromTo(
            state,
            { rotation: 0 },
            {
              duration: 0.4,
              rotation: (Math.random() - 0.5) * 24,
              yoyo: true,
              repeat: 1,
              ease: "power1.inOut",
            },
            "<",
          );

          hoverTimelines.set(card, timeline);
        };

        hoverHandlers.push({ card, handler: onPointerEnter });
        card.addEventListener("pointerenter", onPointerEnter);
      });
    }

    let targetX = 0;
    let currentX = 0;
    const ease = 0.08;

    const baseSpeed = 1.0;
    let velocity = baseSpeed;

    let isDragging = false;
    let lastPointerX = 0;
    let dragVelocity = 0;
    const itemWidth = 160;
    const totalWidth = cards.length * itemWidth;
    const wrap = gsap.utils.wrap(0, totalWidth);

    const renderFrame = () => {
      let tilt = (velocity - baseSpeed) * -0.2;
      tilt = Math.max(-20, Math.min(20, tilt));

      cards.forEach((card, i) => {
        const hoverState = hoverStates.get(card);
        const hoverX = hoverState?.x ?? 0;
        const hoverY = hoverState?.y ?? 0;
        const hoverRotation = hoverState?.rotation ?? 0;

        const rawX = currentX + i * itemWidth;
        const wrappedX = wrap(rawX);
        const centeredX = wrappedX - totalWidth / 2;
        const xMap = centeredX / 660;
        const clampedXMap = Math.max(-1.6, Math.min(1.6, xMap));
        const absClampedX = Math.abs(clampedXMap);
        const edgeT = Math.min(absClampedX / 1.6, 1);

        const yPos = (1 - Math.cos(edgeT * (Math.PI / 2))) * 84;
        const rot = Math.sin((clampedXMap / 1.6) * (Math.PI / 2)) * 18;
        const scale = 1.06 - absClampedX * 0.065;

        const nearCenter = Math.max(0, 1 - Math.abs(centeredX) / 260);
        const centerEase = nearCenter * nearCenter * (3 - 2 * nearCenter);
        const leftFavor = (1 - Math.tanh(centeredX / 78)) / 2;
        const playfulPop = centerEase * leftFavor;

        const poppedScale = scale + playfulPop * 0.115;
        const poppedY = yPos - playfulPop * 20;
        const poppedRot = rot * (1 - playfulPop * 0.62);

        const absX = Math.abs(xMap);
        const fadeStart = 1.0;
        const fadeEnd = 1.28;
        const minOpacity = 0.18;
        const opacity = absX <= fadeStart
          ? 1
          : absX >= fadeEnd
            ? minOpacity
            : 1 - (1 - minOpacity) * ((absX - fadeStart) / (fadeEnd - fadeStart));

        const z = Math.round(1000 - Math.abs(centeredX) + centerEase * 90 + playfulPop * 240);

        gsap.set(card, {
          x: centeredX + hoverX,
          y: poppedY + hoverY,
          rotation: poppedRot + tilt + hoverRotation,
          scale: poppedScale,
          zIndex: z,
          opacity,
          xPercent: -50,
          yPercent: -50,
        });
      });
    };

    renderFrame();

    const handleDragStart = (x: number) => {
      isDragging = true;
      lastPointerX = x;
      dragVelocity = 0;
      interaction.classList.add("is-dragging");
    };

    const handleDragMove = (x: number) => {
      if (!isDragging) return;
      const delta = x - lastPointerX;
      lastPointerX = x;
      dragVelocity = delta;
      targetX += delta * 1.5;
    };

    const handleDragEnd = () => {
      if (!isDragging) return;
      isDragging = false;
      velocity = dragVelocity * 0.8;
      interaction.classList.remove("is-dragging");
    };

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      handleDragStart(event.clientX);
    };

    const onMouseMove = (event: MouseEvent) => {
      if (!isDragging) return;
      handleDragMove(event.clientX);
    };

    const onMouseUp = () => {
      handleDragEnd();
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 0) return;
      handleDragStart(event.touches[0].clientX);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!isDragging || event.touches.length === 0) return;
      handleDragMove(event.touches[0].clientX);
    };

    const onTouchEnd = () => {
      handleDragEnd();
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      let delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      delta = Math.max(-80, Math.min(80, delta));
      velocity -= delta * 0.05;
    };

    interaction.addEventListener("mousedown", onMouseDown);
    interaction.addEventListener("touchstart", onTouchStart, { passive: true });
    interaction.addEventListener("touchmove", onTouchMove, { passive: true });
    interaction.addEventListener("touchend", onTouchEnd);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    interaction.addEventListener("wheel", onWheel, { passive: false });

    const tick = () => {
      if (!isDragging) {
        velocity += (baseSpeed - velocity) * 0.05;
        targetX += velocity;
      }

      currentX += (targetX - currentX) * ease;
      renderFrame();
    };

    gsap.ticker.add(tick);

    return () => {
      gsap.ticker.remove(tick);
      interaction.classList.remove("is-dragging");
      if (allowHoverInertia) {
        interaction.removeEventListener("pointermove", trackMouseDelta);
      }
      hoverHandlers.forEach(({ card, handler }) => {
        card.removeEventListener("pointerenter", handler);
      });
      hoverTimelines.forEach((timeline) => timeline.kill());
      hoverTimelines.clear();
      hoverStates.clear();
      interaction.removeEventListener("mousedown", onMouseDown);
      interaction.removeEventListener("touchstart", onTouchStart);
      interaction.removeEventListener("touchmove", onTouchMove);
      interaction.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      interaction.removeEventListener("wheel", onWheel);
    };
  }, []);

  return (
    <div className={["fp-loop-wrap", className].filter(Boolean).join(" ")} style={{ fontFamily }}>
      <div
        ref={interactionRef}
        className="fp-loop-interaction"
        role="presentation"
        aria-label="Draggable stacked cards loop"
      >
        <div ref={galleryRef} className="fp-loop-gallery">
          {loopCards.map((card, index) => (
            <div key={`${card.className}-${index}`} className={`fp-loop-card ${card.className}`}>
              {card.content}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StackedCardLoop;
