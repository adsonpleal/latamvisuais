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

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  ACTIONS,
  actionIconCanvas,
  classOf,
  frameCountProbeUrl,
  gifUrl,
  HEAD_ROTATE_ACTIONS,
  imageUrl,
  ACTION_FRAMES,
} from "../core/state";
import { hint } from "../core/hints";
import { mountsFor } from "../core/mounts";
import { t } from "../i18n";
import { dismissTip } from "../hooks/useTooltip";
import { useFrameCount } from "../hooks/useFrameCount";
import { usePreloadedImage } from "../hooks/usePreloadedImage";
import { useAppState, useDb, useDispatch } from "../state/AppStateContext";
import { TipButton } from "./TipButton";
import { ChevronLeft, ChevronRight, Detach, Download, Expand, Map, Pause, Play } from "./icons";

/** Smallest the floating window goes, as a fraction of the full-screen box.
 *  There is no matching maximum — how big the window should be is the user's
 *  call, and the drag can only grow it as far as they can reach anyway. */
const MIN_ZOOM = 0.35;

/** Pixels of the floating window that must stay on screen while dragging. */
const DRAG_MARGIN = 48;

/** How long the sprite has to settle before recomputing the locked box. Holding
 *  an arrow key in the catalogue changes the build every few frames, and each
 *  recompute preloads two dozen sprites. */
const BOX_SETTLE_MS = 150;

const detachHint = hint("detach");

