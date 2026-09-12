"use client";

import { LazyMotion, domAnimation } from "framer-motion";
import type { ReactNode } from "react";

// Loads only the animation features this site actually uses (fades, slides,
// scroll-linked values, whileInView) instead of framer-motion's full
// component, which is what <motion.div> always pulls in regardless of
// which features are used. Every animated element in the tree renders via
// the lightweight <m.*> components instead.
export default function MotionProvider({ children }: { children: ReactNode }) {
  return <LazyMotion features={domAnimation}>{children}</LazyMotion>;
}
