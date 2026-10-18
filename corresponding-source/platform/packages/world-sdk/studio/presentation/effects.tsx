import { useState, useRef, useEffect, useMemo } from 'react';
interface MatrixRainProps {
  speed?: number;    // interval delay ms — lower = faster (default 45)
  opacity?: number;  // canvas opacity 0-1 (default 1)
  density?: number;  // font size px — smaller = more columns/denser (default 13)
}

export function MatrixRain({ speed = 45, opacity = 1, density = 13 }: MatrixRainProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const resize = () => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    const observer = new ResizeObserver(resize); observer.observe(canvas); 

    const chars = 'アイウエオカキクケコサシスセソタチツテトABCDEF0123456789<>{}[]|\\/*;:';
    let cols = Math.floor(canvas.width / density);
    let drops = Array(cols).fill(0).map(() => Math.random() * -50);

    const draw = () => {
      ctx.fillStyle = 'rgba(0,0,0,0.04)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      cols = Math.floor(canvas.width / density);
      if (drops.length !== cols) drops = Array(cols).fill(0);
      drops.forEach((y, x) => {
        const c = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillStyle = '#aaffaa';
        ctx.font = `bold ${density}px monospace`;
        ctx.fillText(c, x * density, y * density);
        ctx.fillStyle = '#00bb33';
        ctx.font = `${density}px monospace`;
        if (y * density > canvas.height && Math.random() > 0.975) drops[x] = 0;
        else drops[x] += 1;
      });
    };

    const id = setInterval(draw, speed);
    return () => { clearInterval(id); observer.disconnect(); };
  }, [speed, density]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 1, opacity }}
    />
  );
}

// ── Emoji rain ────────────────────────────────────────────────────────────────
export function EmojiRain({ pack, onDone }: { pack: string[]; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 5000);
    return () => clearTimeout(t);
  }, [onDone]);

  const particles = useMemo(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      emoji: pack[Math.floor(Math.random() * pack.length)],
      left:  Math.random() * 95 + 2,
      delay: Math.random() * 2.8,
      dur:   2.2 + Math.random() * 2.5,
      size:  1.3 + Math.random() * 1.8,
      spin:  (Math.random() - 0.5) * 540,
    })),
  [pack]);

  return (
    <>
      <style>{`
        @keyframes emoji-rise {
          0%   { transform: translateY(0) translateX(0) scale(1);       opacity: 1; }
          60%  { opacity: 1; }
          100% { transform: translateY(-110vh) translateX(var(--e-dx)) scale(0.7); opacity: 0; }
        }
      `}</style>
      <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 60 }}>
        {particles.map(p => (
          <span
            key={p.id}
            className="absolute bottom-0 select-none"
            style={{
              left: `${p.left}%`,
              fontSize: `${p.size}rem`,
              '--e-dx': `${p.spin / 15}px`,
              animation: `emoji-rise ${p.dur}s ${p.delay}s ease-out forwards`,
            } as React.CSSProperties}
          >
            {p.emoji}
          </span>
        ))}
      </div>
    </>
  );
}


// ── Snow ──────────────────────────────────────────────────────────────────────
export function SnowEffect({ speed = 60, density = 150, opacity = 1 }: { speed?: number; density?: number; opacity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize(); const observer = new ResizeObserver(resize); observer.observe(canvas); 
    const flakes = Array.from({ length: density }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      r: Math.random() * 3 + 1, vx: (Math.random() - 0.5) * 0.5, vy: Math.random() * 1 + 0.5,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      flakes.forEach(f => {
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
        f.x += f.vx; f.y += f.vy;
        if (f.y > canvas.height) { f.y = -5; f.x = Math.random() * canvas.width; }
        if (f.x < 0) f.x = canvas.width; if (f.x > canvas.width) f.x = 0;
      });
    };
    const id = setInterval(draw, speed);
    return () => { clearInterval(id); observer.disconnect(); };
  }, [speed, density]);
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 2, opacity }} />;
}

