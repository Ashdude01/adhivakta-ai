'use client';

import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';

export interface SignaturePadHandle { clear: () => void; toDataURL: () => string; isEmpty: () => boolean; }

const SignaturePad = forwardRef<SignaturePadHandle>(function SignaturePad(_props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const empty = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = 170 * dpr;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#1B1830';
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const pos = (e: PointerEvent | React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: (e as any).clientX - rect.left, y: (e as any).clientY - rect.top };
  };
  const start = (e: React.PointerEvent) => {
    drawing.current = true; empty.current = false;
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = pos(e); ctx.beginPath(); ctx.moveTo(x, y);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = pos(e); ctx.lineTo(x, y); ctx.stroke();
  };
  const end = () => { drawing.current = false; };

  useImperativeHandle(ref, () => ({
    clear: () => {
      const c = canvasRef.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); empty.current = true;
    },
    toDataURL: () => canvasRef.current!.toDataURL('image/png'),
    isEmpty: () => empty.current,
  }));

  return (
    <canvas ref={canvasRef} className="sigpad" style={{ height: 170 }}
      onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end} />
  );
});

export default SignaturePad;
