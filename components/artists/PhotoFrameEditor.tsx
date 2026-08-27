'use client';

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent,
} from 'react';
import {
  clampOffset,
  coverScale,
  FRAME_OUTPUT_PX,
  FRAME_VIEWPORT_PX,
  MAX_ZOOM,
  MIN_ZOOM,
  zoomAroundCenter,
} from '@/lib/images/photoFrame';

export interface PhotoFrameEditorHandle {
  exportJpeg: () => Promise<Blob>;
}

interface PhotoFrameEditorProps {
  src: string;
  disabled?: boolean;
}

export const PhotoFrameEditor = forwardRef<PhotoFrameEditorHandle, PhotoFrameEditorProps>(
  function PhotoFrameEditor({ src, disabled = false }, ref) {
    const imageRef = useRef<HTMLImageElement | null>(null);
    const dragRef = useRef<{
      pointerId: number;
      startX: number;
      startY: number;
      originX: number;
      originY: number;
    } | null>(null);

    const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
    const [zoom, setZoom] = useState(MIN_ZOOM);
    const [offset, setOffset] = useState({ x: 0, y: 0 });

    const baseScale = natural
      ? coverScale(natural.w, natural.h, FRAME_VIEWPORT_PX)
      : 1;
    const scale = baseScale * zoom;
    const drawnW = natural ? natural.w * scale : FRAME_VIEWPORT_PX;
    const drawnH = natural ? natural.h * scale : FRAME_VIEWPORT_PX;

    const applyClampedOffset = useCallback(
      (x: number, y: number, nextDrawnW: number, nextDrawnH: number) => {
        setOffset({
          x: clampOffset(x, nextDrawnW, FRAME_VIEWPORT_PX),
          y: clampOffset(y, nextDrawnH, FRAME_VIEWPORT_PX),
        });
      },
      []
    );

    const handleImageLoad = (img: HTMLImageElement) => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      setNatural({ w, h });
      const cover = coverScale(w, h, FRAME_VIEWPORT_PX);
      applyClampedOffset(
        (FRAME_VIEWPORT_PX - w * cover) / 2,
        (FRAME_VIEWPORT_PX - h * cover) / 2,
        w * cover,
        h * cover
      );
    };

    const handleZoom = (nextZoom: number) => {
      if (!natural) return;
      const prevScale = baseScale * zoom;
      const nextScale = baseScale * nextZoom;
      const around = zoomAroundCenter(
        prevScale,
        nextScale,
        offset.x,
        offset.y,
        FRAME_VIEWPORT_PX
      );
      setZoom(nextZoom);
      applyClampedOffset(
        around.offsetX,
        around.offsetY,
        natural.w * nextScale,
        natural.h * nextScale
      );
    };

    const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: offset.x,
        originY: offset.y,
      };
    };

    const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      applyClampedOffset(
        drag.originX + (event.clientX - drag.startX),
        drag.originY + (event.clientY - drag.startY),
        drawnW,
        drawnH
      );
    };

    const endDrag = (event: PointerEvent<HTMLDivElement>) => {
      if (dragRef.current?.pointerId === event.pointerId) {
        dragRef.current = null;
      }
    };

    useImperativeHandle(ref, () => ({
      exportJpeg: async () => {
        const image = imageRef.current;
        if (!image || !natural) {
          throw new Error('Choose a photo first.');
        }
        const canvas = document.createElement('canvas');
        canvas.width = FRAME_OUTPUT_PX;
        canvas.height = FRAME_OUTPUT_PX;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not frame that photo.');
        const ratio = FRAME_OUTPUT_PX / FRAME_VIEWPORT_PX;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, FRAME_OUTPUT_PX, FRAME_OUTPUT_PX);
        ctx.drawImage(
          image,
          offset.x * ratio,
          offset.y * ratio,
          natural.w * scale * ratio,
          natural.h * scale * ratio
        );
        const blob = await new Promise<Blob | null>(resolve =>
          canvas.toBlob(resolve, 'image/jpeg', 0.9)
        );
        if (!blob) throw new Error('Could not export that photo.');
        return blob;
      },
    }));

    return (
      <div className="space-y-3">
        <div
          className={`relative mx-auto overflow-hidden rounded-2xl bg-muted touch-none ${
            disabled ? 'cursor-not-allowed opacity-70' : 'cursor-grab active:cursor-grabbing'
          }`}
          style={{ width: FRAME_VIEWPORT_PX, height: FRAME_VIEWPORT_PX }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          role="img"
          aria-label="Photo frame. Drag to pan the face into the circle."
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imageRef}
            src={src}
            alt=""
            draggable={false}
            onLoad={e => handleImageLoad(e.currentTarget)}
            className={`absolute left-0 top-0 max-w-none select-none pointer-events-none ${
              natural ? 'opacity-100' : 'opacity-0'
            }`}
            style={{
              width: natural ? natural.w * scale : undefined,
              height: natural ? natural.h * scale : undefined,
              transform: `translate(${offset.x}px, ${offset.y}px)`,
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-white/80"
            style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }}
          />
        </div>
        <div>
          <label htmlFor="look-zoom" className="block text-xs font-medium text-muted-foreground mb-1">
            Zoom
          </label>
          <input
            id="look-zoom"
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            disabled={disabled || !natural}
            onChange={e => handleZoom(Number(e.target.value))}
            className="w-full accent-accent"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Drag to pan so the face sits in the circle. Zoom in if you need a tighter crop.
          </p>
        </div>
      </div>
    );
  }
);
