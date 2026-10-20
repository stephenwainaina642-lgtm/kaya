import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';

export interface SignaturePadHandle {
  /** Returns a PNG data: URL of the current drawing, or null if nothing's been drawn. */
  toDataUrl: () => string | null;
  clear: () => void;
}

/**
 * A plain-canvas signature pad — mouse and touch, no external library. The
 * canvas is sized to its container in CSS pixels but drawn at devicePixelRatio
 * for a crisp line on high-DPI screens.
 */
export const SignaturePad = forwardRef<SignaturePadHandle, { height?: number }>(function SignaturePad({ height = 160 }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);
  const hasInkRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ratio = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1f2a24';
    }
  }, [height]);

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    drawingRef.current = true;
    lastPointRef.current = pointFromEvent(e);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    const last = lastPointRef.current;
    const point = pointFromEvent(e);
    if (ctx && last) {
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
      hasInkRef.current = true;
      setIsEmpty(false);
    }
    lastPointRef.current = point;
  }

  function end() {
    drawingRef.current = false;
    lastPointRef.current = null;
  }

  useImperativeHandle(ref, () => ({
    toDataUrl: () => (hasInkRef.current ? canvasRef.current?.toDataURL('image/png') ?? null : null),
    clear: () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      hasInkRef.current = false;
      setIsEmpty(true);
    },
  }));

  return (
    <div ref={containerRef} className="relative rounded-control border border-line bg-white">
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="w-full touch-none"
        style={{ height }}
      />
      {isEmpty && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-faint">
          Sign here
        </p>
      )}
    </div>
  );
});
