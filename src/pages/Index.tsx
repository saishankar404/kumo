import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, Cancel01Icon, InformationCircleIcon, GithubIcon, CommandIcon, ClipboardIcon } from "@hugeicons/core-free-icons";
import { motion, AnimatePresence, useReducedMotion, LayoutGroup } from "framer-motion";
import StackedCardLoop from "@/components/StackedCardLoop";
import { captureHeroSearchSubmit } from "@/lib/posthog-client";

// =============================================================================
// ANIMATION PRINCIPLES APPLIED:
// 1. Squash & Stretch - Subtle scale deformation on button presses (0.95-1.05)
// 2. Anticipation - Slight scale down before actions, wind-up effects
// 3. Staging - One focal animation at a time, proper z-index hierarchy
// 4. Straight Ahead/Pose to Pose - Keyframe sequences for entrances
// 5. Follow Through & Overlapping - Staggered delays, overshoot with springs
// 6. Slow In/Slow Out - Ease-out for entrances, ease-in for exits
// 7. Arc - Curved motion paths where natural
// 8. Secondary Action - Shadow/glow changes supporting primary motion
// 9. Timing - Under 300ms for interactions, proper duration hierarchy
// 10. Exaggeration - Emphasized but not excessive movements
// 11. Solid Drawing - Consistent shadows, visual weight
// 12. Appeal - Polished, delightful character
// =============================================================================

// Shared spring configs for consistent physics (Principle 9: Timing consistency)
const springs = {
  // Snappy for interactions - under 200ms effective duration
  snappy: { type: "spring" as const, stiffness: 500, damping: 30, mass: 0.8 },
  // Bouncy for playful elements - adds character (Principle 12: Appeal)
  bouncy: { type: "spring" as const, stiffness: 400, damping: 20, mass: 0.6 },
  // Smooth for large movements
  smooth: { type: "spring" as const, stiffness: 300, damping: 28, mass: 1 },
  // Gentle for subtle changes
  gentle: { type: "spring" as const, stiffness: 200, damping: 20, mass: 0.8 },
};

// Easing curves following principles (Principle 6: Slow In/Slow Out)
const easings = {
  // Ease-out for entrances - fast start, gentle settle
  entrance: [0.22, 1, 0.36, 1] as [number, number, number, number],
  // Ease-in for exits - gentle start, fast finish  
  exit: [0.36, 0, 0.66, -0.56] as [number, number, number, number],
  // Ease-in-out for state transitions
  transition: [0.4, 0, 0.2, 1] as [number, number, number, number],
};

// =============================================================================
// PLACEHOLDER EXAMPLES FOR CALLIGRAPH
// Cycles through DOIs, paper titles, author names, keywords
// =============================================================================

const PLACEHOLDER_EXAMPLES = [
  "10.1038/nature12373",
  "Attention Is All You Need",
  "Yoshua Bengio",
  "transformer architecture",
  "10.1126/science.aaa8685",
  "CRISPR gene editing",
  "deep reinforcement learning",
  "Geoffrey Hinton",
  "10.1038/s41586-021-03819-2",
  "protein folding AlphaFold",
];

type InlineResult = {
  type: "paper" | "doi" | "author" | "keyword";
  primary: string;
  secondary: string;
};

const INLINE_RESULTS: InlineResult[] = [
  { type: "paper", primary: "Attention Is All You Need", secondary: "Vaswani et al. · 2017" },
  { type: "doi", primary: "10.1038/nature12373", secondary: "Nature · landmark citation" },
  { type: "author", primary: "Yoshua Bengio", secondary: "Author · deep learning" },
  { type: "keyword", primary: "transformer architecture", secondary: "Keyword · NLP" },
  { type: "paper", primary: "AlphaFold and protein folding", secondary: "Nature · computational biology" },
  { type: "doi", primary: "10.1126/science.aaa8685", secondary: "Science · high impact" },
  { type: "author", primary: "Geoffrey Hinton", secondary: "Author · neural networks" },
  { type: "keyword", primary: "CRISPR gene editing", secondary: "Keyword · biotechnology" },
];

// =============================================================================
// SOUND SYNTHESIS (Following audio rules)
// - context-reuse-single: Single AudioContext
// - envelope-exponential-decay: Natural decay curves
// - param-click-duration: 5-15ms for clicks
// - a11y-reduced-motion-check: Respect user preferences
// =============================================================================

let audioContext: AudioContext | null = null;
const soundLastPlayed = {
  click: 0,
  morph: 0,
  clear: 0,
  open: 0,
  close: 0,
};

function canPlaySound(kind: keyof typeof soundLastPlayed, minGapMs: number): boolean {
  const now = Date.now();
  if (now - soundLastPlayed[kind] < minGapMs) return false;
  soundLastPlayed[kind] = now;
  return true;
}

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

// Cleanup audio nodes after playback (context-cleanup-nodes)
function scheduleCleanup(nodes: AudioNode[], ctx: AudioContext, time: number) {
  setTimeout(() => {
    nodes.forEach(node => {
      try { node.disconnect(); } catch { /* no-op */ }
    });
  }, (time - ctx.currentTime) * 1000 + 50);
}