// ── Fireflies ─────────────────────────────────────────────────────────────────
export function FirefliesEffect({ count = 30, speed = 1, opacity = 1 }: { count?: number; speed?: number; opacity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize(); const observer = new ResizeObserver(resize); observer.observe(canvas); 
    const flies = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      r: Math.random() * 2.5 + 1, vx: (Math.random() - 0.5) * speed, vy: (Math.random() - 0.5) * speed,
      phase: Math.random() * Math.PI * 2, hue: Math.random() * 60 + 60,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      flies.forEach(f => {
        f.phase += 0.04;
        const glow = (Math.sin(f.phase) + 1) / 2;
        const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 10);
        grad.addColorStop(0, `hsla(${f.hue},100%,70%,${0.9 * glow})`);
        grad.addColorStop(1, `hsla(${f.hue},100%,70%,0)`);
        ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `hsla(${f.hue},100%,95%,${glow})`;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
        f.x += f.vx; f.y += f.vy;
        if (f.x < 0 || f.x > canvas.width) f.vx *= -1;
        if (f.y < 0 || f.y > canvas.height) f.vy *= -1;
      });
    };
    const id = setInterval(draw, 33);
    return () => { clearInterval(id); observer.disconnect(); };
  }, [count, speed]);
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 2, opacity }} />;
}

// ── Starfield ─────────────────────────────────────────────────────────────────
export function StarfieldEffect({ speed = 2, count = 200, opacity = 1 }: { speed?: number; count?: number; opacity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize(); const observer = new ResizeObserver(resize); observer.observe(canvas); 
    const stars = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width - canvas.width / 2,
      y: Math.random() * canvas.height - canvas.height / 2,
      z: Math.random() * canvas.width,
    }));
    const draw = () => {
      const cx = canvas.width / 2, cy = canvas.height / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      stars.forEach(s => {
        s.z -= speed;
        if (s.z <= 0) { s.x = Math.random() * canvas.width - cx; s.y = Math.random() * canvas.height - cy; s.z = canvas.width; }
        const k = 128 / s.z;
        const sx = s.x * k + cx, sy = s.y * k + cy;
        const r = Math.max(0.1, (1 - s.z / canvas.width) * 2.5);
        ctx.fillStyle = `rgba(255,255,255,${1 - s.z / canvas.width})`;
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
      });
    };
    const id = setInterval(draw, 16);
    return () => { clearInterval(id); observer.disconnect(); };
  }, [speed, count]);
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 2, opacity }} />;
}

// ── Rain ──────────────────────────────────────────────────────────────────────
export function RainEffect({ intensity = 200, speed = 15, opacity = 0.6 }: { intensity?: number; speed?: number; opacity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize(); const observer = new ResizeObserver(resize); observer.observe(canvas); 
    const drops = Array.from({ length: intensity }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      len: Math.random() * 15 + 10, spd: Math.random() * speed + speed * 0.5,
    }));
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = 'rgba(174,214,241,0.5)'; ctx.lineWidth = 1;
      drops.forEach(d => {
        ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 2, d.y + d.len); ctx.stroke();
        d.y += d.spd;
        if (d.y > canvas.height) { d.y = -d.len; d.x = Math.random() * canvas.width; }
      });
    };
    const id = setInterval(draw, 20);
    return () => { clearInterval(id); observer.disconnect(); };
  }, [intensity, speed]);
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 2, opacity }} />;
}

// ── Fire ──────────────────────────────────────────────────────────────────────
export function FireEffect({ intensity = 0.8, opacity = 1 }: { intensity?: number; opacity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize(); const observer = new ResizeObserver(resize); observer.observe(canvas); 
    const particles: { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; r: number }[] = [];
    const max = Math.floor(intensity * 120);
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      while (particles.length < max) {
        particles.push({ x: Math.random() * canvas.width, y: canvas.height,
          vx: (Math.random() - 0.5) * 2, vy: -(Math.random() * 3 + 2),
          life: 0, maxLife: Math.random() * 60 + 40, r: Math.random() * 8 + 4 });
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]; p.life++;
        if (p.life > p.maxLife) { particles.splice(i, 1); continue; }
        const t = p.life / p.maxLife;
        const color = t < 0.2 ? `rgba(255,255,180,${1 - t * 2})`
          : t < 0.5 ? `rgba(255,160,0,${0.9 - t})`
          : `rgba(255,50,0,${0.6 - t * 0.6})`;
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(p.x + p.vx * p.life, p.y + p.vy * p.life, p.r * (1 - t * 0.5), 0, Math.PI * 2); ctx.fill();
      }
    };
    const id = setInterval(draw, 20);
    return () => { clearInterval(id); observer.disconnect(); };
  }, [intensity]);
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 2, opacity }} />;
}

