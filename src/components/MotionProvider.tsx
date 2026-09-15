"use client";

import { LazyMotion, domAnimation, MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

// Loads only the animation features this site actually uses (fades, slides,
// scroll-linked values, whileInView) instead of framer-motion's full
// component, which is what <motion.div> always pulls in regardless of
// which features are used. Every animated element in the tree renders via
// the lightweight <m.*> components instead.
//
// reducedMotion="user" ties every m.*/motion.* animation in the tree to the
// OS-level prefers-reduced-motion setting (framer-motion drops transform/layout
// animations to an instant transition, keeping only opacity) — the CSS
// @media(prefers-reduced-motion) override in globals.css only reaches plain
// CSS transitions/animations, not framer-motion's JS-driven ones.
export default function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
