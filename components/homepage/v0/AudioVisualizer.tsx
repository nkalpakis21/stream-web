'use client';

import { useEffect, useRef } from 'react';

export function AudioVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = 800;
    const height = 120;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const barCount = 64;
    const barWidth = width / barCount - 2;
    const phases = Array.from({ length: barCount }, () => Math.random() * Math.PI * 2);
    const speeds = Array.from({ length: barCount }, () => 0.02 + Math.random() * 0.04);
    const amplitudes = Array.from({ length: barCount }, (_, i) => {
      const center = barCount / 2;
      const dist = Math.abs(i - center) / center;
      return 0.3 + (1 - dist) * 0.7;
    });

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < barCount; i++) {
        phases[i] += speeds[i];
        const value = (Math.sin(phases[i]) + 1) / 2;
        const barHeight = 8 + value * amplitudes[i] * (height - 16);
        const x = i * (barWidth + 2);
        const y = (height - barHeight) / 2;

        const alpha = 0.3 + value * 0.5;
        ctx.fillStyle = `hsla(239, 84%, 67%, ${alpha})`;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 3);
        ctx.fill();
      }

      animationRef.current = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, []);

  return (
    <div className="flex items-center justify-center">
      <canvas
        ref={canvasRef}
        className="w-full max-w-[800px] h-[120px] opacity-60"
        aria-hidden="true"
      />
    </div>
  );
}