// ── Lightning ─────────────────────────────────────────────────────────────────
export function LightningEffect({ frequency = 3, opacity = 0.8 }: { frequency?: number; opacity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize(); const observer = new ResizeObserver(resize); observer.observe(canvas); 
    let flash = 0;
    const bolt = (x1: number, y1: number, x2: number, y2: number, off: number) => {
      if (off < 3) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); return; }
      const mx = (x1 + x2) / 2 + (Math.random() - 0.5) * off;
      const my = (y1 + y2) / 2 + (Math.random() - 0.5) * off;
      bolt(x1, y1, mx, my, off / 2); bolt(mx, my, x2, y2, off / 2);
    };
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (flash > 0) {
        ctx.fillStyle = `rgba(200,220,255,${flash * 0.025})`; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = `rgba(200,220,255,${Math.min(1, flash * 0.25)})`; ctx.lineWidth = 1.5;
        ctx.shadowBlur = 18; ctx.shadowColor = '#aaccff';
        const sx = canvas.width * 0.25 + Math.random() * canvas.width * 0.5;
        bolt(sx, 0, sx + (Math.random() - 0.5) * 80, canvas.height, canvas.height / 3);
        ctx.shadowBlur = 0; flash--;
      } else if (Math.random() < frequency / 300) {
        flash = Math.floor(Math.random() * 5 + 3);
      }
    };
    const id = setInterval(draw, 30);
    return () => { clearInterval(id); observer.disconnect(); };
  }, [frequency]);
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 2, opacity }} />;
}

// ── Aurora ────────────────────────────────────────────────────────────────────
export function AuroraEffect({ speed = 1, opacity = 0.5 }: { speed?: number; opacity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize(); const observer = new ResizeObserver(resize); observer.observe(canvas); 
    let t = 0;
    const BANDS: [number, number, number][] = [[0,255,150],[0,200,255],[150,0,255],[0,255,200]];
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      t += speed * 0.005;
      BANDS.forEach(([r, g, b], i) => {
        const off = i * 0.6;
        const wave = Math.sin(t + off) * 0.12 + 0.12;
        const grad = ctx.createLinearGradient(0, 0, 0, canvas.height * 0.5);
        grad.addColorStop(0, `rgba(${r},${g},${b},${wave})`);
        grad.addColorStop(0.6, `rgba(${r},${g},${b},${wave * 0.3})`);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad; ctx.beginPath(); ctx.moveTo(0, 0);
        for (let x = 0; x <= canvas.width; x += 20) {
          const y = Math.sin((x / canvas.width) * Math.PI * 3 + t + off) * canvas.height * 0.08 + canvas.height * 0.15;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(canvas.width, 0); ctx.closePath(); ctx.fill();
      });
    };
    const id = setInterval(draw, 30);
    return () => { clearInterval(id); observer.disconnect(); };
  }, [speed]);
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 2, opacity }} />;
}

// ── Glitch ────────────────────────────────────────────────────────────────────
export function GlitchEffect({ intensity = 0.3 }: { intensity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize(); const observer = new ResizeObserver(resize); observer.observe(canvas); 
    let frames = 0;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (frames > 0) {
        const n = Math.floor(Math.random() * 4 * intensity + 1);
        for (let i = 0; i < n; i++) {
          const y = Math.floor(Math.random() * canvas.height);
          const h = Math.floor(Math.random() * 18 * intensity + 2);
          const ox = (Math.random() - 0.5) * 28 * intensity;
          ctx.fillStyle = `rgba(255,0,80,${0.12 * intensity})`; ctx.fillRect(ox, y, canvas.width, h);
          ctx.fillStyle = `rgba(0,255,255,${0.08 * intensity})`; ctx.fillRect(-ox, y + 3, canvas.width, h);
        }
        frames--;
      } else if (Math.random() < intensity * 0.08) {
        frames = Math.floor(Math.random() * 3 + 1);
      }
    };
    const id = setInterval(draw, 50);
    return () => { clearInterval(id); observer.disconnect(); };
  }, [intensity]);
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 3 }} />;
}