function playClickSound(prefersReducedMotion: boolean) {
  if (prefersReducedMotion) return; // a11y-reduced-motion-check
  if (!canPlaySound("click", 70)) return;

  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") ctx.resume();

    const t = ctx.currentTime;
    const duration = 0.012; // param-click-duration: 5-15ms

    // Filtered noise for percussive click (design-noise-for-percussion)
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    // Bandpass filter for character (design-filter-for-character)
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 4000; // param-filter-frequency-range
    filter.Q.value = 3; // param-q-value-range

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.06, t); // impl-default-subtle
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration); // envelope-exponential-decay

    noise.connect(filter).connect(gain).connect(ctx.destination);
    noise.start(t);
    noise.stop(t + duration);

    scheduleCleanup([noise, filter, gain], ctx, t + duration);
  } catch { /* no-op */ }
}

function playMorphSound(prefersReducedMotion: boolean) {
  if (prefersReducedMotion) return;
  if (!canPlaySound("morph", 90)) return;

  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") ctx.resume();

    const t = ctx.currentTime;
    const duration = 0.025;

    // Tonal sweep for morph (design-oscillator-for-tonal)
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(500, t); // envelope-set-initial-value
    osc.frequency.exponentialRampToValueAtTime(800, t + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration);

    scheduleCleanup([osc, gain], ctx, t + duration);
  } catch { /* no-op */ }
}

function playClearSound(prefersReducedMotion: boolean) {
  if (prefersReducedMotion) return;
  if (!canPlaySound("clear", 120)) return;

  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") ctx.resume();

    const t = ctx.currentTime;
    const duration = 0.02;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration);

    scheduleCleanup([osc, gain], ctx, t + duration);
  } catch { /* no-op */ }
}

// Dialog open sound - ascending tonal sweep (Principle 2: Anticipation)
function playOpenSound(prefersReducedMotion: boolean) {
  if (prefersReducedMotion) return;
  if (!canPlaySound("open", 180)) return;

  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") ctx.resume();

    const t = ctx.currentTime;
    const duration = 0.1;

    // Two oscillators for richer sound
    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(350, t);
    osc1.frequency.exponentialRampToValueAtTime(550, t + duration);

    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(700, t);
    osc2.frequency.exponentialRampToValueAtTime(1100, t + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.04, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + duration);
    osc2.stop(t + duration);

    scheduleCleanup([osc1, osc2, gain], ctx, t + duration);
  } catch { /* no-op */ }
}

// Dialog close sound - descending tonal sweep
function playCloseSound(prefersReducedMotion: boolean) {
  if (prefersReducedMotion) return;
  if (!canPlaySound("close", 180)) return;

  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") ctx.resume();

    const t = ctx.currentTime;
    const duration = 0.07;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(480, t);
    osc.frequency.exponentialRampToValueAtTime(320, t + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.035, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration);

    scheduleCleanup([osc, gain], ctx, t + duration);
  } catch { /* no-op */ }
}

// =============================================================================
// ANIMATION VARIANTS (Principle 4: Pose to Pose)
// =============================================================================

// Staggered children for hero text (Principle 5: Follow Through & Overlapping)
const heroContainerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.15, // physics-no-excessive-stagger: under 50ms ideally, but 150ms for cinematic
      delayChildren: 0.1,
    },
  },
};

const heroLineVariants = {
  hidden: {
    opacity: 0,
    y: 60,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.8,
      ease: easings.entrance, // Principle 6: Ease-out for entrance
    },
  },
};

const heroSubtitleVariants = {
  hidden: {
    opacity: 0,
    y: 24,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.62,
      ease: easings.entrance,
      delay: 0.34,
    },
  },
};

// Navbar variants with slight arc (Principle 7: Arc)
const navVariants = {
  hidden: { opacity: 0, y: -30, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.6,
      ease: easings.entrance,
    },
  },
};

// Search bar entrance (Principle 2: Anticipation with scale)
const searchBarVariants = {
  hidden: {
    opacity: 0,
    y: 40,
    scale: 0.9,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.7,
      ease: easings.entrance,
      delay: 0.52,
    },
  },
};

// Helper text fade (Principle 3: Staging - appears after main elements)
const helperTextVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: easings.entrance,
      delay: 0.84,
    },
  },
};

// Footer (last to appear - Principle 3: Staging hierarchy)
const footerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.6,
      delay: 0.9,
    },
  },
};

// =============================================================================
// DIALOG ANIMATION VARIANTS (Cinematic Full-Screen Takeover)
// =============================================================================

// Dark backdrop with blur - fades in during morph
const dialogBackdropVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.24,
      ease: easings.entrance,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.18,
      ease: easings.exit,
    },
  },
};

// Dialog children stagger variants (for helper text, pills)
const dialogChildVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.24,
      ease: easings.entrance,
    },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.15, ease: easings.exit },
  },
};

// Morph transition spring - used for layoutId animations
const morphSpring = {
  type: "spring" as const,
  stiffness: 350,
  damping: 32,
  mass: 1,
};

// =============================================================================
// FONT STACK CONSTANT
// =============================================================================
const fontStack = "'GT Walsheim Pro', 'Satoshi', system-ui, -apple-system, sans-serif";

