"use client";

import { useEffect, useMemo, useState } from "react";
import { getRespondy } from "../../lib/respondy-client";
import type { DisplayBounds } from "../../../shared/respondy-types";

type Point = { x: number; y: number };
type Rect = { x: number; y: number; width: number; height: number };

function toRect(a: Point, b: Point): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const width = Math.abs(a.x - b.x);
  const height = Math.abs(a.y - b.y);
  return { x, y, width, height };
}

export default function RegionPickerPage() {
  const [displayBounds, setDisplayBounds] = useState<DisplayBounds | null>(
    null,
  );
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const respondy = getRespondy();
    if (!respondy) return;
    void respondy
      .getDisplayBounds()
      .then((bounds) => setDisplayBounds(bounds))
      .catch(() => setDisplayBounds(null));
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        getRespondy()?.cancelOcrRegionSelection();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const previewRect = useMemo(() => {
    if (!startPoint || !currentPoint) return null;
    return toRect(startPoint, currentPoint);
  }, [startPoint, currentPoint]);

  const submitRect = (rect: Rect) => {
    if (rect.width < 8 || rect.height < 8) {
      setError("영역이 너무 작습니다. 더 크게 드래그해 주세요.");
      return;
    }
    const offsetX = displayBounds?.x ?? 0;
    const offsetY = displayBounds?.y ?? 0;
    getRespondy()?.submitOcrRegionSelection({
      x: Math.floor(rect.x + offsetX),
      y: Math.floor(rect.y + offsetY),
      width: Math.floor(rect.width),
      height: Math.floor(rect.height),
    });
  };

  return (
    <div
      className="relative h-screen w-screen cursor-crosshair bg-black/35 select-none"
      onMouseDown={(e) => {
        const point = { x: e.clientX, y: e.clientY };
        setStartPoint(point);
        setCurrentPoint(point);
        setDragging(true);
        setError(null);
      }}
      onMouseMove={(e) => {
        if (!dragging) return;
        setCurrentPoint({ x: e.clientX, y: e.clientY });
      }}
      onMouseUp={(e) => {
        if (!dragging || !startPoint) return;
        const end = { x: e.clientX, y: e.clientY };
        const rect = toRect(startPoint, end);
        setDragging(false);
        setCurrentPoint(end);
        submitRect(rect);
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 p-4">
        <div className="mx-auto max-w-xl rounded-xl border border-white/25 bg-slate-950/80 px-4 py-3 text-center text-sm text-slate-100">
          드래그해서 OCR 캡처 영역을 선택하세요. 취소는 ESC 키.
        </div>
        {error && (
          <div className="mx-auto mt-2 max-w-xl rounded-xl border border-rose-400/40 bg-rose-950/70 px-4 py-2 text-center text-sm text-rose-200">
            {error}
          </div>
        )}
      </div>

      {previewRect && (
        <div
          className="pointer-events-none absolute border-2 border-violet-300 bg-violet-500/15"
          style={{
            left: previewRect.x,
            top: previewRect.y,
            width: previewRect.width,
            height: previewRect.height,
          }}
        />
      )}
    </div>
  );
}
