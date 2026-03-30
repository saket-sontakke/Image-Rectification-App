"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import 'katex/dist/katex.min.css';
import { BlockMath, InlineMath } from 'react-katex';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface Point {
  x: number;
  y: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const orderPoints = (pts: Point[]): Point[] => {
  const sortedY = [...pts].sort((a, b) => a.y - b.y);
  const top = sortedY.slice(0, 2).sort((a, b) => a.x - b.x);    
  const bottom = sortedY.slice(2, 4).sort((a, b) => a.x - b.x); 
  return [top[0], top[1], bottom[1], bottom[0]]; 
};

function fmt(n: number): string {
  return n.toFixed(6);
}

// Debug Canvas Component
function DebugStep({ title, canvasRef }: { title: string; canvasRef: React.RefObject<HTMLCanvasElement | null> }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">{title}</span>
      <canvas ref={canvasRef} className="w-full h-auto bg-black border border-gray-800 rounded opacity-80" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function Home() {
  const visibleCanvasRef = useRef<HTMLCanvasElement>(null);
  const cleanCanvasRef   = useRef<HTMLCanvasElement>(null);
  const outputRef        = useRef<HTMLCanvasElement>(null);

  // CV Pipeline Refs
  const grayRef    = useRef<HTMLCanvasElement>(null);
  const blurRef    = useRef<HTMLCanvasElement>(null);
  const edgeRef    = useRef<HTMLCanvasElement>(null);
  const dilateRef  = useRef<HTMLCanvasElement>(null);
  const contourRef = useRef<HTMLCanvasElement>(null);
  const polyRef    = useRef<HTMLCanvasElement>(null);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragIdxRef = useRef<number>(-1);

  const [image,       setImage]       = useState<string | null>(null);
  const [imgSize,     setImgSize]     = useState<{ w: number; h: number } | null>(null);
  const [points,      setPoints]      = useState<Point[]>([]);
  const [dragTick,    setDragTick]    = useState(0);
  const [matrix,      setMatrix]      = useState<number[][] | null>(null);
  const [detectMsg,   setDetectMsg]   = useState<string>("");
  const [outSize,     setOutSize]     = useState<{ w: number; h: number } | null>(null);
  const [forceA4,     setForceA4]     = useState<boolean>(false);
  const [rotation,    setRotation]    = useState<number>(0);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMatrix(null);
    setDetectMsg("");
    setOutSize(null);
    setRotation(0);
    setImage(URL.createObjectURL(file));
  };

  const handleRemoveImage = () => {
    setImage(null);
    setImgSize(null);
    setPoints([]);
    setMatrix(null);
    setDetectMsg("");
    setOutSize(null);
    setForceA4(false);
    setRotation(0);
    if (imgRef.current) imgRef.current.src = "";
  };

  useEffect(() => {
    if (!image) return;
    const img = new Image();
    img.src   = image;
    img.onload = () => {
      imgRef.current = img;
      const clean = cleanCanvasRef.current!;
      clean.width  = img.width;
      clean.height = img.height;
      clean.getContext("2d")!.drawImage(img, 0, 0);
      setImgSize({ w: img.width, h: img.height });

      const pad = Math.min(img.width, img.height) * 0.05;
      setPoints([
        { x: pad,             y: pad              },
        { x: img.width - pad, y: pad              },
        { x: img.width - pad, y: img.height - pad },
        { x: pad,             y: img.height - pad },
      ]);
    };
  }, [image]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img || points.length === 0 || !visibleCanvasRef.current) return;

    const canvas = visibleCanvasRef.current;
    const ctx    = canvas.getContext("2d")!;
    canvas.width  = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    const ordered = orderPoints(points);
    const radius  = Math.max(10, img.width * 0.012);
    const labels  = ["TL", "TR", "BR", "BL"];

    ctx.strokeStyle = "#00ff88";
    ctx.lineWidth   = Math.max(2, img.width * 0.003);
    ctx.beginPath();
    ctx.moveTo(ordered[0].x, ordered[0].y);
    ordered.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.stroke();

    ordered.forEach((p, i) => {
      const dragging =
        dragIdxRef.current !== -1 &&
        Math.abs(points[dragIdxRef.current].x - p.x) < 0.5 &&
        Math.abs(points[dragIdxRef.current].y - p.y) < 0.5;

      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, 2 * Math.PI);
      ctx.fillStyle   = dragging ? "#facc15" : "#ef4444";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth   = 2;
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle    = "#ffffff";
      ctx.font         = `bold ${Math.max(11, radius * 0.9)}px monospace`;
      ctx.textAlign    = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(labels[i], p.x, p.y);
    });
  }, [points, dragTick]);

  const toCvCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const canvas = visibleCanvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    const img    = imgRef.current!;
    return {
      x: (e.clientX - rect.left) * (img.width  / rect.width),
      y: (e.clientY - rect.top)  * (img.height / rect.height),
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = toCvCoords(e);
    const hitR = Math.max(20, (imgRef.current?.width ?? 500) * 0.03);
    let bestIdx  = -1;
    let bestDist = Infinity;
    points.forEach((p, i) => {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < hitR && d < bestDist) { bestDist = d; bestIdx = i; }
    });
    if (bestIdx === -1) return;
    dragIdxRef.current = bestIdx;
    setDragTick((t) => t + 1);
  }, [points, toCvCoords]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragIdxRef.current === -1) return;
    const idx   = dragIdxRef.current;
    const img   = imgRef.current!;
    const { x, y } = toCvCoords(e);

    const margin = Math.max(5, img.width * 0.005);
    let cx = Math.max(margin, Math.min(img.width  - margin, x));
    let cy = Math.max(margin, Math.min(img.height - margin, y));

    const others = points.filter((_, i) => i !== idx);
    const ocx    = others.reduce((s, p) => s + p.x, 0) / 3;
    const ocy    = others.reduce((s, p) => s + p.y, 0) / 3;

    const allCx = points.reduce((s, p) => s + p.x, 0) / 4;
    const allCy = points.reduce((s, p) => s + p.y, 0) / 4;
    const ownLeft  = points[idx].x <= allCx;
    const ownAbove = points[idx].y <= allCy;

    const minGap = Math.max(10, img.width * 0.01);
    if (ownLeft  && cx >= ocx - minGap) cx = ocx - minGap;
    if (!ownLeft  && cx <= ocx + minGap) cx = ocx + minGap;
    if (ownAbove && cy >= ocy - minGap) cy = ocy - minGap;
    if (!ownAbove && cy <= ocy + minGap) cy = ocy + minGap;

    const newPoints = [...points];
    newPoints[idx]  = { x: cx, y: cy };
    setPoints(newPoints);
    setDragTick((t) => t + 1);
  }, [points, toCvCoords]);

  const handleMouseUp = useCallback(() => {
    dragIdxRef.current = -1;
    setDragTick((t) => t + 1);
  }, []);

  const detectCorners = useCallback(() => {
    const cv = (window as any).cv;
    if (!cv || !cleanCanvasRef.current) return;
    setDetectMsg("Detecting…");

    const tryApprox = (contour: any): Point[] | null => {
      const perimeter = cv.arcLength(contour, true);
      for (const factor of [0.01, 0.02, 0.03, 0.04, 0.05, 0.06]) {
        const approx = new cv.Mat();
        cv.approxPolyDP(contour, approx, factor * perimeter, true);
        if (approx.rows === 4) {
          const pts: Point[] = [];
          for (let i = 0; i < 4; i++) pts.push({ x: approx.data32S[i * 2], y: approx.data32S[i * 2 + 1] });
          approx.delete();
          return pts;
        }
        approx.delete();
      }
      return null;
    };

    const src     = cv.imread(cleanCanvasRef.current);
    const gray    = new cv.Mat();
    const blurred = new cv.Mat();
    const edges   = new cv.Mat();
    const dilated = new cv.Mat();
    
    // Increased kernel size to bridge gaps
    const kernel  = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));

    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(9, 9), 0);

    const otsuMat    = new cv.Mat();
    const otsuThresh = cv.threshold(blurred, otsuMat, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
    
    // Relaxed Canny threshold
    cv.Canny(blurred, edges, otsuThresh * 0.3, otsuThresh);
    otsuMat.delete();

    // Morphological Close to connect broken edges
    cv.morphologyEx(edges, dilated, cv.MORPH_CLOSE, kernel, new cv.Point(-1, -1), 2);

    const contours  = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(dilated, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    if (grayRef.current) cv.imshow(grayRef.current, gray);
    if (blurRef.current) cv.imshow(blurRef.current, blurred);
    if (edgeRef.current) cv.imshow(edgeRef.current, edges);
    if (dilateRef.current) cv.imshow(dilateRef.current, dilated);

    const contourDebugMat = src.clone();
    cv.drawContours(contourDebugMat, contours, -1, new cv.Scalar(0, 255, 0, 255), 2);
    if (contourRef.current) cv.imshow(contourRef.current, contourDebugMat);
    contourDebugMat.delete();

    const imgArea = src.rows * src.cols;
    const sorted: { area: number; idx: number }[] = [];
    for (let i = 0; i < contours.size(); i++) {
      const area = cv.contourArea(contours.get(i));
      if (area > imgArea * 0.01) sorted.push({ area, idx: i });
    }
    sorted.sort((a, b) => b.area - a.area);

    let found: Point[] | null = null;
    for (const { idx } of sorted.slice(0, 10)) {
      const cnt  = contours.get(idx);
      const hull = new cv.Mat();
      cv.convexHull(cnt, hull, false, true);
      const pts = tryApprox(hull);
      hull.delete();
      if (pts) { found = pts; break; }
    }

    if (!found && sorted.length > 0) {
      const allPts: number[] = [];
      sorted.slice(0, Math.min(5, sorted.length)).forEach(({ idx }) => {
        const c = contours.get(idx);
        for (let r = 0; r < c.rows; r++) allPts.push(c.data32S[r * 2], c.data32S[r * 2 + 1]);
      });
      const pointMat = cv.matFromArray(allPts.length / 2, 1, cv.CV_32SC2, allPts);
      const hull     = new cv.Mat();
      cv.convexHull(pointMat, hull, false, true);
      found = tryApprox(hull);
      hull.delete();
      pointMat.delete();
    }

    if (found) {
      setPoints(orderPoints(found));
      setDetectMsg("✓ Corners detected automatically");
      
      const polyDebugMat = src.clone();
      for (let i = 0; i < 4; i++) {
        const p1 = new cv.Point(found[i].x, found[i].y);
        const p2 = new cv.Point(found[(i + 1) % 4].x, found[(i + 1) % 4].y);
        cv.line(polyDebugMat, p1, p2, new cv.Scalar(0, 255, 136, 255), 6);
        cv.circle(polyDebugMat, p1, 20, new cv.Scalar(239, 68, 68, 255), -1);
      }
      if (polyRef.current) cv.imshow(polyRef.current, polyDebugMat);
      polyDebugMat.delete();
    } else {
      setDetectMsg("⚠ Could not detect 4 corners — please adjust manually");
      if (polyRef.current) cv.imshow(polyRef.current, src);
    }

    src.delete(); gray.delete(); blurred.delete();
    edges.delete(); dilated.delete(); kernel.delete();
    contours.delete(); hierarchy.delete();
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Rectify
  // ─────────────────────────────────────────────────────────────────────────
  const rectify = useCallback((manualA4?: boolean | React.MouseEvent, manualRot?: number) => {
    const cv = (window as any).cv;
    if (!cv || !cleanCanvasRef.current || !outputRef.current) return;

    const isA4 = typeof manualA4 === 'boolean' ? manualA4 : forceA4;
    const currentRot = typeof manualRot === 'number' ? manualRot : rotation;

    const ordered = orderPoints(points);
    const src     = cv.imread(cleanCanvasRef.current);
    const dst     = new cv.Mat();
    const srcTri  = cv.matFromArray(4, 1, cv.CV_32FC2, ordered.flatMap((p) => [p.x, p.y]));

    const midTop = { x: (ordered[0].x + ordered[1].x) / 2, y: (ordered[0].y + ordered[1].y) / 2 };
    const midBot = { x: (ordered[3].x + ordered[2].x) / 2, y: (ordered[3].y + ordered[2].y) / 2 };
    const midLeft = { x: (ordered[0].x + ordered[3].x) / 2, y: (ordered[0].y + ordered[3].y) / 2 };
    const midRight = { x: (ordered[1].x + ordered[2].x) / 2, y: (ordered[1].y + ordered[2].y) / 2 };

    let outW = Math.round(Math.hypot(midRight.x - midLeft.x, midRight.y - midLeft.y));
    let outH = Math.round(Math.hypot(midBot.x - midTop.x, midBot.y - midTop.y));

    if (isA4) {
      const A4_RATIO = 1.4142; 
      if (outW > outH) {
        outH = Math.round(outW / A4_RATIO); 
      } else {
        outH = Math.round(outW * A4_RATIO); 
      }
    }

    const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, outW, 0, outW, outH, 0, outH]);

    const M     = cv.getPerspectiveTransform(srcTri, dstTri);
    const dsize = new cv.Size(outW, outH);
    cv.warpPerspective(src, dst, M, dsize, cv.INTER_CUBIC, cv.BORDER_CONSTANT, new cv.Scalar());

    let finalW = outW;
    let finalH = outH;

    if (currentRot === 90) {
      cv.rotate(dst, dst, 0); // ROTATE_90_CLOCKWISE
      finalW = outH; finalH = outW;
    } else if (currentRot === 180) {
      cv.rotate(dst, dst, 1); // ROTATE_180
    } else if (currentRot === 270) {
      cv.rotate(dst, dst, 2); // ROTATE_90_COUNTERCLOCKWISE
      finalW = outH; finalH = outW;
    }

    outputRef.current.width  = finalW;
    outputRef.current.height = finalH;
    cv.imshow(outputRef.current, dst);

    setOutSize({ w: finalW, h: finalH });

    const m = M.data64F;
    setMatrix([
      [m[0], m[1], m[2]],
      [m[3], m[4], m[5]],
      [m[6], m[7], m[8]],
    ]);

    src.delete(); dst.delete(); srcTri.delete(); dstTri.delete(); M.delete();
  }, [points, forceA4, rotation]);

  const handleRotate = () => {
    const newRot = (rotation + 90) % 360;
    setRotation(newRot);
    if (matrix) rectify(forceA4, newRot);
  };

  const resetCorners = useCallback(() => {
    if (!imgSize) return;
    const pad = Math.min(imgSize.w, imgSize.h) * 0.05;
    setPoints([
      { x: pad,             y: pad              },
      { x: imgSize.w - pad, y: pad              },
      { x: imgSize.w - pad, y: imgSize.h - pad  },
      { x: pad,             y: imgSize.h - pad  },
    ]);
    setMatrix(null);
    setOutSize(null);
    setDetectMsg("");
  }, [imgSize]);

  const downloadImage = () => {
    if (!outputRef.current) return;
    const link = document.createElement('a');
    link.download = 'rectified-image.png';
    link.href = outputRef.current.toDataURL('image/png');
    link.click();
  };

  const outputCanvasStyle: React.CSSProperties = outSize
    ? {
        maxWidth: "min(580px, 90vw)",
        width: "100%",
        aspectRatio: `${outSize.w} / ${outSize.h}`,
        height: "auto",
        display: "block",
      }
    : { display: "none" };

  return (
    <div className="min-h-screen flex flex-col items-center p-6 bg-black text-white">
      <canvas ref={cleanCanvasRef} style={{ display: "none" }} />

      <h1 className="text-2xl font-bold mb-1 tracking-wide text-center">
        Image Rectification Framework
      </h1>
      <p className="text-xs text-gray-500 mb-6 tracking-widest uppercase text-center">
        Homography · Linear Algebra · OpenCV.js
      </p>

      {/* Conditional Upload / Discard Button */}
      <div className="flex flex-col items-center justify-center">
        {!image ? (
          <label className="cursor-pointer bg-gray-800 px-5 py-2.5 rounded border border-gray-600 hover:bg-gray-700 transition-colors text-sm font-medium">
            Upload Image
            <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
          </label>
        ) : (
          <button 
            onClick={handleRemoveImage}
            className="bg-red-900/50 hover:bg-red-800 border border-red-700/50 px-5 py-2.5 rounded transition-colors text-sm font-medium text-red-200"
          >
            Discard Image
          </button>
        )}
        <p className="text-xs mt-3 text-gray-500 text-center">
          {image
            ? "✓ Image loaded — drag corners or use Auto Detect"
            : "No file chosen"}
        </p>
      </div>

      {/* Main Controls Panel */}
      {image && (
        <div className="flex flex-col gap-4 mt-6 mb-2 items-center justify-center w-full max-w-2xl bg-gray-900/30 p-5 rounded-xl border border-gray-800/50">
          <div className="flex flex-wrap gap-3 items-center justify-center w-full">
            <button
              onClick={detectCorners}
              className="bg-blue-600 hover:bg-blue-500 px-5 py-2 rounded text-sm font-semibold transition-colors"
            >
              Auto Detect
            </button>
            <button
              onClick={rectify}
              className="bg-emerald-600 hover:bg-emerald-500 px-5 py-2 rounded text-sm font-semibold transition-colors shadow-[0_0_15px_rgba(16,185,129,0.3)]"
            >
              Rectify
            </button>
            <button
              onClick={resetCorners}
              className="bg-gray-700 hover:bg-gray-600 px-5 py-2 rounded text-sm font-semibold transition-colors"
            >
              Reset Corners
            </button>
          </div>

          <label className="flex items-center gap-2 cursor-pointer group mt-1">
            <input
              type="checkbox"
              checked={forceA4}
              onChange={(e) => {
                const isChecked = e.target.checked;
                setForceA4(isChecked);
                if (matrix) rectify(isChecked, rotation);
              }}
              className="w-4 h-4 accent-emerald-500 cursor-pointer"
            />
            <span className="text-xs text-gray-400 group-hover:text-gray-200 transition-colors uppercase tracking-widest font-semibold">
              Force A4 Aspect Ratio
            </span>
          </label>
          
          {detectMsg && (
            <p className="text-xs text-yellow-400 font-mono">{detectMsg}</p>
          )}
        </div>
      )}

      {/* Interactive Canvases */}
      {image && (
        <div className="flex flex-wrap gap-8 mt-6 justify-center w-full max-w-6xl">
          {/* Input Area */}
          <div className="flex flex-col gap-2 flex-1 min-w-[300px] items-center">
            <span className="text-xs font-semibold tracking-widest uppercase text-gray-400 self-start">
              Input — Source
            </span>
            <canvas
              ref={visibleCanvasRef}
              className="border border-gray-700 rounded cursor-crosshair w-full"
              style={{ maxWidth: "580px", height: "auto", display: "block" }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            />
          </div>

          {/* Output Area w/ Floating Icons */}
          <div className="flex flex-col gap-2 flex-1 min-w-[300px] items-center">
            <span className="text-xs font-semibold tracking-widest uppercase text-gray-400 self-start">
              Output — Rectified
            </span>
            
            <div className="relative w-full flex justify-center" style={{ maxWidth: "580px" }}>
              <canvas
                ref={outputRef}
                className="border border-gray-700 rounded w-full bg-gray-900/50 block"
                style={outputCanvasStyle}
              />
              
              {/* Floating Action Overlay (Only shows when output exists) */}
              {outSize && (
                <div className="absolute top-3 right-3 flex flex-col gap-3">
                  <button
                    onClick={handleRotate}
                    title="Rotate 90°"
                    className="p-2.5 bg-black/60 hover:bg-amber-500 text-gray-200 hover:text-white rounded-full backdrop-blur-md transition-all duration-200 hover:scale-110 shadow-[0_0_10px_rgba(0,0,0,0.5)] border border-gray-600/50 hover:border-amber-400"
                  >
                    <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
                       <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                  </button>
                  <button
                    onClick={downloadImage}
                    title="Download Result"
                    className="p-2.5 bg-black/60 hover:bg-purple-500 text-gray-200 hover:text-white rounded-full backdrop-blur-md transition-all duration-200 hover:scale-110 shadow-[0_0_10px_rgba(0,0,0,0.5)] border border-gray-600/50 hover:border-purple-400"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
            
          </div>
        </div>
      )}

      {/* CV Pipeline */}
      {image && (
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
      )}

      {/* Unified Mathematical & Algorithmic Explanation */}
      {matrix && outSize && (
        <div className="mt-12 text-left max-w-4xl w-full mb-16 bg-gray-900/30 p-8 rounded-2xl border border-gray-800 shadow-2xl">
          <h3 className="font-bold mb-6 text-lg tracking-widest uppercase text-white border-b border-gray-700 pb-4">
            The Rectification Algorithm
          </h3>
          
          <div className="space-y-8">
            <section>
              <h4 className="text-emerald-400 font-semibold mb-2">Step 1: Point Extraction & Sorting</h4>
              <p className="text-sm text-gray-400 leading-relaxed">
                Whether detected by the OpenCV pipeline above or dragged manually, the system isolates four points representing the corners of the document in the source image. These points are sorted geometrically (by Y, then by X) to establish strict correspondences: <InlineMath math="P_{TL}, P_{TR}, P_{BR}, P_{BL}" />.
              </p>
            </section>

            <section>
              <h4 className="text-emerald-400 font-semibold mb-2">Step 2: Destination Dimensionality</h4>
              <p className="text-sm text-gray-400 leading-relaxed mb-4">
                To prevent perspective "squashing", the output dimensions are calculated using the midpoints of the source polygon edges. 
                {forceA4 ? " Because the A4 override is active, the width is used to enforce a strict 1:1.414 aspect ratio." : " The true aspect ratio is dynamically estimated based on these distances."}
              </p>
              <div className="bg-black/40 py-4 rounded-lg border border-gray-800/50 flex flex-col items-center gap-2">
                <BlockMath math={`Width = ${outSize.w}px`} />
                <BlockMath math={`Height = ${outSize.h}px`} />
              </div>
            </section>

            <section>
              <h4 className="text-emerald-400 font-semibold mb-2">Step 3: Solving the Homography Matrix</h4>
              <p className="text-sm text-gray-400 leading-relaxed mb-4">
                Using the Direct Linear Transform (DLT), the algorithm computes a <InlineMath math="3 \times 3" /> transformation matrix <InlineMath math="H" />. This matrix maps the physical <InlineMath math="(x,y)" /> pixel coordinates from the warped source image onto the perfect rectangle of the destination canvas.
              </p>
              <div className="text-green-300 py-6 overflow-x-auto bg-black/40 rounded-lg border border-gray-800/50 flex justify-center">
                <BlockMath
                  math={`H = \\begin{bmatrix} 
                    ${fmt(matrix[0][0])} & ${fmt(matrix[0][1])} & ${fmt(matrix[0][2])} \\\\ 
                    ${fmt(matrix[1][0])} & ${fmt(matrix[1][1])} & ${fmt(matrix[1][2])} \\\\ 
                    ${fmt(matrix[2][0])} & ${fmt(matrix[2][1])} & ${fmt(matrix[2][2])} 
                  \\end{bmatrix}`}
                />
              </div>
            </section>

            <section>
              <h4 className="text-emerald-400 font-semibold mb-2">Step 4: Projective Warping</h4>
              <p className="text-sm text-gray-400 leading-relaxed mb-4">
                Every pixel from the source image is multiplied by <InlineMath math="H" /> using homogeneous coordinates to account for perspective scaling (<InlineMath math="w'" />).
              </p>
              <div className="text-blue-300 mb-4 bg-black/40 py-4 rounded-lg border border-gray-800/50 flex justify-center">
                <BlockMath 
                  math={`\\begin{bmatrix} x' \\\\ y' \\\\ w' \\end{bmatrix} = H \\times \\begin{bmatrix} x_{source} \\\\ y_{source} \\\\ 1 \\end{bmatrix}`} 
                />
              </div>
              <p className="text-sm text-gray-400 leading-relaxed mb-4">
                Finally, the coordinates are normalized by dividing by the scale factor, mapping the original colored pixels into their new rectified positions.
              </p>
              <div className="text-blue-300 bg-black/40 py-4 rounded-lg border border-gray-800/50 flex justify-center">
                <BlockMath math={`x_{dest} = \\frac{x'}{w'}, \\quad y_{dest} = \\frac{y'}{w'}`} />
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}