'use client';

import { useEffect } from 'react';

let lockCount = 0;
let previousOverflow = '';
let previousPaddingRight = '';
let previousTouchAction = '';
let previousOverscrollBehavior = '';

function applyBodyLock(): void {
  const body = document.body;

  previousOverflow = body.style.overflow;
  previousPaddingRight = body.style.paddingRight;
  previousTouchAction = body.style.touchAction;
  previousOverscrollBehavior = body.style.overscrollBehavior;

  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
  if (scrollbarWidth > 0) {
    const currentPaddingRight = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0;
    body.style.paddingRight = `${currentPaddingRight + scrollbarWidth}px`;
  }

  body.style.overflow = 'hidden';
  body.style.touchAction = 'none';
  body.style.overscrollBehavior = 'none';
}

function releaseBodyLock(): void {
  const body = document.body;
  body.style.overflow = previousOverflow;
  body.style.paddingRight = previousPaddingRight;
  body.style.touchAction = previousTouchAction;
  body.style.overscrollBehavior = previousOverscrollBehavior;
}

function lockBodyScroll(): () => void {
  if (typeof document === 'undefined') {
    return () => { };
  }

  if (lockCount === 0) {
    applyBodyLock();
  }
  lockCount += 1;

  return () => {
    if (typeof document === 'undefined') return;
    if (lockCount === 0) return;

    lockCount -= 1;
    if (lockCount === 0) {
      releaseBodyLock();
    }
  };
}

export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;
    return lockBodyScroll();
  }, [locked]);
}