const HERO_TITLES = [
  ["Knowledge should be", "as free as the air."],
  ["Search beyond", "every paywall."],
  ["Find the paper", "not the barrier."],
  ["Open science", "for everyone."],
];

// =============================================================================
// BUTTON INTERACTION VARIANTS (Principles 1, 2, 10: Squash/Stretch, Anticipation, Exaggeration)
// =============================================================================

// Subtle squash on press, stretch on release (Principle 1: Squash & Stretch)
const buttonTapVariants = {
  tap: {
    scale: 0.94,
    // Subtle squash effect
    scaleX: 1.02,
    scaleY: 0.96,
  },
  hover: {
    scale: 1.05,
    // Secondary action: shadow intensifies (Principle 8)
    boxShadow: "0 20px 40px -12px rgba(0, 0, 0, 0.25)",
  },
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

const Index = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [searchMode, setSearchMode] = useState<"morph" | "inline">("morph");
  const dialogTone: "dark" | "light" = "dark";
  const [isInlineFocused, setIsInlineFocused] = useState(false);
  const [activeInlineIndex, setActiveInlineIndex] = useState(0);
  const [heroTitleIndex, setHeroTitleIndex] = useState(0);
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const dialogInputRef = useRef<HTMLInputElement>(null);
  const prevHadQuery = useRef(false);
  const transitionLockRef = useRef(false);
  const toggleLockRef = useRef(false);

  // Respect reduced motion preference (a11y-reduced-motion-check)
  const prefersReducedMotion = useReducedMotion() ?? false;

  const withTransitionLock = useCallback((durationMs: number) => {
    transitionLockRef.current = true;
    window.setTimeout(() => {
      transitionLockRef.current = false;
    }, durationMs);
  }, []);

  const withToggleLock = useCallback((durationMs: number) => {
    toggleLockRef.current = true;
    window.setTimeout(() => {
      toggleLockRef.current = false;
    }, durationMs);
  }, []);

  // Global ⌘K keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;

      // Dev A/B toggle: Cmd/Ctrl + Shift + T
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        if (toggleLockRef.current || transitionLockRef.current) return;
        setSearchMode((prev) => (prev === "morph" ? "inline" : "morph"));
        setIsDialogOpen(false);
        setIsInlineFocused(false);
        withToggleLock(140);
        return;
      }

      // ⌘K or Ctrl+K to open dialog
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (transitionLockRef.current || isDialogOpen) return;
        setIsDialogOpen(true);
        withTransitionLock(280);
        playOpenSound(prefersReducedMotion);
      }
      // ESC to close dialog
      if (e.key === "Escape" && isDialogOpen) {
        e.preventDefault();
        if (transitionLockRef.current) return;
        setIsDialogOpen(false);
        withTransitionLock(220);
        playCloseSound(prefersReducedMotion);
      }

      // ESC also closes inline dropdown
      if (e.key === "Escape" && searchMode === "inline" && isInlineFocused) {
        e.preventDefault();
        setIsInlineFocused(false);
        inlineInputRef.current?.blur();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    isDialogOpen,
    isInlineFocused,
    prefersReducedMotion,
    searchMode,
    withToggleLock,
    withTransitionLock,
  ]);

  // Placeholder cycling (every 3 seconds)
  useEffect(() => {
    if (!isDialogOpen) return;

    const interval = setInterval(() => {
      setPlaceholderIndex(i => (i + 1) % PLACEHOLDER_EXAMPLES.length);
    }, 3000);

    return () => clearInterval(interval);
  }, [isDialogOpen]);

  // Focus dialog input when opened
  useEffect(() => {
    if (isDialogOpen && dialogInputRef.current) {
      // Small delay to ensure animation has started
      const timer = setTimeout(() => {
        dialogInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isDialogOpen]);

  // Detect transition between empty <-> has query for morph sound
  useEffect(() => {
    const hasQuery = query.length > 0;
    if (hasQuery !== prevHadQuery.current) {
      playMorphSound(prefersReducedMotion);
      prevHadQuery.current = hasQuery;
    }
  }, [query, prefersReducedMotion]);

  const handleClear = useCallback(() => {
    playClearSound(prefersReducedMotion);
    setQuery("");
    if (isDialogOpen) {
      dialogInputRef.current?.focus();
    }
  }, [prefersReducedMotion, isDialogOpen]);

  const handleOpenDialog = useCallback(() => {
    if (transitionLockRef.current || isDialogOpen) return;
    setIsInlineFocused(false);
    setIsDialogOpen(true);
    withTransitionLock(280);
    playOpenSound(prefersReducedMotion);
  }, [isDialogOpen, prefersReducedMotion, withTransitionLock]);

  const handleCloseDialog = useCallback(() => {
    if (transitionLockRef.current || !isDialogOpen) return;
    setIsDialogOpen(false);
    withTransitionLock(220);
    playCloseSound(prefersReducedMotion);
  }, [isDialogOpen, prefersReducedMotion, withTransitionLock]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      playClickSound(prefersReducedMotion);
      captureHeroSearchSubmit(query.trim());
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  }, [query, prefersReducedMotion, navigate]);

  const inlineResults = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return INLINE_RESULTS.slice(0, 5);
    const matched = INLINE_RESULTS.filter((item) =>
      `${item.primary} ${item.secondary}`.toLowerCase().includes(term),
    );
    return (matched.length > 0 ? matched : INLINE_RESULTS).slice(0, 5);
  }, [query]);

  useEffect(() => {
    if (activeInlineIndex >= inlineResults.length) {
      setActiveInlineIndex(0);
    }
  }, [activeInlineIndex, inlineResults.length]);

  useEffect(() => {
    if (prefersReducedMotion) return;
    const interval = window.setInterval(() => {
      setHeroTitleIndex((prev) => (prev + 1) % HERO_TITLES.length);
    }, 3800);
    return () => window.clearInterval(interval);
  }, [prefersReducedMotion]);

  const [heroLineOne, heroLineTwo] = HERO_TITLES[heroTitleIndex];

  const inlineOpen = searchMode === "inline" && isInlineFocused;

  const dialogBackdropClass = "fixed inset-0 z-[60] bg-black/85 backdrop-blur-2xl";
  const dialogBackdropStyle = false
    ? {
      background:
        "radial-gradient(120% 80% at 18% 10%, rgba(255,244,214,0.48) 0%, rgba(255,244,214,0) 55%), radial-gradient(90% 70% at 86% 16%, rgba(255,229,180,0.34) 0%, rgba(255,229,180,0) 52%), linear-gradient(180deg, rgba(250,244,230,0.52) 0%, rgba(242,233,214,0.42) 52%, rgba(237,226,202,0.52) 100%)",
    }
    : undefined;
  const dialogShellClass = false
    ? "relative rounded-3xl px-4 py-3 md:px-6 md:py-4"
    : "relative rounded-3xl bg-black/25 px-4 py-3 backdrop-blur-xl md:px-6 md:py-4";
  const dialogShellStyle = false
    ? {
      background:
        "linear-gradient(160deg, rgba(255,252,245,0.98) 0%, rgba(252,245,232,0.98) 58%, rgba(247,237,219,0.98) 100%)",
      border: "1px solid rgba(126,79,28,0.18)",
      boxShadow:
        "0 1.375rem 3.5rem rgba(75,45,10,0.22), 0 0.375rem 1.125rem rgba(75,45,10,0.16), inset 0 0.0625rem 0 rgba(255,255,255,0.92)",
    }
    : {
      boxShadow: "0 1.25rem 3.125rem rgba(0,0,0,0.45), inset 0 0 0 0.0625rem rgba(255,255,255,0.12)",
    };
  const dialogInputClass = false
    ? "block h-16 w-full bg-transparent py-0 pl-12 pr-12 text-[1.75rem] font-bold leading-[4rem] text-stone-900 outline-none placeholder:font-bold placeholder:text-stone-600/62 md:h-[4.75rem] md:text-[2.375rem] md:leading-[4.75rem]"
    : "block h-16 w-full bg-transparent py-0 pl-12 pr-12 text-[1.75rem] font-bold leading-[4rem] text-white outline-none placeholder:font-bold placeholder:text-white/20 md:h-[4.75rem] md:text-[2.375rem] md:leading-[4.75rem]";
  const dialogCaretColor = false ? "rgba(120, 53, 15, 0.95)" : "rgba(56, 189, 248, 0.8)";
  const dialogIconClass = false
    ? "pointer-events-none absolute inset-y-0 left-5 z-10 flex items-center text-stone-700/80"
    : "pointer-events-none absolute inset-y-0 left-5 z-10 flex items-center text-white/35";
  const dialogDividerClass = false
    ? "mt-6 h-px bg-gradient-to-r from-transparent via-stone-700/34 to-transparent"
    : "mt-6 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent";
  const dialogHelperClass = false
    ? "mt-6 flex flex-col items-center justify-between gap-4 text-sm text-stone-800/90 sm:flex-row"
    : "mt-6 flex flex-col items-center justify-between gap-4 text-sm text-white/40 sm:flex-row";
  const dialogHintClass = false ? "text-stone-700/90" : "text-white/50";
  const dialogKbdClass = false
    ? "rounded-md border border-stone-900/20 bg-stone-900/8 px-2 py-1 text-xs font-semibold text-stone-800/90"
    : "rounded-md bg-white/10 px-2 py-1 text-xs font-semibold text-white/60";
  const dialogPillsTitleClass = false
    ? "mb-4 text-xs font-semibold uppercase tracking-wider text-stone-700/80"
    : "mb-4 text-xs font-semibold uppercase tracking-wider text-white/30";
  const dialogPillBaseClass =
    "rounded-full border px-4 py-2.5 text-sm font-medium transition-colors";
  const lightMutedPillStyles = [
    "border-amber-900/14 bg-amber-100/72 text-stone-800/92 hover:bg-amber-200/76",
    "border-rose-900/12 bg-rose-100/64 text-stone-800/92 hover:bg-rose-200/68",
    "border-sky-900/12 bg-sky-100/64 text-stone-800/92 hover:bg-sky-200/68",
    "border-emerald-900/12 bg-emerald-100/64 text-stone-800/92 hover:bg-emerald-200/68",
    "border-violet-900/12 bg-violet-100/58 text-stone-800/92 hover:bg-violet-200/62",
  ] as const;
  const darkPillClass =
    "rounded-full bg-white/5 px-4 py-2.5 text-sm font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white/80";

  // Reduced motion: skip animations entirely
  const animationProps = prefersReducedMotion
    ? { initial: false, animate: {} }
    : {};

  return (
    <div id="main-content" className="relative flex h-[100dvh] flex-col overflow-hidden">
      {/* Background Video */}
      <video
        autoPlay
        loop
        muted
        playsInline
        preload="none"
        poster="/about_bg.png"
        className="absolute inset-0 h-full w-full object-cover"
      >
        <source src="/bg-anim.mp4" type="video/mp4" />
      </video>

      {/* Overlay with subtle gradient (Principle 11: Solid Drawing - depth) */}
      <div className="absolute inset-0 bg-gradient-to-b from-sky-900/10 via-sky-900/20 to-sky-900/30" />

      <LayoutGroup id="search-morph">

        {/* Navbar - Desktop only */}
        <motion.nav
          className="relative z-10 hidden w-full items-center justify-between px-8 py-6 md:px-12 lg:flex"
          variants={navVariants}
          initial="hidden"
          animate="visible"
          {...animationProps}
        >
          <motion.button
            onClick={() => navigate("/")}
            className="cursor-pointer"
            whileHover={prefersReducedMotion ? {} : { scale: 1.05 }}
            whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
            transition={springs.snappy}
          >
            <img 
              src="/new_logo_no_bg.png" 
              alt="Kumo"
              className="h-32 w-auto object-contain"
            />
          </motion.button>

          <motion.div
            className="flex items-center gap-1.5 rounded-full bg-white/85 px-2 py-2 shadow-lg backdrop-blur-sm"
            style={{
              boxShadow: "0 2px 4px rgba(0,0,0,0.05), 0 4px 12px rgba(0,0,0,0.08)",
            }}
          >
            <motion.button
              onClick={() => navigate("/about")}
              className="flex items-center gap-2 rounded-full px-5 py-2.5 text-base font-medium text-sky-900 bg-transparent border-none cursor-pointer"
              whileHover={prefersReducedMotion ? {} : {
                backgroundColor: "rgba(14, 165, 233, 0.1)",
                scale: 1.02,
              }}
              whileTap={prefersReducedMotion ? {} : { scale: 0.97 }}
              transition={springs.snappy}
            >
              <HugeiconsIcon icon={InformationCircleIcon} size={18} strokeWidth={1.5} />
              About
            </motion.button>

            <motion.a
              href="https://github.com/saishankar404/kumo"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-full px-5 py-2.5 text-base font-medium text-sky-900"
              whileHover={prefersReducedMotion ? {} : {
                backgroundColor: "rgba(14, 165, 233, 0.1)",
                scale: 1.02,
              }}
              whileTap={prefersReducedMotion ? {} : { scale: 0.97 }}
              transition={springs.snappy}
            >
              <HugeiconsIcon icon={GithubIcon} size={18} strokeWidth={1.5} />
              GitHub
            </motion.a>
          </motion.div>
        </motion.nav>

        {/* Mobile header - centered logo + minimal top-right links */}
        <motion.div
          className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-5 lg:hidden"
          variants={navVariants}
          initial="hidden"
          animate="visible"
          {...animationProps}
        >
          <div className="flex-1" />

          <motion.button
            onClick={() => navigate("/")}
            className="cursor-pointer"
            whileHover={prefersReducedMotion ? {} : { scale: 1.05 }}
            whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
            transition={springs.snappy}
          >
            <img 
              src="/new_logo_no_bg.png" 
              alt="Kumo"
              className="h-16 w-auto object-contain"
            />
          </motion.button>

          <motion.div className="flex flex-1 justify-end items-start gap-2 pt-1">
            <motion.button
              onClick={() => navigate("/about")}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/50 backdrop-blur-sm"
              whileHover={prefersReducedMotion ? {} : { scale: 1.08 }}
              whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
              transition={springs.snappy}
            >
              <HugeiconsIcon icon={InformationCircleIcon} size={16} strokeWidth={1.5} />
            </motion.button>

            <motion.a
              href="https://github.com/saishankar404/kumo"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/50 backdrop-blur-sm"
              whileHover={prefersReducedMotion ? {} : { scale: 1.08 }}
              whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
              transition={springs.snappy}
            >
              <HugeiconsIcon icon={GithubIcon} size={16} strokeWidth={1.5} />
            </motion.a>
          </motion.div>
        </motion.div>

        {/* Hero Section (Principle 3: Staging - main focal area, z-10) */}
        <div className="relative z-10 flex flex-1 flex-col items-center justify-start px-6 pb-12 pt-32 md:pt-2 md:justify-center md:pb-16">
          <div className="pointer-events-none absolute left-1/2 top-[34%] h-[340px] w-[760px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,_rgba(255,243,218,0.32)_0%,_rgba(255,243,218,0.1)_42%,_rgba(255,243,218,0)_72%)] blur-3xl" aria-hidden="true" />

          {/* Hero Title with staggered lines (Principle 5: Follow Through & Overlapping) */}
          <motion.h1
            className="mb-5 text-center mt-12 md:mt-0"
            style={{ fontFamily: fontStack }}
            variants={heroContainerVariants}
            initial="hidden"
            animate="visible"
            {...animationProps}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={`hero-line-1-${heroTitleIndex}`}
                className="block whitespace-nowrap font-bold text-white"
                style={{
                  fontSize: "clamp(2.25rem, 8vw, 5.8rem)",
                  lineHeight: "0.92",
                  letterSpacing: "-0.032em",
                }}
                initial={prefersReducedMotion ? false : { clipPath: "inset(0 100% 0 0)", opacity: 0.75 }}
                animate={prefersReducedMotion ? { opacity: 1 } : { clipPath: "inset(0 0% 0 0)", opacity: 1 }}
                exit={prefersReducedMotion ? { opacity: 1 } : { clipPath: "inset(0 0 0 100%)", opacity: 0.75 }}
                transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.55, ease: easings.entrance }}
              >
                {heroLineOne}
              </motion.span>
            </AnimatePresence>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={`hero-line-2-${heroTitleIndex}`}
                className="block whitespace-nowrap font-bold text-white"
                style={{
                  fontSize: "clamp(2.25rem, 8vw, 5.8rem)",
                  lineHeight: "0.92",
                  letterSpacing: "-0.032em",
                }}
                initial={prefersReducedMotion ? false : { clipPath: "inset(0 100% 0 0)", opacity: 0.75 }}
                animate={prefersReducedMotion ? { opacity: 1 } : { clipPath: "inset(0 0% 0 0)", opacity: 1 }}
                exit={prefersReducedMotion ? { opacity: 1 } : { clipPath: "inset(0 0 0 100%)", opacity: 0.75 }}
                transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.62, delay: 0.06, ease: easings.entrance }}
              >
                {heroLineTwo}
              </motion.span>
            </AnimatePresence>
          </motion.h1>

          <motion.p
            className="mb-8 max-w-3xl text-center text-[19px] md:text-[22px] font-medium leading-relaxed text-amber-50/90"
            style={{
              fontFamily: fontStack,
              letterSpacing: "-0.01em",
              textShadow: "0 1px 2px rgba(0,0,0,0.12), 0 6px 18px rgba(0,0,0,0.18)",
            }}
            variants={heroSubtitleVariants}
            initial="hidden"
            animate="visible"
            {...animationProps}
          >
            Discover papers by DOI, title, author, or keyword - without paywalls.
          </motion.p>

          <AnimatePresence initial={false} mode="sync">
            {searchMode === "morph" && !isDialogOpen && (
              <motion.div
                key="hero-search-morph"
                className="w-full max-w-[720px] cursor-pointer"
                variants={searchBarVariants}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, scale: 0.98, y: 8, transition: { duration: 0.18 } }}
                onClick={handleOpenDialog}
                {...animationProps}
              >
                <motion.div
                  layoutId="search-shell"
                  transition={morphSpring}
                  className="relative flex h-[68px] w-full items-center rounded-2xl bg-white/85 backdrop-blur-xl"
                  style={{
                    boxShadow:
                      "0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06), 0 12px 32px rgba(0,0,0,0.08), inset 0 0 0 1px rgba(0,0,0,0.04)",
                  }}
                  whileHover={prefersReducedMotion ? {} : {
                    scale: 1.005,
                    boxShadow:
                      "0 2px 4px rgba(0,0,0,0.06), 0 8px 20px rgba(0,0,0,0.1), 0 20px 48px rgba(0,0,0,0.12), inset 0 0 0 1px rgba(0,0,0,0.05)",
                  }}
                  whileTap={prefersReducedMotion ? {} : { scale: 0.998 }}
                >
                  <motion.div layoutId="search-icon" className="pointer-events-none absolute left-5 top-0 z-10 flex items-center h-full w-10">
                    <HugeiconsIcon icon={Search01Icon} size={24} strokeWidth={1.75} className="text-neutral-800" />
                  </motion.div>

                  <div className="flex-1 pl-14 pr-24 h-full flex items-center" style={{ fontFamily: fontStack }}>
                    {query ? (
                      <span className="block truncate text-[17px] font-medium text-neutral-900" style={{ letterSpacing: "-0.01em" }}>
                        {query}
                      </span>
                    ) : (
                      <span className="block text-[17px] font-medium text-neutral-500" style={{ letterSpacing: "-0.01em" }}>
                        Find your paper...
                      </span>
                    )}
                  </div>

                  <motion.div
                    className="pointer-events-none absolute right-5 top-0 h-full z-10 flex items-center pr-5"
                    initial={false}
                    animate={{ opacity: query ? 0 : 1, scale: query ? 0.85 : 1 }}
                    transition={springs.snappy}
                  >
                    <div className="flex items-center gap-1 rounded-md bg-neutral-900/[0.07] px-2.5 h-7">
                      <HugeiconsIcon icon={CommandIcon} size={12} strokeWidth={2.25} className="text-neutral-600" />
                      <span className="text-[12px] font-semibold leading-none text-neutral-600" style={{ fontFamily: fontStack }}>
                        K
                      </span>
                    </div>
                  </motion.div>
                </motion.div>
              </motion.div>
            )}

            {searchMode === "inline" && (
              <motion.form
                key="hero-search-inline"
                className="w-full max-w-[720px]"
                variants={searchBarVariants}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, y: 8, transition: { duration: 0.16 } }}
                onSubmit={handleSubmit}
                {...animationProps}
              >
                <motion.div
                  className="relative flex h-[68px] w-full items-center rounded-2xl bg-white/85 backdrop-blur-xl"
                  style={{
                    boxShadow:
                      "0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06), 0 12px 32px rgba(0,0,0,0.08), inset 0 0 0 1px rgba(0,0,0,0.04)",
                  }}
                  whileHover={prefersReducedMotion ? {} : {
                    scale: 1.003,
                    boxShadow:
                      "0 2px 4px rgba(0,0,0,0.06), 0 8px 20px rgba(0,0,0,0.1), 0 20px 48px rgba(0,0,0,0.12), inset 0 0 0 1px rgba(0,0,0,0.05)",
                  }}
                >
                  <div className="pointer-events-none absolute left-5 top-0 h-full z-10 flex items-center pl-5">
                    <HugeiconsIcon icon={Search01Icon} size={24} strokeWidth={1.75} className="text-neutral-800" />
                  </div>

                  <input
                    ref={inlineInputRef}
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setActiveInlineIndex(0);
                    }}
                    onFocus={() => {
                      setIsInlineFocused(true);
                      playClickSound(prefersReducedMotion);
                    }}
                    onBlur={() => {
                      setTimeout(() => setIsInlineFocused(false), 120);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setActiveInlineIndex((prev) => (prev + 1) % Math.max(inlineResults.length, 1));
                      }
                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setActiveInlineIndex((prev) => (prev - 1 + Math.max(inlineResults.length, 1)) % Math.max(inlineResults.length, 1));
                      }
                      if (e.key === "Enter" && inlineResults[activeInlineIndex]) {
                        setQuery(inlineResults[activeInlineIndex].primary);
                      }
                    }}
                    className="h-full w-full bg-transparent py-0 pl-14 pr-28 text-[17px] font-medium text-neutral-900 outline-none"
                    placeholder="Find your paper..."
                    style={{ fontFamily: fontStack, letterSpacing: "-0.01em" }}
                  />

                  <div className="pointer-events-none absolute right-5 top-0 h-full z-10 flex items-center pr-5">
                    <div className="flex items-center gap-1 rounded-md bg-neutral-900/[0.07] px-2.5 h-7">
                      <HugeiconsIcon icon={CommandIcon} size={12} strokeWidth={2.25} className="text-neutral-600" />
                      <span className="text-[12px] font-semibold leading-none text-neutral-600" style={{ fontFamily: fontStack }}>
                        K
                      </span>
                    </div>
                  </div>

                  {query && (
                    <motion.button
                      type="button"
                      onClick={handleClear}
                      className="absolute right-16 top-1/2 z-10 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.5 }}
                      transition={springs.snappy}
                    >
                      <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={2} />
                    </motion.button>
                  )}
                </motion.div>

                <AnimatePresence>
                  {inlineOpen && (
                    <motion.div
                      className="mt-3 overflow-hidden rounded-2xl bg-white/90 backdrop-blur-xl"
                      initial={{ opacity: 0, y: -8, scale: 0.985 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.985 }}
                      transition={springs.smooth}
                      style={{ boxShadow: "0 18px 40px rgba(0,0,0,0.12), inset 0 0 0 1px rgba(0,0,0,0.06)" }}
                    >
                      {inlineResults.map((item, index) => (
                        <button
                          key={`${item.type}-${item.primary}`}
                          type="button"
                          onMouseEnter={() => setActiveInlineIndex(index)}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setQuery(item.primary);
                            setIsInlineFocused(false);
                            playClickSound(prefersReducedMotion);
                          }}
                          className={`flex w-full items-center justify-between px-5 py-3 text-left transition-colors ${index === activeInlineIndex ? "bg-neutral-100/80" : "bg-transparent hover:bg-neutral-100/60"
                            }`}
                        >
                          <span className="flex flex-col">
                            <span className="text-[15px] font-medium text-neutral-900" style={{ fontFamily: fontStack }}>
                              {item.primary}
                            </span>
                            <span className="text-xs text-neutral-500" style={{ fontFamily: fontStack }}>
                              {item.secondary}
                            </span>
                          </span>
                          <span className="rounded-md bg-neutral-900/6 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-600" style={{ fontFamily: fontStack }}>
                            {item.type}
                          </span>
                        </button>
                      ))}
                      <div className="flex items-center justify-between border-t border-neutral-200/60 px-5 py-2.5 text-xs text-neutral-500" style={{ fontFamily: fontStack }}>
                        <span>Inline search mode</span>
                        <span>Press `⌘K` for cinematic dialog</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.form>
            )}
          </AnimatePresence>

          <motion.div
            className="mt-20 w-full max-w-[1200px]"
            variants={helperTextVariants}
            initial="hidden"
            animate="visible"
            {...animationProps}
          >
            <StackedCardLoop fontFamily={fontStack} />
          </motion.div>
        </div>

        {/* Footer (Principle 3: Staging - last to appear) */}
        <motion.footer
          className="pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2 text-center"
          variants={footerVariants}
          initial="hidden"
          animate="visible"
          {...animationProps}
        >
          <motion.span
            className="text-xs font-medium tracking-wide text-white/40"
            style={{ fontFamily: fontStack }}
            whileHover={prefersReducedMotion ? {} : { color: "rgba(255,255,255,0.7)" }}
            transition={{ duration: 0.2 }}
          >
            crafted by @saishankar404
          </motion.span>
        </motion.footer>

        <AnimatePresence
          initial={false}
          mode="sync"
          onExitComplete={() => {
            transitionLockRef.current = false;
          }}
        >
          {isDialogOpen && (
            <>
              <motion.div
                className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-2xl"
                style={dialogBackdropStyle}
                variants={dialogBackdropVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                onClick={handleCloseDialog}
                aria-hidden="true"
              />

              <motion.div
                className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto pt-[12vh] md:pt-[18vh]"
                role="dialog"
                aria-modal="true"
                aria-label="Search papers"
                onClick={(e) => {
                  if (e.target === e.currentTarget) {
                    handleCloseDialog();
                  }
                }}
              >
                <div 
                  className="w-full max-w-3xl px-6" 
                >
                  <motion.div
                    layoutId="search-shell"
                    transition={morphSpring}
                    className={dialogShellClass}
                    style={dialogShellStyle}
                  >
                    <motion.div layoutId="search-icon" className={dialogIconClass}>
                      <HugeiconsIcon icon={Search01Icon} size={28} strokeWidth={1.6} />
                    </motion.div>

                    <form onSubmit={handleSubmit}>
                      <input
                        ref={dialogInputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className={dialogInputClass}
                        style={{
                          fontFamily: fontStack,
                          letterSpacing: "-0.025em",
                          caretColor: dialogCaretColor,
                        }}
                        placeholder={PLACEHOLDER_EXAMPLES[placeholderIndex]}
                        autoComplete="off"
                        spellCheck="false"
                      />
                    </form>

                    <AnimatePresence>
                      {query ? (
                        <motion.button
                          type="button"
                          onClick={handleClear}
                          className={false
                            ? "absolute inset-y-0 right-3 z-10 flex items-center justify-center rounded-full p-2 text-stone-700/55 hover:bg-stone-900/10 hover:text-stone-900"
                            : "absolute inset-y-0 right-3 z-10 flex items-center justify-center rounded-full p-2 text-white/40 hover:bg-white/10 hover:text-white/70"
                          }
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.5 }}
                          transition={springs.snappy}
                          whileTap={{ scale: 0.9 }}
                        >
                          <HugeiconsIcon icon={Cancel01Icon} size={22} strokeWidth={1.5} />
                        </motion.button>
                      ) : null}
                    </AnimatePresence>
                  </motion.div>

                  <motion.div className={dialogDividerClass} variants={dialogChildVariants} initial="hidden" animate="visible" exit="exit" />

                  <motion.div
                    className="mt-6 flex flex-col items-start justify-between gap-4 text-sm text-white/40"
                    variants={dialogChildVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    style={{ fontFamily: fontStack }}
                  >
                    <span className="font-medium">Search papers by DOI, title, author, or keywords</span>
                    <div className="flex items-center gap-4 pl-0.5">
                      <motion.button
                        type="button"
                        onClick={async () => {
                          try {
                            const text = await navigator.clipboard.readText();
                            if (text.trim()) {
                              setQuery(text.trim());
                              playClickSound(prefersReducedMotion);
                            }
                          } catch (err) {
                            console.error("Failed to read clipboard:", err);
                          }
                        }}
                        className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white/60 hover:bg-white/20"
                        whileTap={{ scale: 0.95 }}
                      >
                        <HugeiconsIcon icon={ClipboardIcon} size={14} strokeWidth={2} />
                        <span>paste</span>
                      </motion.button>
                    </div>
                  </motion.div>

                  <motion.div className="mt-10" variants={dialogChildVariants} initial="hidden" animate="visible" exit="exit">
                    <p className={dialogPillsTitleClass} style={{ fontFamily: fontStack }}>
                      Try searching for
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        "quantum computing",
                        "10.1038/s41586-023-06185-3",
                        "AlphaFold protein",
                        "attention mechanism",
                        "Yann LeCun",
                      ].map((term, i) => (
                        <motion.button
                          key={term}
                          className={false
                            ? `${dialogPillBaseClass} ${lightMutedPillStyles[i % lightMutedPillStyles.length]}`
                            : darkPillClass
                          }
                          style={{ fontFamily: fontStack }}
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{
                            opacity: 1,
                            y: 0,
                            scale: 1,
                            transition: { delay: 0.15 + i * 0.03, ...springs.snappy },
                          }}
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => {
                            setQuery(term);
                            playClickSound(prefersReducedMotion);
                          }}
                        >
                          {term}
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  );
};

export default Index;
