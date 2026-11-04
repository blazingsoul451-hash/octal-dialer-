---
name: threejs-and-canvas-scrollytelling
description: HTML5 canvas audio waveform visualizers, React Three Fiber hardware models, scroll-driven interactive state, and zero-overhead lazy rendering with off-screen loop pausing.
---

# Three.js and Canvas Scrollytelling

Modern high-converting product pages frequently showcase real hardware (cellular SIM dongles, Android dialer phones, server racks) and live audio/voice frequency visualizations. This skill establishes lightweight canvas loops and React Three Fiber scrollytelling without bloating initial load times.

---

## 1. Lightweight HTML5 Audio Waveform Visualizer

For voice AI or live telephony demonstrations, render animated audio waveforms via 2D canvas with zero external library overhead:

```tsx
import React, { useEffect, useRef } from 'react';

interface AudioWaveformProps {
  isActive?: boolean;
  barColor?: string;
  isLight?: boolean;
}

export const AudioWaveformVisualizer = ({ isActive = true, barColor = '#f59e0b', isLight }: AudioWaveformProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let phase = 0;
    const numBars = 32;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const width = canvas.width;
      const height = canvas.height;
      const barWidth = width / numBars - 2;

      for (let i = 0; i < numBars; i++) {
        const amplitude = isActive
          ? Math.sin(phase + i * 0.3) * 0.4 + Math.sin(phase * 1.5 + i * 0.1) * 0.3 + 0.3
          : 0.1;
        const barHeight = Math.max(4, amplitude * height);
        const x = i * (barWidth + 2);
        const y = (height - barHeight) / 2;

        ctx.fillStyle = barColor;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 3);
        ctx.fill();
      }

      phase += 0.05;
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isActive, barColor]);

  return (
    <div className={`p-4 rounded-xl border ${isLight ? 'bg-slate-100 border-slate-200' : 'bg-[#09090b] border-[#18181b]'}`}>
      <canvas ref={canvasRef} width={280} height={48} className="w-full h-12 block" />
    </div>
  );
};
```

---

## 2. React Three Fiber Architecture & Lazy Loading

Never bundle Three.js into the main bundle. Always lazy-load 3D views with `React.lazy()` and `<Suspense>`:

```tsx
import React, { Suspense, lazy } from 'react';

// Lazy load the heavy 3D canvas chunk
const LazyHardwareModel = lazy(() => import('./HardwareDeviceScene'));

export const InteractiveHardwareShowcase = ({ isLight }: { isLight?: boolean }) => (
  <div className="relative w-full h-[500px] flex items-center justify-center">
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center gap-3 text-zinc-500 font-mono text-xs">
          <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <span>INITIALIZING HARDWARE VIEWPORT...</span>
        </div>
      }
    >
      <LazyHardwareModel isLight={isLight} />
    </Suspense>
  </div>
);
```

---

## 3. Off-Screen Render Loop Pausing (Zero GPU Drain)

Running a continuous `requestAnimationFrame` render loop when the element is off-screen wastes battery and triggers thermal throttling.
**Protocol:** Use an `IntersectionObserver` to halt canvas rendering when scrolled out of view.

```typescript
// Inside 3D Canvas / Scene hook
useEffect(() => {
  const observer = new IntersectionObserver(([entry]) => {
    setIsInView(entry.isIntersecting);
  }, { threshold: 0.1 });

  if (containerRef.current) observer.observe(containerRef.current);
  return () => observer.disconnect();
}, []);
```

---

## 4. Scroll-Driven 3D Scrollytelling Sync

Synchronize scroll depth to 3D model rotation and corresponding feature callouts:

```tsx
import { useScroll, useTransform } from 'framer-motion';

export const ScrollytellingSection = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  // Map scroll 0 -> 1 to phone rotation degrees
  const rotationY = useTransform(scrollYProgress, [0, 0.5, 1], [0, 90, 180]);
  const activeStep = useTransform(scrollYProgress, (val) => Math.min(2, Math.floor(val * 3)));

  return (
    <div ref={containerRef} className="relative h-[300vh]">
      <div className="sticky top-20 h-screen grid grid-cols-1 lg:grid-cols-2 items-center">
        {/* Left: 3D or Mockup Canvas driven by rotationY */}
        {/* Right: Dynamic feature card reacting to activeStep */}
      </div>
    </div>
  );
};
```

---

## 5. Performance Safeguards

- Cap device pixel ratio at `Math.min(window.devicePixelRatio, 2)` to avoid rendering 4K textures on mobile screens.
- Clean up WebGL contexts and geometries on component unmount (`geometry.dispose()`, `material.dispose()`).
- Fall back gracefully to a high-fidelity SVG/WebP vector illustration if WebGL is unavailable or fails to initialize.
