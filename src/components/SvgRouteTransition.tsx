import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import gsap from "gsap";

const TRANSITION_PATH =
  "M13.4746 291.27C13.4746 291.27 100.646 -18.6724 255.617 16.8418C410.588 52.356 61.0296 431.197 233.017 546.326C431.659 679.299 444.494 21.0125 652.73 100.784C860.967 180.556 468.663 430.709 617.216 546.326C765.769 661.944 819.097 48.2722 988.501 120.156C1174.21 198.957 809.424 543.841 988.501 636.726C1189.37 740.915 1301.67 149.213 1301.67 149.213";

export type SvgRouteTransitionHandle = {
  playOut: () => Promise<void>;
  playIn: () => Promise<void>;
  reset: () => void;
};

type SvgRouteTransitionProps = {
  reducedMotion?: boolean;
};

const MOBILE_BREAKPOINT = 768;

const getAnimationConfig = () => {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT;
  if (isMobile) {
    return {
      overlayDuration: 0.8,
      pathDuration: 2.5,
      ease: "power2.inOut" as const,
    };
  }
  return {
    overlayDuration: 0.5,
    pathDuration: 1.5,
    ease: "power2.inOut" as const,
  };
};

const SvgRouteTransition = forwardRef<SvgRouteTransitionHandle, SvgRouteTransitionProps>(
  ({ reducedMotion = false }, ref) => {
    const overlayRef = useRef<HTMLDivElement>(null);
    const pathRef = useRef<SVGPathElement>(null);
    const timelineRef = useRef<gsap.core.Timeline | null>(null);
    const pathLengthRef = useRef(0);

    const stopTimeline = useCallback(() => {
      timelineRef.current?.kill();
      timelineRef.current = null;
    }, []);

    const reset = useCallback(() => {
      const overlay = overlayRef.current;
      const path = pathRef.current;
      if (!overlay || !path) return;

      const length = pathLengthRef.current || path.getTotalLength();
      pathLengthRef.current = length;

      gsap.set(overlay, { opacity: 0 });
      gsap.set(path, {
        strokeDasharray: `${length} ${length}`,
        strokeDashoffset: length,
        strokeWidth: 2,
      });
    }, []);

    useEffect(() => {
      reset();
      return () => stopTimeline();
    }, [reset, stopTimeline]);

    const playOut = useCallback(() => {
      if (reducedMotion) {
        reset();
        return Promise.resolve();
      }

      const overlay = overlayRef.current;
      const path = pathRef.current;
      if (!overlay || !path) return Promise.resolve();

      stopTimeline();

      const length = pathLengthRef.current || path.getTotalLength();
      pathLengthRef.current = length;
      const config = getAnimationConfig();

      return new Promise<void>((resolve) => {
        const timeline = gsap.timeline({
          onComplete: () => {
            timelineRef.current = null;
            resolve();
          },
        });

        timelineRef.current = timeline;
        timeline
          .to(
            overlay,
            {
              opacity: 1,
              duration: config.overlayDuration,
              ease: config.ease,
            },
            0,
          )
          .to(
            path,
            {
              strokeDashoffset: 0,
              strokeWidth: 300,
              duration: config.pathDuration,
              ease: config.ease,
            },
            0,
          );
      });
    }, [reducedMotion, reset, stopTimeline]);

    const playIn = useCallback(() => {
      if (reducedMotion) {
        reset();
        return Promise.resolve();
      }

      const overlay = overlayRef.current;
      const path = pathRef.current;
      if (!overlay || !path) return Promise.resolve();

      stopTimeline();

      const length = pathLengthRef.current || path.getTotalLength();
      pathLengthRef.current = length;
      const config = getAnimationConfig();

      return new Promise<void>((resolve) => {
        const timeline = gsap.timeline({
          onComplete: () => {
            timelineRef.current = null;
            reset();
            resolve();
          },
        });

        timelineRef.current = timeline;
        timeline
          .to(path, {
            strokeDasharray: `0 ${length}`,
            strokeDashoffset: 0,
            strokeWidth: 2,
            duration: config.pathDuration,
            ease: config.ease,
          })
          .to(
            overlay,
            {
              opacity: 0,
              duration: config.overlayDuration,
              ease: config.ease,
            },
            1,
          );
      });
    }, [reducedMotion, reset, stopTimeline]);

    useImperativeHandle(ref, () => ({ playOut, playIn, reset }), [playOut, playIn, reset]);

    return (
      <div
        ref={overlayRef}
        className="pointer-events-none fixed inset-0 z-[999] flex items-center justify-center opacity-0"
        aria-hidden="true"
      >
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 1316 664"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-full w-full scale-[1.3]"
          preserveAspectRatio="xMidYMid slice"
        >
          <path
            ref={pathRef}
            d={TRANSITION_PATH}
            stroke="#82A0FF"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  },
);

SvgRouteTransition.displayName = "SvgRouteTransition";

export default SvgRouteTransition;
