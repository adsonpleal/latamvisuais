// Character preview: the APNG render plus body/head rotation, the action
// picker, and (for animated actions) a play/pause toggle with a frame scrubber.
// Each action button's icon is a STILL frame of the actual character being
// built — full-body framed (actionIconCanvas) so head and feet aren't cut —
// always facing south.
//
// The full-sprite view has two modes. Full screen is a modal over a dimmed
// backdrop. "Detached" pops the same box out into a floating picture-in-picture
// window — no backdrop, so the catalogue underneath stays clickable and the
// window keeps following the build while costumes are swapped behind it. The
// window is dragged by the grip along its top and resized proportionally from
// its bottom-right corner, never past the size the full-screen view computed.
//
// Animations come back from ragassets as APNG (which the browser plays on its
// own). To "pause", we swap the <img> to a single still frame (frame=N). The
// frame count per action is the static table in core/state.ts. Local playback
// state (playing / frame) is deliberately NOT part of the shareable build.
//
// Effect costumes and graphic stones (auras, petals, ki spirits) are drawn by
// the game's world-effect system, never by a character sprite, so they can't be
// part of that render at all. They come from a transparent WebGL canvas behind
// the paper-doll instead — the same billboards the map view plays, anchored on
// the character's feet (sim/render/stageEffects). It only exists while a build
// actually has one, so three.js stays out of the first load.

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ACTIONS,
  ACTION_BELOW_ORIGIN,
  actionIconCanvas,
  CANVAS_METRICS,
  classOf,
  effectiveJob,
  frameCountProbeUrl,
  gifUrl,
  grownCanvas,
  HEAD_ROTATE_ACTIONS,
  imageUrl,
  MODAL_CANVAS_METRICS,
  MODAL_GROWTH,
  ACTION_FRAMES,
  type CanvasMetrics,
} from "../core/state";
import { alphaBounds, touchesEdge, type Bounds } from "../core/alphaBounds";
import { hint } from "../core/hints";
import { mountsFor } from "../core/mounts";
import { flyingJobFor } from "../core/flight";
import { SLOTS } from "../core/db";
import { builtinOf, drawsEffects, effectKeys } from "../sim/equipped";
import { t } from "../i18n";
import { dismissTip } from "../hooks/useTooltip";
import { useFrameCount } from "../hooks/useFrameCount";
import { usePreloadedImage } from "../hooks/usePreloadedImage";
import { useStageEffects, type StageLayout } from "../hooks/useStageEffects";
import { useAppState, useDb, useDispatch } from "../state/AppStateContext";
import { TipButton } from "./TipButton";
import { ChevronLeft, ChevronRight, Detach, Download, Expand, Map, Pause, Play } from "./icons";

/** Smallest the floating window goes, per axis, in pixels. There is no matching
 *  maximum — how big the window should be is the user's call, and the drag can
 *  only grow it as far as they can reach anyway. */
const MIN_WINDOW = 120;

/** Pixels of the floating window that must stay on screen while dragging. */
const DRAG_MARGIN = 48;

/** The viewer's gutters, in pixels. The rotation arrows sit in the horizontal
 *  ones, and the effect overlay reaches across both — an aura is allowed past
 *  the character's own window, which is the point of being able to zoom out. */
const VIEWER_PAD_X = 60;
const VIEWER_PAD_Y = 24;

/** Content zoom: what a press of + or − multiplies by, and how far it goes. */
const ZOOM_STEP = 1.25;
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 6;

/** How long the sprite has to settle before recomputing the locked box. Holding
 *  an arrow key in the catalogue changes the build every few frames, and each
 *  recompute preloads four dozen sprites. */
const BOX_SETTLE_MS = 250;

const detachHint = hint("detach");

/** How the full-sprite viewer is showing the build.
 *
 *  The render is anchored on a fixed canvas (so the character's feet are a known
 *  pixel, which the effect overlay needs), and the viewer shows a WINDOW into
 *  it — the box of pixels actually drawn — so the surrounding margin never
 *  reaches the screen and the framing stays as tight as an auto-crop. */
type ModalView = {
  /** The render canvas the character is drawn on. */
  metrics: CanvasMetrics;
  /** The visible window into it, in canvas pixels. */
  minX: number;
  minY: number;
  w: number;
  h: number;
  /** CSS pixels per canvas pixel, before the floating window's zoom. */
  scale: number;
};

