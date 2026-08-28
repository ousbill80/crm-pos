import { useEffect, useRef, useState } from 'react';

/** Active true quand l’élément approche du viewport (lazy sections / fetch). */
export function useInView<T extends Element>(
  options?: IntersectionObserverInit & { once?: boolean },
) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  const once = options?.once ?? true;

  useEffect(() => {
    const el = ref.current;
    if (!el || (once && inView)) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          if (once) obs.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      {
        root: options?.root ?? null,
        rootMargin: options?.rootMargin ?? '200px 0px',
        threshold: options?.threshold ?? 0.01,
      },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [inView, once, options?.root, options?.rootMargin, options?.threshold]);

  return { ref, inView };
}
