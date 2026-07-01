// Character preview: the APNG render plus body/head rotation, the action
// picker, and (for animated actions) a play/pause toggle with a frame scrubber.
// Each action button's icon is a STILL frame of the actual character being
// built — full-body framed (actionIconCanvas) so head and feet aren't cut —
// always facing south.
//
// Animations come back from ragassets as APNG (which the browser plays on its
// own). To "pause", we swap the <img> to a single still frame (frame=N). The
// frame count per action is the static table in core/state.ts. Local playback
// state (playing / frame) is deliberately NOT part of the shareable build.

import { useEffect, useRef, useState } from "react";
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
import { mountsFor } from "../core/mounts";
import { t } from "../i18n";
import { useFrameCount } from "../hooks/useFrameCount";
import { usePreloadedImage } from "../hooks/usePreloadedImage";
import { useAppState, useDb, useDispatch } from "../state/AppStateContext";
import { TipButton } from "./TipButton";
import { ChevronLeft, ChevronRight, Download, Expand, Map, Pause, Play } from "./icons";

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
    setModalBox(undefined);
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
  const LOUPE_SIZE = 200;
  const LOUPE_ZOOM = 2.5;
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

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modalOpen]);

  // Preload every body/head-direction sprite for the current action once the
  // modal opens, take the max width/height across them all, and lock the box to
  // that size. The individual sprite still renders at its own natural × scale
  // (flex-centered in the box), so rotation swaps sprites but the frame stays
  // put instead of jumping to each variant's tight bbox.
  useEffect(() => {
    if (!modalOpen) return;
    let cancelled = false;
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
      setModalBox({ w: Math.round(maxW * scale), h: Math.round(maxH * scale), scale });
    });
    return () => {
      cancelled = true;
    };
    // Depend on `state` wholesale: rotating (bodyDir/headDir) also triggers
    // this, but the URLs are cached and the recomputed max is identical, so
    // it's a no-op re-set. Anything that *does* change the sprite bbox
    // (costume, action, mount, class, colours…) correctly reruns.
  }, [modalOpen, state, headAllowed]);

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
  const displayScale =
    modalBox?.scale ??
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
  const modalSize =
    modalNatural && displayScale
      ? {
          w: Math.round(modalNatural.w * displayScale),
          h: Math.round(modalNatural.h * displayScale),
        }
      : undefined;

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
              <TipButton
                key={a.type}
                className={selected ? "action-btn is-selected" : "action-btn"}
                tip={t.actions[a.key]}
                aria-pressed={selected}
                onClick={() => dispatch({ type: "setAction", action: a.type })}
              >
                <span className="action-clip">
                  <img className="action-icon" src={icon} alt="" loading="lazy" decoding="async" />
                </span>
              </TipButton>
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
        className="sprite-modal"
        hidden={!modalOpen}
        onClick={(e) => {
          if (e.target === e.currentTarget) closeModal();
        }}
      >
        <div
          className="sprite-modal-box"
          style={modalBox ? { width: modalBox.w, height: modalBox.h } : undefined}
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
          <TipButton
            className="sprite-modal-download"
            tip={downloadFailed ? t.downloadError : t.downloadImage}
            disabled={downloading}
            aria-busy={downloading}
            onClick={downloadSprite}
          >
            <Download />
          </TipButton>
          <TipButton className="sprite-modal-close game-close" tip={t.closeModal} onClick={closeModal} />
        </div>
      </div>
    </div>
  );
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
