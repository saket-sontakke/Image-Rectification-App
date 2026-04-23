// components/DebugPipeline.tsx

import React from "react";

interface DebugPipelineProps {
  grayRef: React.RefObject<HTMLCanvasElement | null>;
  blurRef: React.RefObject<HTMLCanvasElement | null>;
  edgeRef: React.RefObject<HTMLCanvasElement | null>;
  dilateRef: React.RefObject<HTMLCanvasElement | null>;
  contourRef: React.RefObject<HTMLCanvasElement | null>;
  polyRef: React.RefObject<HTMLCanvasElement | null>;
}

function DebugStep({ title, canvasRef }: { title: string; canvasRef: React.RefObject<HTMLCanvasElement | null> }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">{title}</span>
      <canvas ref={canvasRef as React.RefObject<HTMLCanvasElement>} className="w-full h-auto bg-black border border-gray-800 rounded opacity-80" />
    </div>
  );
}

export default function DebugPipeline({ grayRef, blurRef, edgeRef, dilateRef, contourRef, polyRef }: DebugPipelineProps) {
  return (
    <div className="mt-12 p-6 border border-gray-800 bg-gray-900/50 rounded-xl w-full max-w-5xl">
      <h3 className="text-sm font-bold tracking-widest uppercase text-gray-400 mb-6 border-b border-gray-800 pb-2">
        OpenCV Edge Detection & Corner Approximation
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
        <DebugStep title="1. Grayscale" canvasRef={grayRef} />
        <DebugStep title="2. Gaussian Blur (9x9)" canvasRef={blurRef} />
        <DebugStep title="3. Canny Edges" canvasRef={edgeRef} />
        <DebugStep title="4. Morphological Close" canvasRef={dilateRef} />
        <DebugStep title="5. Extracted Contours" canvasRef={contourRef} />
        <DebugStep title="6. Polygon Approx. (Corners)" canvasRef={polyRef} />
      </div>
    </div>
  );
}