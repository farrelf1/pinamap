'use client';

import { useEffect } from "react";

export default function ViewportHeightFix() {
  useEffect(() => {
    const updateHeight = () => {
      const height = window.innerHeight;
      document.documentElement.style.setProperty('--safe-height', `${height}px`);
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  return null;
}