export function Preview({ onPlay }: { onPlay: () => void }) {
  const state = useAppState();
  const db = useDb();
  const dispatch = useDispatch();

  const [playing, setPlaying] = useState(true);
  const [frame, setFrame] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  // How the full-sprite viewer is framing the build: the render canvas, the
  // drawn-pixel window into it, and the scale. Measured across every body/head
  // direction so rotation swaps the sprite without moving the frame — and, now
  // that the render is anchored rather than auto-cropped, without moving the
  // character inside it either.
  const [view, setView] = useState<ModalView>();
  // The floating window's size, frozen when it was popped out. The measuring
  // pass keeps running while detached (the build is still changing behind it),
  // but the box the user sized must not resize itself, so a bigger costume
  // shrinks to fit instead.
  const [frozenBox, setFrozenBox] = useState<{ w: number; h: number }>();
  // How big the content is drawn inside that frame, as a multiple of the
  // measured fit. Deliberately survives a costume change: it is the reader's
  // setting, not a property of the build.
  const [viewZoom, setViewZoom] = useState(1);
  const [downloading, setDownloading] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  // Floating ("detached") window: whether we're in it, where it sits in the
  // viewport, and how much of the full-screen box size it takes (capped at 1 —
  // the full-screen size is the maximum). Deliberately survives closeModal, so
  // reopening the viewer lands back in the window you left.
  const [detached, setDetached] = useState(false);
  const [winPos, setWinPos] = useState<{ x: number; y: number }>();
  const boxRef = useRef<HTMLDivElement>(null);
  const detachRef = useRef<HTMLButtonElement>(null);

  // A fresh action starts playing from the top — reset on each action change.
  // (Storing the previous action in a ref and resetting during render mirrors
  // the old imperative update() exactly, with no post-paint flash.)
  const prevAction = useRef(-1);
  if (prevAction.current !== state.action) {
    prevAction.current = state.action;
    setPlaying(true);
    setFrame(0);
  }

  // Frames in the current pose's *composited* animation — read from the actual
  // rendered APNG so an animated costume (e.g. a 24-frame wing garment) exposes
  // all its frames, not just the body's. ACTION_FRAMES is the fallback until the
  // probe resolves (and on failure). The play/pause toggle is always shown; the
  // frame scrubber/steppers only make sense for multi-frame poses (`animated`) —
  // the genuinely static ones (Atordoado, Morto, Congelado) have a single frame.
  const probedFrameCount = useFrameCount(frameCountProbeUrl(state));
  const frameCount = probedFrameCount ?? ACTION_FRAMES[state.action] ?? 1;
  const animated = frameCount > 1;
  const headAllowed = HEAD_ROTATE_ACTIONS.has(state.action);

  // Mounts available to the current class (see core/mounts.ts). The toggle is
  // hidden for classes without any; when mounted and the class has more than one
  // mount, a small picker lets you choose which.
  const mounts = mountsFor(state.classId);
  const mounted = state.mount != null;
  const canFly = flyingJobFor(state.classId) != null;

  // Keep the scrubber in range when a costume change shortens the animation
  // (e.g. unequipping the wings drops idle from 24 frames back to 3).
  if (frame >= frameCount) setFrame(frameCount - 1);

  // Preload off-screen, then swap once decoded — no blank flash between renders.
  const sprite = usePreloadedImage(playing ? imageUrl(state) : imageUrl(state, { frame }));

  /**
   * Stop, and hand the effects' clock to the scrubber so it opens under what is
   * already on screen. Reading it is the only way round: the overlays own their
   * clocks while playing, precisely so that nothing has to drive them frame by
   * frame from React.
   */
  function pause() {
    setFxTime(stageEffects.read() || modalEffects.read());
    setPlaying(false);
  }

  /** Play again from wherever the scrubbers were left. */
  function resume() {
    setFxTime(undefined);
    setPlaying(true);
  }

  function stepFrame(delta: number) {
    pause();
    setFrame((f) => (f + delta + frameCount) % frameCount);
  }

  // ---- effect overlay ----------------------------------------------------
  //
  // What the character render can never contain (see the file header), and the
  // two things the overlay needs to line up with it: how big the stage is
  // drawing the sprite, and where its feet are.
  const fxKeys = useMemo(() => effectKeys(state), [state]);
  const builtin = useMemo(() => builtinOf(state), [state]);
  const hasFx = drawsEffects(fxKeys, builtin);
  // Miniatura resizes the character and draws nothing of its own. On this
  // surface that is a transform on the paper-doll rather than anything the
  // overlay does — anchored on the feet (see .stage-sprite in styles.css) so
  // they stay on the ground, exactly as the map scales its billboard — and a
  // build carrying only Miniatura therefore needs no canvas at all.
  const charScale = builtin?.kind === "scale" ? builtin.scale : 1;

  const [stageFx, setStageFx] = useState<HTMLCanvasElement | null>(null);
  const [modalFx, setModalFx] = useState<HTMLCanvasElement | null>(null);
  // Where the effects are parked while paused, in seconds. Undefined means the
  // overlays are running their own clocks — which is every moment except a
  // pause, so the scrubber is the only thing that ever sets it.
  const [fxTime, setFxTime] = useState<number>();
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageW, setStageW] = useState(0);
  // The stage is 1.5× the render canvas at full width but carries max-width and
  // shrinks in a narrow column, so its scale is read off the element.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const sync = () => setStageW(el.clientWidth);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const stageLayout = stageW
    ? layoutFor(CANVAS_METRICS, stageW / CANVAS_METRICS.w, stageW, stageW * (CANVAS_METRICS.h / CANVAS_METRICS.w))
    : undefined;

  const stageEffects = useStageEffects({
    canvas: stageFx,
    active: hasFx && !!stageLayout,
    keys: fxKeys,
    builtin,
    spriteUrl: sprite.src,
    metrics: CANVAS_METRICS,
    playing,
    layout: stageLayout,
    time: fxTime,
  });

  // ---- full-sprite viewer ------------------------------------------------
  const openModal = () => {
    // The detached window keeps its size across a close/reopen, so leave a
    // frozen box alone; a fresh full-screen open re-measures from nothing.
    if (!detached) setView(undefined);
    setDownloadFailed(false);
    setModalOpen(true);
  };
  const closeModal = () => setModalOpen(false);

  // Only while it *is* a modal: the floating window is an ordinary piece of the
  // page, and swallowing Escape there would close it out from under someone
  // dismissing something else.
  useEffect(() => {
    if (!modalOpen || detached) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modalOpen, detached]);

  // What the measuring pass below actually depends on: everything that changes
  // the sprite's bounds, and nothing that only changes which direction of it is
  // showing. `headDir` is in the key only for the poses where the head can turn
  // and the pass therefore measures a single head direction rather than all of
  // them; it is passed separately so the common case ignores it.
  const boundsKey = useMemo(
    () =>
      [
        effectiveJob(state),
        state.gender,
        state.hairStyle,
        state.hairColor,
        state.clothesColor,
        state.skin,
        state.outfit,
        state.action,
        state.mount,
        SLOTS.map((slot) => state.equipped[slot]?.id ?? 0).join("."),
      ].join("|"),
    [state],
  );

  // Work out how the viewer should frame this build, across every body/head
  // direction of the current pose, so rotation swaps the sprite without moving
  // the frame. Two passes, because they answer different questions:
  //
  //  - the AUTO-CROPPED renders give each direction's content size over the
  //    whole animation (ragassets crops an APNG to the union of its frames), so
  //    a costume that is only wide on frame 19 still counts;
  //  - the ANCHORED renders are what actually gets displayed, and compositing
  //    every direction into one canvas and reading the drawn pixels gives the
  //    window — where the content sits relative to the character's feet, which
  //    is what an auto-crop can never tell us and what the effect overlay needs.
  //
  // That second pass reconstructs, from pixels, one number the renderer already
  // had: ragassets knows the crop rectangle when it crops. If it ever returns
  // the origin with a render — a response header, or a small /bounds — the
  // viewer can ask for the tight crop it always wanted and this pass, along with
  // alphaBounds, unionBounds, windowFor's fallback and the growth retry, all go
  // away. Until then it is measured here.
  //
  // A window that reaches the canvas edge means the canvas clipped the costume,
  // so we re-render on a bigger one rather than show a cut-off sprite.
  //
  // This keeps running while detached, unlike the pass it replaces: the window
  // has to follow the build for the effects to stay on the character's feet.
  // The floating window's SIZE is what must not move, and that is held in
  // frozenBox instead.
  useEffect(() => {
    if (!modalOpen) return;
    let cancelled = false;

    const measure = async () => {
      const headDirs = headAllowed ? [0, 1, 2] : [state.headDir];
      const dirs: { bodyDir: number; headDir: number }[] = [];
      for (let bodyDir = 0; bodyDir < 8; bodyDir++) {
        for (const headDir of headDirs) dirs.push({ bodyDir, headDir });
      }

      // Both batches at once. The second does not depend on the first, and this
      // pass is what the viewer waits on before it can show anything at all —
      // running them in series meant two round trips of blank screen.
      let metrics = MODAL_CANVAS_METRICS;
      const [cropped, anchored] = await Promise.all([
        Promise.all(dirs.map((d) => decode(imageUrl(state, { canvas: null, ...d })))),
        Promise.all(dirs.map((d) => decode(imageUrl(state, { canvas: metrics, ...d })))),
      ]);
      if (cancelled) return;
      const maxW = Math.max(0, ...cropped.map((im) => im?.naturalWidth ?? 0));
      const maxH = Math.max(0, ...cropped.map((im) => im?.naturalHeight ?? 0));
      if (!maxW || !maxH) return;

      let bounds = unionBounds(anchored, metrics);
      // A box that reaches the edge means the canvas clipped the costume, so
      // re-render on a bigger one rather than show a cut-off sprite. Measured
      // over the whole catalogue this never fires; it is here so that if it ever
      // does, the reader sees the costume rather than a straight edge.
      if (bounds && touchesEdge(bounds, metrics.w, metrics.h)) {
        metrics = grownCanvas(metrics, MODAL_GROWTH);
        const grown = await Promise.all(
          dirs.map((d) => decode(imageUrl(state, { canvas: metrics, ...d }))),
        );
        if (cancelled) return;
        bounds = unionBounds(grown, metrics);
      }

      const win = windowFor(bounds, metrics, maxW, maxH, state.action);
      const scale = Math.max(
        1,
        Math.min((window.innerWidth * 0.8) / win.w, (window.innerHeight * 0.78) / win.h, 5),
      );
      // Rotating re-measures to the same numbers; keeping the old object spares
      // a render (and, now that this is debounced, a wasted pass).
      setView((prev) =>
        prev &&
        prev.metrics === metrics &&
        prev.minX === win.minX &&
        prev.minY === win.minY &&
        prev.w === win.w &&
        prev.h === win.h &&
        prev.scale === scale
          ? prev
          : { metrics, ...win, scale },
      );
    };

    // Settle first: keyboard navigation walks the catalogue faster than these
    // requests come back, and every intermediate costume would fire its own set.
    // Not on the way in, though — nothing has been shown yet, so there is
    // nothing to settle, and the wait would be dead time on a blank viewer.
    const timer = setTimeout(() => void measure(), view ? BOX_SETTLE_MS : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Keyed on what can actually move the bounds, not on `state` wholesale:
    // rotating changes `bodyDir`/`headDir`, which this pass measures ACROSS
    // rather than at, so it would have re-fetched four dozen renders to arrive
    // at the same window every time an arrow was pressed.
    //
    // `view` is deliberately NOT a dependency: it is this effect's own output,
    // and it is read only to tell a first measurement from a later one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, boundsKey, headAllowed, state.headDir]);

  // Mirror the preview: animate while playing, else lock to the chosen frame.
  // Anchored on the viewer's canvas, so the feet land at a known pixel.
  const modalMetrics = view?.metrics ?? MODAL_CANVAS_METRICS;
  const modalUrl = playing
    ? imageUrl(state, { canvas: modalMetrics })
    : imageUrl(state, { canvas: modalMetrics, frame });

  // Download exactly what the modal is showing: an animation becomes a GIF
  // (ragassets' /gif converts the APNG on the fly), a single frame stays a PNG.
  // ragassets sends Access-Control-Allow-Origin, so we can read the bytes into
  // a blob and save them with a real filename (the cross-origin `download`
  // attribute alone is ignored without CORS).
  const downloadSprite = async () => {
    if (downloading) return;
    const asGif = animated && playing;
    const url = asGif
      ? gifUrl(state, { canvas: null })
      : imageUrl(state, { canvas: null, frame: animated ? frame : 0 });
    const actionKey = ACTIONS.find((a) => a.type === state.action)?.key;
    const name =
      `${slug(classOf(db, state)?.name ?? `job${state.classId}`)}` +
      `-${slug(actionKey ? t.actions[actionKey] : String(state.action))}` +
      `.${asGif ? "gif" : "png"}`;

    setDownloadFailed(false);
    setDownloading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const objUrl = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch (err) {
      console.error("sprite download failed", err);
      setDownloadFailed(true);
    } finally {
      setDownloading(false);
    }
  };

  // On-screen geometry.
  //
  // The box is a fixed frame and the content moves inside it. Two independent
  // numbers, which used to be one:
  //
  //  - `frozenBox` sizes the FRAME, and belongs to the floating window: full
  //    screen follows the measurement, while a detached window holds whatever
  //    size the reader dragged it to and never resizes itself under their hands
  //    as costumes change. Width and height are independent — the drag is free,
  //    since a window is a window and its shape is the reader's business.
  //  - `viewZoom` sizes the CONTENT, and belongs to the reader too: 1 is the
  //    measured fit, below it the character shrinks and the effect around it
  //    comes into view, above it you get closer to the pixels.
  //
  // The content is centred in the frame and clipped by it, so zooming out is
  // what shows an effect the frame was cutting off, and resizing is what gives
  // it somewhere to go.
  const frameBox = detached
    ? frozenBox
    : view && { w: Math.round(view.w * view.scale), h: Math.round(view.h * view.scale) };
  const box = view && frameBox ? viewerBox(view, frameBox, viewZoom) : undefined;
  const boxReady = !!box;

  // The viewer gets its own overlay: it is a different size and scale from the
  // stage, and both can be on screen at once (the stage stays visible behind a
  // detached window).
  const modalLayout: StageLayout | undefined = box && {
    cssW: box.w + 2 * VIEWER_PAD_X,
    cssH: box.h + 2 * VIEWER_PAD_Y,
    groundX: box.groundX,
    groundY: box.groundY,
    scale: box.scale,
  };

  const modalEffects = useStageEffects({
    canvas: modalFx,
    active: modalOpen && hasFx && boxReady,
    keys: fxKeys,
    builtin,
    spriteUrl: modalOpen ? modalUrl : undefined,
    metrics: modalMetrics,
    playing,
    layout: modalLayout,
    time: fxTime,
  });

  /** The loop the effect scrubber spans. Zero means there is nothing to scrub —
   *  no effect equipped, or none loaded yet. Taken across both overlays because
   *  either may be the one that is mounted. */
  const fxDuration = Math.max(stageEffects.duration, modalEffects.duration);

  // ---- floating window: detach, drag, resize -----------------------------

  // Detach in place: the box is centred by flexbox until now, so seed the
  // window at the rect it already occupies and nothing jumps.
  const toggleDetached = () => {
    detachHint.spend();
    if (!detached) {
      // Pop out in place and at the size already on screen: the click changes
      // where the view lives, nothing about how it looks. Resizing is the
      // user's next move, not this one's — so a size left over from a previous
      // detach is dropped rather than re-applied.
      const r = boxRef.current?.getBoundingClientRect();
      if (r?.width) setWinPos(clampWin(r.left, r.top, r.width));
      if (frameBox) setFrozenBox(frameBox);
    } else {
      // Back to full screen: the measurement drives the size again.
      setFrozenBox(undefined);
    }
    setDetached((d) => !d);
  };

  // Point the hint at the button once the viewer has settled. It retires itself
  // the first time the button is actually pressed (see hint.spend above).
  useEffect(() => {
    if (!modalOpen || detached || !boxReady) return;
    const id = setTimeout(() => detachHint.show(detachRef.current, t.hintDetach), 600);
    return () => clearTimeout(id);
  }, [modalOpen, detached, boxReady]);

  // Both handles use pointer capture, so a fast drag that outruns the cursor
  // keeps delivering moves to the handle instead of falling off it.
  const dragRef = useRef<{ dx: number; dy: number }>(null);
  const resizeRef = useRef<{ x: number; y: number; w: number; h: number }>(null);

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r) return;
    dragRef.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    e.currentTarget.setPointerCapture(e.pointerId);
    // The pointer stays on the handle for the whole drag, so nothing else would
    // clear its label — and it would ride along over the window being moved.
    dismissTip();
    e.preventDefault();
  };
  const onDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const el = boxRef.current;
    if (!d || !el) return;
    setWinPos(clampWin(e.clientX - d.dx, e.clientY - d.dy, el.offsetWidth));
  };
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!frozenBox) return;
    resizeRef.current = { x: e.clientX, y: e.clientY, w: frozenBox.w, h: frozenBox.h };
    e.currentTarget.setPointerCapture(e.pointerId);
    dismissTip();
    e.preventDefault();
  };
  /** Free resize: the corner goes where the cursor goes, each axis on its own.
   *  It used to derive one scale factor from the drag and apply it to both,
   *  which kept the frame's shape but meant the corner slid away from the
   *  cursor on anything but a 45-degree drag — and the shape was never the
   *  thing worth preserving. The CONTENT keeps its proportions regardless: it
   *  is centred in the frame and scaled by the zoom control, not stretched to
   *  fill. */
  const onResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = resizeRef.current;
    if (!r) return;
    setFrozenBox({
      w: Math.max(MIN_WINDOW, Math.round(r.w + (e.clientX - r.x))),
      h: Math.max(MIN_WINDOW, Math.round(r.h + (e.clientY - r.y))),
    });
  };
  const endResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    resizeRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  // A shrinking viewport can strand the window off-screen with no handle left
  // to drag it back, so pull it into range whenever the window resizes.
  useEffect(() => {
    if (!detached || !modalOpen) return;
    const onResizeWindow = () => {
      const el = boxRef.current;
      if (!el) return;
      setWinPos((prev) => (prev ? clampWin(prev.x, prev.y, el.offsetWidth) : prev));
    };
    window.addEventListener("resize", onResizeWindow);
    return () => window.removeEventListener("resize", onResizeWindow);
  }, [detached, modalOpen]);

  return (
    <div className="preview">
      <div className="stage-wrap">
        <div className="stage" ref={stageRef}>
          {/* Behind the character, like the map draws it: the character
              billboard there is renderOrder 1 over every effect. */}
          {hasFx && <canvas className="stage-fx" ref={setStageFx} />}
          <img
            className={sprite.src ? "stage-sprite is-loaded" : "stage-sprite"}
            src={sprite.src}
            alt=""
            decoding="async"
            style={
              charScale === 1
                ? undefined
                : { transform: `scale(${charScale})`, transformOrigin: feetOrigin(CANVAS_METRICS) }
            }
          />
          <div className="stage-error" hidden={!sprite.error}>
            {t.previewError}
          </div>
        </div>

        {/* Explore-map (top-left) and expand (top-right) live on the stage-wrap,
            not the stage, so their tooltips aren't clipped by overflow:hidden. */}
        <TipButton className="stage-play" tip={t.playTitle} onClick={onPlay}>
          <Map />
        </TipButton>
        <TipButton className="stage-expand" tip={t.viewFull} onClick={openModal}>
          <Expand />
        </TipButton>

        <StageArrow side="left" rowKind="head" hidden={!headAllowed} onClick={() => dispatch({ type: "rotateHead", delta: -1 })} />
        <StageArrow side="right" rowKind="head" hidden={!headAllowed} onClick={() => dispatch({ type: "rotateHead", delta: 1 })} />
        <StageArrow side="left" rowKind="body" onClick={() => dispatch({ type: "rotateBody", delta: 1 })} />
        <StageArrow side="right" rowKind="body" onClick={() => dispatch({ type: "rotateBody", delta: -1 })} />
      </div>

      <div className="playback">
        <TipButton
          className="play-btn"
          tip={playing ? t.pause : t.play}
          onClick={() => (playing ? pause() : resume())}
        >
          {playing ? <Pause /> : <Play />}
        </TipButton>
        <TipButton className="frame-step" tip={t.framePrev} hidden={playing || !animated} onClick={() => stepFrame(-1)}>
          <ChevronLeft />
        </TipButton>
        <input
          className="frame-slider"
          type="range"
          min={0}
          max={Math.max(0, frameCount - 1)}
          step={1}
          value={frame}
          hidden={playing || !animated}
          aria-label={t.frameLabel}
          onChange={(e) => {
            setFrame(Number(e.target.value));
            pause();
          }}
        />
        <TipButton className="frame-step" tip={t.frameNext} hidden={playing || !animated} onClick={() => stepFrame(1)}>
          <ChevronRight />
        </TipButton>
      </div>

      {/* The effects run on a clock of their own, not on the sprite's frames —
          they are a different animation that happens to be playing at the same
          time, and pausing has to be able to hold both still independently.
          One scrubber for all of them rather than one each: they already share
          a clock while playing, each wrapping at its own rate, so scrubbing
          that clock shows exactly the combinations that really occur. The span
          is the longest of their loops, so every one completes at least once. */}
      {!playing && hasFx && fxDuration > 0 && (
        <div className="playback playback-fx">
          <span className="playback-label">{t.effectTimeLabel}</span>
          <input
            className="frame-slider"
            type="range"
            min={0}
            max={fxDuration}
            step={fxDuration / 240}
            value={fxTime ?? 0}
            aria-label={t.effectTimeLabel}
            onChange={(e) => setFxTime(Number(e.target.value))}
          />
        </div>
      )}

      <div className="control-block actions-block">
        <div className="control-label">{t.actionsLabel}</div>
        <div className="actions-row">
          {ACTIONS.map((a) => {
            const selected = state.action === a.type;
            // Still frame 0, locked to south, full-body framed — stays put while
            // rotating or scrubbing.
            const icon = imageUrl(state, {
              action: a.type,
              frame: 0,
              bodyDir: 0,
              headDir: 0,
              canvas: actionIconCanvas(a.type),
            });
            return (
              // No tooltip here: the caption below the render already names the
              // action, and it doubles as the button's accessible name.
              <button
                key={a.type}
                type="button"
                className={selected ? "action-btn is-selected" : "action-btn"}
                aria-pressed={selected}
                onClick={() => dispatch({ type: "setAction", action: a.type })}
              >
                <span className="action-clip">
                  <img className="action-icon" src={icon} alt="" loading="lazy" decoding="async" />
                </span>
                <span className="action-name">{t.actions[a.key]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {(mounts.length > 0 || canFly) && (
        <div className="body-options">
          {mounts.length > 0 && (
            <div className="control-block mount-block">
              <div className="control-label">{t.mountLabel}</div>
              <div className="mount-row">
                <TipButton
                  className={mounted ? "mount-toggle is-on" : "mount-toggle"}
                  tip={mounted ? t.mountOff : t.mountOn}
                  role="switch"
                  aria-checked={mounted}
                  onClick={() => dispatch({ type: "setMount", mount: mounted ? null : 0 })}
                >
                  <span className="mount-toggle-track">
                    <span className="mount-toggle-thumb" />
                  </span>
                </TipButton>
                {mounted && mounts.length > 1 && (
                  <div className="mount-choices">
                    {mounts.map((m, i) => (
                      <TipButton
                        key={i}
                        className={state.mount === i ? "mount-choice is-selected" : "mount-choice"}
                        tip={t.mountNames[m.nameKey]}
                        aria-pressed={state.mount === i}
                        onClick={() => dispatch({ type: "setMount", mount: i })}
                      >
                        {t.mountNames[m.nameKey]}
                      </TipButton>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          {canFly && (
            <div className="control-block flight-block">
              <div className="control-label">{t.flightLabel}</div>
              <TipButton
                className={state.flying ? "mount-toggle is-on" : "mount-toggle"}
                tip={state.flying ? t.flightOff : t.flightOn}
                role="switch"
                aria-label={t.flightLabel}
                aria-checked={state.flying}
                onClick={() => dispatch({ type: "setFlying", flying: !state.flying })}
              >
                <span className="mount-toggle-track">
                  <span className="mount-toggle-thumb" />
                </span>
              </TipButton>
            </div>
          )}
        </div>
      )}

      <div
        className={detached ? "sprite-modal is-detached" : "sprite-modal"}
        hidden={!modalOpen}
        onClick={(e) => {
          // The detached layer is pointer-events:none, so this can't fire there
          // — but a floating window shouldn't close on a stray click regardless.
          if (!detached && e.target === e.currentTarget) closeModal();
        }}
      >
        {/* Nothing is rendered until the measuring pass has resolved a size.
            An unsized box collapses to its padding and stacks the arrows, the
            close button and the download button on top of each other, which is
            what the viewer used to flash on the way in. */}
        {!box && <div className="sprite-modal-wait">{t.loading}</div>}
        {box && (
        <div
          className="sprite-modal-box"
          ref={boxRef}
          style={{
            padding: `${VIEWER_PAD_Y}px ${VIEWER_PAD_X}px`,
            ...(detached && winPos ? { left: winPos.x, top: winPos.y } : null),
          }}
        >
          {/* The effect overlay spans the WHOLE box, gutters included, so an
              aura is not cut off at the edge of the character's own window —
              zoom out and the rest of it comes into view. */}
          {hasFx && <canvas className="sprite-modal-fx" ref={setModalFx} />}
          {/* The frame the character is drawn into. It holds its size while the
              content scales inside it, which is what makes zooming out reveal
              anything. */}
          <div className="sprite-modal-window" style={{ width: box.w, height: box.h }}>
            <img
              className="sprite-modal-img"
              src={modalOpen ? modalUrl : undefined}
              alt=""
              style={{
                width: box.imgW,
                height: box.imgH,
                left: box.imgX,
                top: box.imgY,
                ...(charScale === 1
                  ? null
                  : { transform: `scale(${charScale})`, transformOrigin: feetOrigin(modalMetrics) }),
              }}
            />
          </div>
          <StageArrow side="left" rowKind="head" hidden={!headAllowed} onClick={() => dispatch({ type: "rotateHead", delta: -1 })} />
          <StageArrow side="right" rowKind="head" hidden={!headAllowed} onClick={() => dispatch({ type: "rotateHead", delta: 1 })} />
          <StageArrow side="left" rowKind="body" onClick={() => dispatch({ type: "rotateBody", delta: 1 })} />
          <StageArrow side="right" rowKind="body" onClick={() => dispatch({ type: "rotateBody", delta: -1 })} />
          {detached && (
            <>
              {/* Plain divs, not buttons: these are window chrome, driven by
                  dragging rather than activation, and a keyboard user has
                  nothing to do with them. */}
              <div
                className="sprite-window-grip"
                data-tip={t.dragWindow}
                onPointerDown={startDrag}
                onPointerMove={onDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              />
              <div
                className="sprite-window-resize"
                data-tip={t.resizeWindow}
                onPointerDown={startResize}
                onPointerMove={onResize}
                onPointerUp={endResize}
                onPointerCancel={endResize}
              />
            </>
          )}
          <TipButton
            className="sprite-modal-download"
            tip={downloadFailed ? t.downloadError : t.downloadImage}
            disabled={downloading}
            aria-busy={downloading}
            onClick={downloadSprite}
          >
            <Download />
          </TipButton>
          <TipButton
            ref={detachRef}
            className="sprite-modal-detach"
            tip={detached ? t.attachPreview : t.detachPreview}
            aria-pressed={detached}
            onClick={toggleDetached}
          >
            {detached ? <Expand /> : <Detach />}
          </TipButton>
          <TipButton className="sprite-modal-close game-close" tip={t.closeModal} onClick={closeModal} />
          <div className={detached ? "sprite-zoom is-detached" : "sprite-zoom"}>
            <TipButton
              className="sprite-zoom-btn"
              tip={t.zoomOut}
              disabled={viewZoom <= ZOOM_MIN}
              onClick={() => setViewZoom((z) => Math.max(ZOOM_MIN, z / ZOOM_STEP))}
            >
              −
            </TipButton>
            {/* Doubles as the reset: back to the measured fit. */}
            <TipButton className="sprite-zoom-level" tip={t.zoomReset} onClick={() => setViewZoom(1)}>
              {Math.round(viewZoom * 100)}%
            </TipButton>
            <TipButton
              className="sprite-zoom-btn"
              tip={t.zoomIn}
              disabled={viewZoom >= ZOOM_MAX}
              onClick={() => setViewZoom((z) => Math.min(ZOOM_MAX, z * ZOOM_STEP))}
            >
              +
            </TipButton>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

/**
 * Load a render, resolving null rather than rejecting on failure — a direction
 * that fails to load simply contributes nothing to the measurement.
 *
 * Cross-origin, so the canvas it is drawn into stays readable (ragassets sends
 * the headers for it), and deliberately NOT through sim/imageCache: that cache
 * is unbounded and session-lifetime, sized for the map's fixed set of character
 * frames, while this url space is the whole catalogue crossed with every
 * direction. These are wanted for one pass and then collectable.
 */
function decode(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Composite every direction onto one canvas and read the box of drawn pixels —
 *  the union across all of them, in one scan. Null when nothing drew, or when
 *  the canvas turns out not to be readable (the caller has a fallback). */
function unionBounds(imgs: (HTMLImageElement | null)[], metrics: CanvasMetrics): Bounds | null {
  const canvas = document.createElement("canvas");
  canvas.width = metrics.w;
  canvas.height = metrics.h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  let drew = false;
  for (const img of imgs) {
    if (!img) continue;
    ctx.drawImage(img, 0, 0);
    drew = true;
  }
  if (!drew) return null;
  try {
    return alphaBounds(ctx.getImageData(0, 0, metrics.w, metrics.h).data, metrics.w, metrics.h);
  } catch {
    return null;
  }
}

/**
 * The window of the render canvas the viewer shows.
 *
 * From the measured pixels when we have them, widened to `maxW × maxH` — the
 * scan sees one frame per direction, while those cover every frame, so a
 * costume that only reaches its full width mid-animation still fits.
 *
 * With no pixel reading (a canvas the browser won't let us read), fall back to
 * placing a maxW × maxH window on the feet, using the per-pose table that
 * already records how far below the origin each pose reaches. Less exact, but
 * the feet still land where the effects expect them.
 */
function windowFor(
  bounds: Bounds | null,
  metrics: CanvasMetrics,
  maxW: number,
  maxH: number,
  action: number,
): { minX: number; minY: number; w: number; h: number } {
  let minX: number;
  let minY: number;
  let w: number;
  let h: number;
  if (bounds) {
    minX = bounds.minX;
    minY = bounds.minY;
    w = bounds.maxX - bounds.minX + 1;
    h = bounds.maxY - bounds.minY + 1;
    if (maxW > w) {
      minX -= Math.ceil((maxW - w) / 2);
      w = maxW;
    }
    if (maxH > h) {
      minY -= Math.ceil((maxH - h) / 2);
      h = maxH;
    }
  } else {
    w = maxW;
    h = maxH;
    minX = metrics.anchorX - Math.round(w / 2);
    minY = metrics.anchorY - h + (ACTION_BELOW_ORIGIN[action] ?? 10);
  }
  // Never past the canvas: outside it there is nothing to show.
  w = Math.min(w, metrics.w);
  h = Math.min(h, metrics.h);
  minX = Math.min(Math.max(minX, 0), metrics.w - w);
  minY = Math.min(Math.max(minY, 0), metrics.h - h);
  return { minX, minY, w, h };
}

/** The character's feet as a CSS `transform-origin`, so a scaled paper-doll
 *  (the Miniatura stone halves it) pivots about the point it stands on rather
 *  than about the middle of a mostly-empty render canvas. */
function feetOrigin(m: CanvasMetrics): string {
  return `${(m.anchorX / m.w) * 100}% ${(m.anchorY / m.h) * 100}%`;
}

/** A layout for an overlay that shows one render canvas at `scale`, with the
 *  canvas' own origin as the ground point. */
function layoutFor(metrics: CanvasMetrics, scale: number, cssW: number, cssH: number): StageLayout {
  return {
    cssW,
    cssH,
    groundX: metrics.anchorX * scale,
    groundY: metrics.anchorY * scale,
    scale,
  };
}

/**
 * Where the character goes inside the viewer's frame, and where its feet land.
 *
 * The frame holds its size while the content scales inside it, centred and
 * clipped — that is what makes zooming out reveal an effect the frame was
 * cutting off. The render canvas is bigger than the drawn-pixel window (it
 * carries margin all round), so the image is offset by the window's own origin
 * and the surplus is clipped away.
 */
function viewerBox(view: ModalView, frame: { w: number; h: number }, zoom: number) {
  const scale = view.scale * zoom;
  const winX = (frame.w - view.w * scale) / 2;
  const winY = (frame.h - view.h * scale) / 2;
  return {
    w: frame.w,
    h: frame.h,
    imgW: Math.round(view.metrics.w * scale),
    imgH: Math.round(view.metrics.h * scale),
    imgX: Math.round(winX - view.minX * scale),
    imgY: Math.round(winY - view.minY * scale),
    // The feet, in the OVERLAY's coordinates — which span the whole box, gutters
    // included, so an effect can reach past the character's own window instead
    // of being cut at it.
    groundX: VIEWER_PAD_X + winX + (view.metrics.anchorX - view.minX) * scale,
    groundY: VIEWER_PAD_Y + winY + (view.metrics.anchorY - view.minY) * scale,
    scale,
  };
}

/**
 * Keep the floating window grabbable.
 *
 * The drag grip runs along the top of the window, inset from both corners, so
 * "some pixels still visible" isn't enough — a window pushed far enough off the
 * left takes the grip with it and can never be dragged back. Left is therefore
 * held at the edge, and only allowed past it by however much the window is
 * wider than the viewport (otherwise its right half would be unreachable
 * instead). Top and bottom keep DRAG_MARGIN of the window on screen.
 */
function clampWin(x: number, y: number, width: number): { x: number; y: number } {
  const minX = Math.min(0, window.innerWidth - width);
  return {
    x: Math.round(Math.min(Math.max(x, minX), Math.max(minX, window.innerWidth - DRAG_MARGIN))),
    y: Math.round(Math.min(Math.max(y, 0), Math.max(0, window.innerHeight - DRAG_MARGIN))),
  };
}

// Filesystem-friendly slug for the download filename: drop accents (pt-BR class
// names have them), lowercase, and collapse anything else to single hyphens.
function slug(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/[^\x00-\x7F]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "sprite"
  );
}

// The rotation arrows (ragassets turn-button sprites) flank the character like
// the in-game creation screen: the body pair at the character's sides, the head
// pair at the same x but higher. Head rotation only applies to idle/sit; its
// arrows are hidden otherwise.
function StageArrow({
  side,
  rowKind,
  hidden,
  onClick,
}: {
  side: "left" | "right";
  rowKind: "head" | "body";
  hidden?: boolean;
  onClick: () => void;
}) {
  const tip =
    rowKind === "head"
      ? side === "left"
        ? t.rotateHeadLeft
        : t.rotateHeadRight
      : side === "left"
        ? t.rotateLeft
        : t.rotateRight;
  return (
    <TipButton
      className={`stage-arrow arrow-${side} arrow-${rowKind}`}
      tip={tip}
      hidden={hidden}
      onClick={onClick}
    />
  );
}