export function Preview({ onPlay }: { onPlay: () => void }) {
  const state = useAppState();
  const db = useDb();
  const dispatch = useDispatch();

  const [playing, setPlaying] = useState(true);
  const [frame, setFrame] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  // The currently-displayed sprite's *natural* dimensions; multiplied by the
  // locked scale to derive on-screen size. Stored separately from modalBox so
  // rotating swaps this (new sprite bbox) while modalBox stays fixed.
  const [modalNatural, setModalNatural] = useState<{ w: number; h: number }>();
  // Locked box dimensions (scale × max sprite bbox across all body/head dirs) so
  // the modal doesn't jump size on each rotation. Computed once per modal open.
  const [modalBox, setModalBox] = useState<{ w: number; h: number; scale: number }>();
  const [downloading, setDownloading] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  // Magnifier loupe: while the cursor is over the modal sprite, a small circular
  // popover follows it showing that region magnified further. `x`/`y` are viewport
  // coords (the loupe is position:fixed, centred on the cursor); `bgX`/`bgY` are
  // the background offset that lines the magnified pixels up under the cursor.
  const [loupe, setLoupe] = useState<{ x: number; y: number; bgX: number; bgY: number }>();
  // Floating ("detached") window: whether we're in it, where it sits in the
  // viewport, and how much of the full-screen box size it takes (capped at 1 —
  // the full-screen size is the maximum). Deliberately survives closeModal, so
  // reopening the viewer lands back in the window you left.
  const [detached, setDetached] = useState(false);
  const [winPos, setWinPos] = useState<{ x: number; y: number }>();
  const [zoom, setZoom] = useState(1);
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

  // Keep the scrubber in range when a costume change shortens the animation
  // (e.g. unequipping the wings drops idle from 24 frames back to 3).
  if (frame >= frameCount) setFrame(frameCount - 1);

  // Preload off-screen, then swap once decoded — no blank flash between renders.
  const sprite = usePreloadedImage(playing ? imageUrl(state) : imageUrl(state, { frame }));

  function stepFrame(delta: number) {
    setPlaying(false);
    setFrame((f) => (f + delta + frameCount) % frameCount);
  }

  // ---- full-sprite modal (uncropped render) ------------------------------
  const openModal = () => {
    setModalNatural(undefined);
    // The detached window keeps its size across a close/reopen; clearing the
    // box would leave it with none, since the recompute is skipped while
    // detached (see the effect below).
    if (!detached) setModalBox(undefined);
    setDownloadFailed(false);
    setModalOpen(true);
  };
  const closeModal = () => {
    setLoupe(undefined);
    setModalOpen(false);
  };

  // Loupe geometry: a LOUPE_SIZE circle magnifying the *displayed* sprite by
  // LOUPE_ZOOM. Because the sprite is already pixel-scaled, this is a further
  // zoom on top — handy for inspecting fine costume detail.
  const LOUPE_SIZE = 400;
  const LOUPE_ZOOM = 1.5;
  const onModalMove = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!modalSize) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = e.clientX - rect.left; // cursor within the displayed sprite
    const cy = e.clientY - rect.top;
    if (cx < 0 || cy < 0 || cx > rect.width || cy > rect.height) {
      setLoupe(undefined);
      return;
    }
    // Place the magnified point (cx·zoom, cy·zoom) under the loupe's centre.
    setLoupe({
      x: e.clientX,
      y: e.clientY,
      bgX: LOUPE_SIZE / 2 - cx * LOUPE_ZOOM,
      bgY: LOUPE_SIZE / 2 - cy * LOUPE_ZOOM,
    });
  };

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

  // Preload every body/head-direction sprite for the current action once the
  // modal opens, take the max width/height across them all, and lock the box to
  // that size. The individual sprite still renders at its own natural × scale
  // (flex-centered in the box), so rotation swaps sprites but the frame stays
  // put instead of jumping to each variant's tight bbox.
  useEffect(() => {
    // Once detached the box is the user's: they sized the window, so it must
    // not resize itself under their hands as costumes change — and skipping
    // this also spares two dozen preloads per costume while arrow-navigating.
    // (A sprite bigger than the window scrolls; the box is overflow:auto.)
    // Detaching is gated on a box already existing, so this can't strand the
    // window without a size.
    if (!modalOpen || detached) return;
    let cancelled = false;
    const measure = () => {
      const headDirs = headAllowed ? [0, 1, 2] : [state.headDir];
      const sizes: Promise<{ w: number; h: number }>[] = [];
      for (let bodyDir = 0; bodyDir < 8; bodyDir++) {
        for (const headDir of headDirs) {
          const url = imageUrl(state, { canvas: null, bodyDir, headDir });
          sizes.push(
            new Promise((resolve) => {
              const img = new Image();
              img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
              img.onerror = () => resolve({ w: 0, h: 0 });
              img.src = url;
            }),
          );
        }
      }
      Promise.all(sizes).then((all) => {
        if (cancelled) return;
        const maxW = Math.max(0, ...all.map((s) => s.w));
        const maxH = Math.max(0, ...all.map((s) => s.h));
        if (!maxW || !maxH) return;
        const scale = Math.max(
          1,
          Math.min(
            (window.innerWidth * 0.8) / maxW,
            (window.innerHeight * 0.78) / maxH,
            5,
          ),
        );
        const w = Math.round(maxW * scale);
        const h = Math.round(maxH * scale);
        // Rotating re-measures to the same numbers; keeping the old object
        // spares a render (and, now that this is debounced, a wasted pass).
        setModalBox((prev) =>
          prev && prev.w === w && prev.h === h && prev.scale === scale ? prev : { w, h, scale },
        );
      });
    };
    // Settle first: keyboard navigation walks the catalogue faster than these
    // requests come back, and every intermediate costume would fire its own set.
    const timer = setTimeout(measure, BOX_SETTLE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Depend on `state` wholesale: rotating (bodyDir/headDir) also triggers
    // this, but the URLs are cached and the recomputed max is identical, so
    // it's a no-op re-set. Anything that *does* change the sprite bbox
    // (costume, action, mount, class, colours…) correctly reruns.
  }, [modalOpen, state, headAllowed, detached]);

  // Mirror the preview: animate while playing, else lock to the chosen frame.
  const modalUrl = playing
    ? imageUrl(state, { canvas: null })
    : imageUrl(state, { canvas: null, frame });

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

  // Record the sprite's natural bbox — the display size falls out of
  // (natural × modalBox.scale), so once modalBox lands the current sprite
  // rescales in-place without waiting for the next onLoad.
  const onModalLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setModalNatural({ w: img.naturalWidth, h: img.naturalHeight });
  };

  // Fallback scale for the *very first* load, before modalBox resolves — fits
  // the current sprite to the viewport the same way the old code did. Once
  // modalBox arrives it overrides this and every rotation renders at the same
  // zoom.
  //
  // `zoom` belongs to the floating window: full screen always renders at 1, so
  // that path is unchanged and re-attaching a window you had resized comes back
  // full size (the zoom is dropped on the next detach, not applied here).
  // Resizing scales the box and the sprite by the same factor, which keeps a
  // small costume small relative to a big one instead of every sprite
  // stretching to fill the window.
  const activeZoom = detached ? zoom : 1;
  const pinnedScale = modalBox && modalBox.scale * activeZoom;
  const displayScale =
    pinnedScale ??
    (modalNatural
      ? Math.max(
          1,
          Math.min(
            (window.innerWidth * 0.8) / modalNatural.w,
            (window.innerHeight * 0.78) / modalNatural.h,
            5,
          ),
        )
      : undefined);
  const boxSize = modalBox
    ? { w: Math.round(modalBox.w * activeZoom), h: Math.round(modalBox.h * activeZoom) }
    : undefined;
  // The detached window doesn't resize itself, so a costume taller than the one
  // it was sized around has to give: shrink that sprite to fit rather than clip
  // it. Only ever downwards — everything that already fits keeps its scale, so
  // costumes stay comparable to each other.
  const fittedScale =
    detached && pinnedScale && modalNatural && boxSize
      ? Math.min(pinnedScale, boxSize.w / modalNatural.w, boxSize.h / modalNatural.h)
      : displayScale;
  const modalSize =
    modalNatural && fittedScale
      ? {
          w: Math.round(modalNatural.w * fittedScale),
          h: Math.round(modalNatural.h * fittedScale),
        }
      : undefined;

  // ---- floating window: detach, drag, resize -----------------------------

  // Detach in place: the box is centred by flexbox until now, so seed the
  // window at the rect it already occupies and nothing jumps.
  const toggleDetached = () => {
    detachHint.spend();
    setLoupe(undefined);
    if (!detached) {
      // Pop out in place and at the size already on screen: the click changes
      // where the view lives, nothing about how it looks. Resizing is the
      // user's next move, not this one's — so a zoom left over from a previous
      // detach is dropped rather than re-applied.
      const r = boxRef.current?.getBoundingClientRect();
      if (r?.width) setWinPos(clampWin(r.left, r.top, r.width));
      setZoom(1);
    }
    setDetached((d) => !d);
  };

  // Point the hint at the button once the viewer has settled. It retires itself
  // the first time the button is actually pressed (see hint.spend above).
  useEffect(() => {
    if (!modalOpen || detached) return;
    const id = setTimeout(() => detachHint.show(detachRef.current, t.hintDetach), 600);
    return () => clearTimeout(id);
  }, [modalOpen, detached]);

  // Both handles use pointer capture, so a fast drag that outruns the cursor
  // keeps delivering moves to the handle instead of falling off it.
  const dragRef = useRef<{ dx: number; dy: number }>(null);
  const resizeRef = useRef<{ x: number; y: number; boxW: number; boxH: number; zoom: number }>(
    null,
  );

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
    const box = boxRef.current;
    if (!d || !box) return;
    setWinPos(clampWin(e.clientX - d.dx, e.clientY - d.dy, box.offsetWidth));
  };
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const startResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!modalBox) return;
    resizeRef.current = { x: e.clientX, y: e.clientY, boxW: modalBox.w, boxH: modalBox.h, zoom };
    e.currentTarget.setPointerCapture(e.pointerId);
    dismissTip();
    e.preventDefault();
  };
  /**
   * Proportional resize — free width/height would distort the pixel art or
   * letterbox it. Only the floor is fixed: past the full-screen size is still a
   * size someone might want, and a sprite blown up further is exactly what a
   * pixel-art viewer is for.
   *
   * The one scale factor is read off *both* axes, projected onto the direction
   * the corner actually travels. Taking it from the horizontal drag alone looks
   * right until you notice the box is twice as tall as it is wide, at which
   * point every pixel sideways moves the bottom edge two, and the corner tears
   * away from the cursor. Projecting is the closest a single factor can track a
   * diagonal drag.
   */
  const onResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = resizeRef.current;
    if (!r) return;
    const travel = r.boxW * r.boxW + r.boxH * r.boxH;
    const next = r.zoom + ((e.clientX - r.x) * r.boxW + (e.clientY - r.y) * r.boxH) / travel;
    setZoom(Math.max(MIN_ZOOM, next));
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
      const box = boxRef.current;
      if (!box) return;
      setWinPos((prev) => (prev ? clampWin(prev.x, prev.y, box.offsetWidth) : prev));
    };
    window.addEventListener("resize", onResizeWindow);
    return () => window.removeEventListener("resize", onResizeWindow);
  }, [detached, modalOpen]);

  return (
    <div className="preview">
      <div className="stage-wrap">
        <div className="stage">
          <img
            className={sprite.src ? "stage-sprite is-loaded" : "stage-sprite"}
            src={sprite.src}
            alt=""
            decoding="async"
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
        <TipButton className="play-btn" tip={playing ? t.pause : t.play} onClick={() => setPlaying((p) => !p)}>
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
            setPlaying(false);
          }}
        />
        <TipButton className="frame-step" tip={t.frameNext} hidden={playing || !animated} onClick={() => stepFrame(1)}>
          <ChevronRight />
        </TipButton>
      </div>

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

      <div
        className={detached ? "sprite-modal is-detached" : "sprite-modal"}
        hidden={!modalOpen}
        onClick={(e) => {
          // The detached layer is pointer-events:none, so this can't fire there
          // — but a floating window shouldn't close on a stray click regardless.
          if (!detached && e.target === e.currentTarget) closeModal();
        }}
      >
        <div
          className="sprite-modal-box"
          ref={boxRef}
          style={{
            ...(boxSize ? { width: boxSize.w, height: boxSize.h } : null),
            ...(detached && winPos ? { left: winPos.x, top: winPos.y } : null),
          }}
        >
          <img
            className={loupe ? "sprite-modal-img is-magnifying" : "sprite-modal-img"}
            src={modalOpen ? modalUrl : undefined}
            alt=""
            style={modalSize ? { width: modalSize.w, height: modalSize.h } : undefined}
            onLoad={onModalLoad}
            onMouseMove={onModalMove}
            onMouseLeave={() => setLoupe(undefined)}
          />
          {loupe && modalSize && (
            <div
              className="sprite-loupe"
              style={{
                left: loupe.x,
                top: loupe.y,
                width: LOUPE_SIZE,
                height: LOUPE_SIZE,
                backgroundImage: `url("${modalUrl}")`,
                backgroundSize: `${modalSize.w * LOUPE_ZOOM}px ${modalSize.h * LOUPE_ZOOM}px`,
                backgroundPosition: `${loupe.bgX}px ${loupe.bgY}px`,
              }}
            />
          )}
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
          {/* Gated on the box: detaching before it lands would leave a window
              with no size, since the recompute is skipped once detached. */}
          <TipButton
            ref={detachRef}
            className="sprite-modal-detach"
            tip={detached ? t.attachPreview : t.detachPreview}
            aria-pressed={detached}
            disabled={!modalBox}
            onClick={toggleDetached}
          >
            {detached ? <Expand /> : <Detach />}
          </TipButton>
          <TipButton className="sprite-modal-close game-close" tip={t.closeModal} onClick={closeModal} />
        </div>
      </div>
    </div>
  );
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
