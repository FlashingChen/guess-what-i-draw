"use client";

import { useChatStore } from "@/store/useChatStore";

/** 轻提示。目前只用于「空画板不让猜」这一种情况。 */
export default function Toast() {
  const toast = useChatStore((state) => state.toast);
  if (!toast) return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed bottom-28 left-1/2 z-50 -translate-x-1/2"
    >
      <p className="rounded-full bg-slate-900/90 px-4 py-2 text-sm text-white shadow-lg">
        {toast}
      </p>
    </div>
  );
}