// ── Scanlines ─────────────────────────────────────────────────────────────────
export function ScanlinesEffect({ opacity = 0.12 }: { opacity?: number }) {
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 3, opacity, background: 'repeating-linear-gradient(0deg,transparent,transparent 1px,rgba(0,0,0,0.22) 1px,rgba(0,0,0,0.22) 2px)' }} />
  );
}

// ── Hologram ──────────────────────────────────────────────────────────────────
export function HologramEffect({ opacity = 0.3 }: { opacity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize(); const observer = new ResizeObserver(resize); observer.observe(canvas); 
    let sweepY = 0;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = 'rgba(0,200,255,0.15)'; ctx.lineWidth = 0.5;
      for (let x = 0; x <= canvas.width; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
      for (let y = 0; y <= canvas.height; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }
      ctx.fillStyle = 'rgba(0,200,255,0.5)'; ctx.fillRect(0, sweepY, canvas.width, 2);
      const sg = ctx.createLinearGradient(0, sweepY - 40, 0, sweepY);
      sg.addColorStop(0, 'transparent'); sg.addColorStop(1, 'rgba(0,200,255,0.06)');
      ctx.fillStyle = sg; ctx.fillRect(0, sweepY - 40, canvas.width, 40);
      sweepY = (sweepY + 2) % canvas.height;
    };
    const id = setInterval(draw, 20);
    return () => { clearInterval(id); observer.disconnect(); };
  }, []);
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 2, opacity }} />;
}

// ── Vignette Pulse ────────────────────────────────────────────────────────────
const VIGNETTE_COLORS: Record<string, [number, number, number]> = {
  blue: [0,120,255], red: [255,0,60], green: [0,220,100],
  purple: [180,0,255], gold: [255,180,0], cyan: [0,200,255],
};
export function VignettePulseEffect({ color = 'blue', pulseSpeed = 2, opacity = 0.6 }: { color?: string; pulseSpeed?: number; opacity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize(); const observer = new ResizeObserver(resize); observer.observe(canvas); 
    const [r, g, b] = VIGNETTE_COLORS[color] ?? VIGNETTE_COLORS.blue;
    let t = 0;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      t += pulseSpeed * 0.02;
      const alpha = 0.2 + ((Math.sin(t) + 1) / 2) * 0.4;
      const grad = ctx.createRadialGradient(canvas.width/2, canvas.height/2, canvas.width*0.3, canvas.width/2, canvas.height/2, canvas.width*0.85);
      grad.addColorStop(0, 'transparent'); grad.addColorStop(1, `rgba(${r},${g},${b},${alpha})`);
      ctx.fillStyle = grad; ctx.fillRect(0, 0, canvas.width, canvas.height);
    };
    const id = setInterval(draw, 30);
    return () => { clearInterval(id); observer.disconnect(); };
  }, [color, pulseSpeed]);
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 3, opacity }} />;
}

// ── Confetti ──────────────────────────────────────────────────────────────────
export function ConfettiEffect({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight;
    const pieces = Array.from({ length: 160 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height - canvas.height,
      w: Math.random() * 10 + 5, h: Math.random() * 6 + 3,
      vx: (Math.random() - 0.5) * 4, vy: Math.random() * 3 + 2,
      angle: Math.random() * 360, va: (Math.random() - 0.5) * 10,
      color: `hsl(${Math.random() * 360},90%,60%)`,
    }));
    let frame = 0;
    let id: ReturnType<typeof setInterval>;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach(p => {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle * Math.PI / 180);
        ctx.fillStyle = p.color; ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h); ctx.restore();
        p.x += p.vx; p.y += p.vy; p.angle += p.va; p.vy += 0.04;
      });
      frame++;
      if (frame > 200) { clearInterval(id); onDone(); }
    };
    id = setInterval(draw, 16);
    return () => clearInterval(id);
  }, [onDone]);
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 5, width: '100%', height: '100%' }} />;
}


// ── Notification toasts ───────────────────────────────────────────────────────

