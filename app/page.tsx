// Otsu's Thresholing + Canny Edge Detection 

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Point, orderPoints } from "../utils/geometry";
import DebugPipeline from "../components/DebugPipeline";
import ExplanationPanel from "../components/ExplanationPanel";
import Tesseract from 'tesseract.js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

type AspectRatioMode = "auto" | number;

// Define the sample images for the sidebar
// MAKE SURE THESE EXTENSIONS MATCH YOUR ACTUAL FILES (.png vs .jpg)
const SAMPLE_CATEGORIES = [
  {
    title: "DocScanner",
    samples: [
      { id: "doc1", src: "/samples/doc1.jpg", label: "Document" },
    ],
  },
  {
    title: "BoardScanner",
    samples: [
      { id: "board1", src: "/samples/board1.jpg", label: "Board" },
    ],
  },
  {
    title: "Miscellaneous",
    samples: [
      { id: "misc1", src: "/samples/misc1.jpg", label: "Chessboard" },
    ],
  },
];

// --- Utility function for Dynamic Filenames ---
const getTimestampString = () => {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
};

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

  // UI States
  const [isLeftSidebarOpen, setIsLeftSidebarOpen]   = useState<boolean>(false);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState<boolean>(false);

  // App States
  const [image,       setImage]       = useState<string | null>(null);
  const [imgSize,     setImgSize]     = useState<{ w: number; h: number } | null>(null);
  const [points,      setPoints]      = useState<Point[]>([]);
  const [dragTick,    setDragTick]    = useState(0);
  const [matrix,      setMatrix]      = useState<number[][] | null>(null);
  const [detectMsg,   setDetectMsg]   = useState<string>("");
  const [outSize,     setOutSize]     = useState<{ w: number; h: number } | null>(null);
  const [rotation,    setRotation]    = useState<number>(0);
  
  // Aspect Ratio States
  const [aspectRatio, setAspectRatio] = useState<AspectRatioMode>("auto");
  const [isCustom,    setIsCustom]    = useState<boolean>(false);
  const [customX,     setCustomX]     = useState<string>("16");
  const [customY,     setCustomY]     = useState<string>("9");

  // OCR & PDF States
  const [ocrText,         setOcrText]         = useState<string>("");
  const [ocrWords,        setOcrWords]        = useState<any[]>([]);
  const [isOcrRunning,    setIsOcrRunning]    = useState<boolean>(false);
  const [isPdfGenerating, setIsPdfGenerating] = useState<boolean>(false);
  const [isCopied,        setIsCopied]        = useState<boolean>(false);

  // Load a sample image from the sidebar
  const loadSample = (src: string) => {
    setMatrix(null);
    setDetectMsg("");
    setOutSize(null);
    setRotation(0);
    setAspectRatio("auto");
    setIsCustom(false);
    setOcrText("");
    setOcrWords([]);
    setImage(src);
    
    if (window.innerWidth < 1024) {
      setIsLeftSidebarOpen(false);
    }
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMatrix(null);
    setDetectMsg("");
    setOutSize(null);
    setRotation(0);
    setOcrText("");
    setOcrWords([]);
    setImage(URL.createObjectURL(file));
  };

  const handleRemoveImage = () => {
    setImage(null);
    setImgSize(null);
    setPoints([]);
    setMatrix(null);
    setDetectMsg("");
    setOutSize(null);
    setAspectRatio("auto");
    setIsCustom(false);
    setRotation(0);
    setOcrText("");
    setOcrWords([]);
    setIsRightSidebarOpen(false); 
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

  // const toCvCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement>): Point => {
  //   const canvas = visibleCanvasRef.current!;
  //   const rect   = canvas.getBoundingClientRect();
  //   const img    = imgRef.current!;
  //   return {
  //     x: (e.clientX - rect.left) * (img.width  / rect.width),
  //     y: (e.clientY - rect.top)  * (img.height / rect.height),
  //   };
  // }, []);
  const toCvCoords = useCallback((e: React.PointerEvent<HTMLCanvasElement>): Point => {
  const canvas = visibleCanvasRef.current!;
  const rect   = canvas.getBoundingClientRect();
  const img    = imgRef.current!;

  return {
    x: (e.clientX - rect.left) * (img.width  / rect.width),
    y: (e.clientY - rect.top)  * (img.height / rect.height),
  };
}, []);

  // const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
  //   const { x, y } = toCvCoords(e);
  //   const hitR = Math.max(20, (imgRef.current?.width ?? 500) * 0.03);
  //   let bestIdx  = -1;
  //   let bestDist = Infinity;
  //   points.forEach((p, i) => {
  //     const d = Math.hypot(p.x - x, p.y - y);
  //     if (d < hitR && d < bestDist) { bestDist = d; bestIdx = i; }
  //   });
  //   if (bestIdx === -1) return;
  //   dragIdxRef.current = bestIdx;
  //   setDragTick((t) => t + 1);
  // }, [points, toCvCoords]);

  // const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
  //   if (dragIdxRef.current === -1) return;
  //   const idx   = dragIdxRef.current;
  //   const img   = imgRef.current!;
  //   const { x, y } = toCvCoords(e);

  //   const margin = Math.max(5, img.width * 0.005);
  //   let cx = Math.max(margin, Math.min(img.width  - margin, x));
  //   let cy = Math.max(margin, Math.min(img.height - margin, y));

  //   const others = points.filter((_, i) => i !== idx);
  //   const ocx    = others.reduce((s, p) => s + p.x, 0) / 3;
  //   const ocy    = others.reduce((s, p) => s + p.y, 0) / 3;

  //   const allCx = points.reduce((s, p) => s + p.x, 0) / 4;
  //   const allCy = points.reduce((s, p) => s + p.y, 0) / 4;
  //   const ownLeft  = points[idx].x <= allCx;
  //   const ownAbove = points[idx].y <= allCy;

  //   const minGap = Math.max(10, img.width * 0.01);
  //   if (ownLeft  && cx >= ocx - minGap) cx = ocx - minGap;
  //   if (!ownLeft  && cx <= ocx + minGap) cx = ocx + minGap;
  //   if (ownAbove && cy >= ocy - minGap) cy = ocy - minGap;
  //   if (!ownAbove && cy <= ocy + minGap) cy = ocy + minGap;

  //   const newPoints = [...points];
  //   newPoints[idx]  = { x: cx, y: cy };
  //   setPoints(newPoints);
  //   setDragTick((t) => t + 1);
  // }, [points, toCvCoords]);

  // const handleMouseUp = useCallback(() => {
  //   dragIdxRef.current = -1;
  //   setDragTick((t) => t + 1);
  // }, []);
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
  // This is the magic line: it locks the touch focus to the canvas 
  // so the drag doesn't drop if your finger moves fast!
  e.currentTarget.setPointerCapture(e.pointerId); 
  
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

const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
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

const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
  if (dragIdxRef.current !== -1) {
    e.currentTarget.releasePointerCapture(e.pointerId);
  }
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
    
    const kernel  = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));

    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(9, 9), 0);

    const otsuMat    = new cv.Mat();
    const otsuThresh = cv.threshold(blurred, otsuMat, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
    
    cv.Canny(blurred, edges, otsuThresh * 0.3, otsuThresh);
    otsuMat.delete();

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

  const rectify = useCallback((manualRatio?: AspectRatioMode | React.MouseEvent, manualRot?: number) => {
    const cv = (window as any).cv;
    if (!cv || !cleanCanvasRef.current || !outputRef.current) return;

    setOcrText("");
    setOcrWords([]);

    const activeRatio = (typeof manualRatio === 'number' || manualRatio === 'auto') ? manualRatio : aspectRatio;
    const currentRot = typeof manualRot === 'number' ? manualRot : rotation;

    const ordered = orderPoints(points);
    const src     = cv.imread(cleanCanvasRef.current);
    const dst     = new cv.Mat();
    const srcTri  = cv.matFromArray(4, 1, cv.CV_32FC2, ordered.flatMap((p) => [p.x, p.y]));

    const widthBottom = Math.hypot(ordered[2].x - ordered[3].x, ordered[2].y - ordered[3].y);
    const widthTop    = Math.hypot(ordered[1].x - ordered[0].x, ordered[1].y - ordered[0].y);
    const estW        = Math.max(widthBottom, widthTop);

    const heightRight = Math.hypot(ordered[1].x - ordered[2].x, ordered[1].y - ordered[2].y);
    const heightLeft  = Math.hypot(ordered[0].x - ordered[3].x, ordered[0].y - ordered[3].y);
    const estH        = Math.max(heightRight, heightLeft);

    let outW = Math.round(estW);
    let outH = Math.round(estH);

    if (activeRatio !== "auto" && typeof activeRatio === "number") {
      if (outW > outH) {
        outH = Math.round(outW / activeRatio); 
      } else {
        outW = Math.round(outH * activeRatio); 
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
    
    // Automatically open tools panel when rectified successfully
    if (window.innerWidth >= 1024) {
      setIsRightSidebarOpen(true);
    }

    const m = M.data64F;
    setMatrix([
      [m[0], m[1], m[2]],
      [m[3], m[4], m[5]],
      [m[6], m[7], m[8]],
    ]);

    src.delete(); dst.delete(); srcTri.delete(); dstTri.delete(); M.delete();
  }, [points, aspectRatio, rotation]);

  const handleRotate = () => {
    const newRot = (rotation + 90) % 360;
    setRotation(newRot);
    if (matrix) rectify(aspectRatio, newRot);
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
    setOcrText("");
    setOcrWords([]);
  }, [imgSize]);

  // --- OCR & PDF FUNCTIONS ---

  const handleExtractText = async () => {
    if (!outputRef.current) return;
    setIsOcrRunning(true);
    setOcrText("");
    setOcrWords([]);
    
    try {
      const dataUrl = outputRef.current.toDataURL('image/png');
      const result = await Tesseract.recognize(dataUrl, 'eng');
      
      setOcrText(result.data.text || "No text detected.");
      setOcrWords((result.data as any).words || []);
    } catch (error) {
      console.error("OCR Error:", error);
      setOcrText("Error occurred during text extraction.");
    } finally {
      setIsOcrRunning(false);
    }
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(ocrText);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleDownloadSearchablePDF = async () => {
    if (!outputRef.current) return;
    setIsPdfGenerating(true);
    
    try {
      const pdfDoc = await PDFDocument.create();
      const { width, height } = outputRef.current;
      const page = pdfDoc.addPage([width, height]);
      
      if (ocrWords && ocrWords.length > 0) {
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        for (const word of ocrWords) {
          page.drawText(word.text, {
            x: word.bbox.x0,
            y: height - word.bbox.y1, 
            size: (word.bbox.y1 - word.bbox.y0) * 0.8,
            font: font,
            color: rgb(0, 0, 0),
          });
        }
      }

      const dataUrl = outputRef.current.toDataURL('image/jpeg', 1.0);
      const imgBytes = await fetch(dataUrl).then(res => res.arrayBuffer());
      const image = await pdfDoc.embedJpg(imgBytes);
      page.drawImage(image, { x: 0, y: 0, width, height });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      // DYNAMIC TIMESTAMP FILENAME
      link.download = `rectified_pdf_${getTimestampString()}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("PDF Gen Failed:", error);
    } finally {
      setIsPdfGenerating(false);
    }
  };

  const downloadImage = () => {
    if (!outputRef.current) return;
    const link = document.createElement('a');
    // DYNAMIC TIMESTAMP FILENAME
    link.download = `rectified_image_${getTimestampString()}.png`;
    link.href = outputRef.current.toDataURL('image/png');
    link.click();
  };

  // ------------------------------

  const outputCanvasStyle: React.CSSProperties = outSize
    ? {
        maxWidth: "100%",
        width: "100%",
        aspectRatio: `${outSize.w} / ${outSize.h}`,
        height: "auto",
        display: "block",
      }
    : { display: "none" };

  const getSelectValue = () => {
    if (isCustom) return "custom";
    if (aspectRatio === "auto") return "auto";
    const val = aspectRatio as number;
    if (Math.abs(val - 1) < 0.001) return "1";
    if (Math.abs(val - 1.414) < 0.001) return "1.414";
    if (Math.abs(val - 1.333) < 0.001) return "1.333";
    if (Math.abs(val - 1.778) < 0.001) return "1.778";
    if (Math.abs(val - 1.6) < 0.001) return "1.6";
    return "custom";
  };

  const handleCustomChange = (xVal: string, yVal: string) => {
    setCustomX(xVal);
    setCustomY(yVal);
    const x = parseFloat(xVal);
    const y = parseFloat(yVal);
    if (!isNaN(x) && !isNaN(y) && x > 0 && y > 0) {
      const ratio = x / y;
      setAspectRatio(ratio);
      if (matrix) rectify(ratio, rotation);
    }
  };

  return (
    <div className="flex min-h-screen bg-black text-white overflow-x-hidden">
      <canvas ref={cleanCanvasRef} style={{ display: "none" }} />

      {/* --- LEFT SIDEBAR: Applications --- */}
      {isLeftSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-50 lg:hidden"
          onClick={() => setIsLeftSidebarOpen(false)}
        />
      )}
      
      <aside 
        className={`fixed inset-y-0 left-0 w-72 bg-gray-900 border-r border-gray-800 z-[60] transform transition-transform duration-300 ease-in-out overflow-y-auto [color-scheme:dark] flex flex-col ${
          isLeftSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="sticky top-0 bg-gray-900/90 backdrop-blur p-5 border-b border-gray-800 flex justify-between items-center z-10">
          <h2 className="text-sm font-bold tracking-widest uppercase text-emerald-400">Applications</h2>
          <button 
            onClick={() => setIsLeftSidebarOpen(false)}
            className="text-gray-400 hover:text-white p-1 rounded transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 flex flex-col items-center space-y-8 text-center flex-1">
          <p className="text-xs text-gray-400 leading-relaxed">
            Click any sample image below to instantly load it into the workspace and test the rectification algorithm.
          </p>
          
          <div className="w-full flex flex-col gap-8">
            {SAMPLE_CATEGORIES.map((category) => (
              <div key={category.title} className="flex flex-col items-center space-y-4 w-full">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-800 pb-2 w-full text-center">
                  {category.title}
                </h3>
                <div className="flex flex-wrap justify-center gap-4 w-full">
                  {category.samples.map((sample) => (
                    <button
                      key={sample.id}
                      onClick={() => loadSample(sample.src)}
                      className="group relative flex flex-col items-center gap-2 focus:outline-none w-24"
                    >
                      <div className="w-full aspect-square bg-gray-800 border border-gray-700 rounded-lg overflow-hidden group-hover:border-emerald-500 transition-colors shadow-sm relative flex items-center justify-center">
                        <img 
                          src={sample.src} 
                          alt={sample.label}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.parentElement!.classList.add('bg-gray-800', 'flex', 'items-center', 'justify-center');
                            e.currentTarget.parentElement!.innerHTML = `<span class="text-[10px] text-gray-500 text-center px-2">Missing<br/>${sample.src}</span>`;
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-400 group-hover:text-emerald-400 font-medium truncate w-full text-center">
                        {sample.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* --- RIGHT SIDEBAR: Output Tools --- */}
      {isRightSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-50 lg:hidden"
          onClick={() => setIsRightSidebarOpen(false)}
        />
      )}
      
      <aside 
        className={`fixed inset-y-0 right-0 w-80 bg-gray-900 border-l border-gray-800 z-[60] transform transition-transform duration-300 ease-in-out overflow-y-auto [color-scheme:dark] flex flex-col ${
          isRightSidebarOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="sticky top-0 bg-gray-900/90 backdrop-blur p-5 border-b border-gray-800 flex justify-between items-center z-10 shrink-0">
          <h2 className="text-sm font-bold tracking-widest uppercase text-emerald-400">Output Tools</h2>
          <button 
            onClick={() => setIsRightSidebarOpen(false)}
            className="text-gray-400 hover:text-white p-1 rounded transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 flex-1 flex flex-col gap-8">
          {!outSize ? (
            <div className="flex flex-col items-center text-center opacity-50 mt-10">
              <p className="text-sm text-gray-400">Rectify an image first to unlock processing tools.</p>
            </div>
          ) : (
            <>
              {/* Rotation Section */}
              <div className="flex flex-col gap-3">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 border-b border-gray-800 pb-1">Image Orientation</span>
                <button
                  onClick={handleRotate}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm text-gray-200 transition-colors"
                >
                  <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-4 h-4">
                     <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  Rotate 90°
                </button>
              </div>

              {/* Export Section */}
              <div className="flex flex-col gap-3">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 border-b border-gray-800 pb-1">Export Options</span>
                
                <button
                  onClick={downloadImage}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/50 text-purple-200 rounded-lg text-sm transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Save as PNG
                </button>

                <button
                  onClick={handleDownloadSearchablePDF}
                  disabled={isPdfGenerating}
                  className={`w-full flex items-center justify-center gap-2 py-2 border rounded-lg text-sm transition-colors ${
                    isPdfGenerating 
                    ? "bg-red-900/50 border-red-800 text-red-400 cursor-not-allowed" 
                    : "bg-red-600/20 hover:bg-red-600/40 border-red-500/50 text-red-200"
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  {isPdfGenerating ? "Generating PDF..." : "Save as PDF"}
                </button>
              </div>

              {/* OCR Section */}
              <div className="flex flex-col gap-3 flex-1">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 border-b border-gray-800 pb-1">Text Extraction</span>
                
                <button
                  onClick={handleExtractText}
                  disabled={isOcrRunning}
                  className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    isOcrRunning 
                    ? "bg-blue-900 border border-blue-800 text-blue-400 cursor-not-allowed" 
                    : "bg-blue-600 hover:bg-blue-500 text-white"
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
                  </svg>
                  {isOcrRunning ? "Running OCR..." : "Extract Text (OCR)"}
                </button>

                {ocrText && (
                  <div className="bg-gray-950 border border-gray-700 rounded-lg p-3 flex flex-col flex-1 overflow-hidden min-h-[200px]">
                    <div className="flex justify-between items-center mb-2 border-b border-gray-800 pb-2">
                      <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-widest">Extracted Text</span>
                      <button 
                        onClick={handleCopyText}
                        className="text-[10px] flex items-center gap-1 text-gray-400 hover:text-white transition-colors"
                      >
                        {isCopied ? (
                          <span className="text-emerald-400">Copied!</span>
                        ) : (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                            </svg>
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                    <div className="overflow-y-auto flex-1 pr-1 custom-scrollbar">
                      <p className="text-xs text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
                        {ocrText}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </aside>

      {/* --- MAIN CONTENT --- */}
      {/* Margins adjust dynamically based on which sidebars are open */}
      <main className={`flex-1 relative flex flex-col items-center transition-all duration-300 ease-in-out w-full 
        ${isLeftSidebarOpen ? "lg:ml-72" : "ml-0"} 
        ${isRightSidebarOpen ? "lg:mr-80" : "mr-0"}
      `}>
        
        {/* --- STICKY NAVBAR --- */}
        {/* Adjusted padding and flex layout for robust mobile scaling */}
        <header className="sticky top-0 z-40 w-full bg-gray-950/95 backdrop-blur-xl border-b border-gray-800 shadow-2xl p-3 sm:p-4 flex flex-col gap-3">
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 w-full">
            
            {/* Top Left: App Menu & Title */}
            <div className="flex items-center gap-3 w-full sm:w-auto">
              {!isLeftSidebarOpen && (
                <button 
                  onClick={() => setIsLeftSidebarOpen(true)}
                  className="flex items-center justify-center p-2 sm:px-3 bg-gray-900 hover:bg-gray-800 rounded-lg border border-gray-700 transition-colors shadow-sm focus:outline-none group shrink-0"
                  title="Toggle Applications Sidebar"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
                  </svg>
                  <span className="text-xs font-bold tracking-widest uppercase text-emerald-400 hidden lg:inline ml-2">Applications</span>
                </button>
              )}

              <div className="flex flex-col min-w-0">
                <h1 className="text-base sm:text-lg font-bold tracking-wide truncate">Image Rectification</h1>
                <p className="text-[9px] sm:text-[10px] text-gray-500 tracking-widest uppercase truncate hidden sm:block">Homography · Linear Algebra · OpenCV</p>
              </div>
            </div>

            {/* Top Right: Upload & Tools Menu */}
            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0 hide-scrollbar">
              {!image ? (
                <>
                  <label className="cursor-pointer flex items-center justify-center gap-2 bg-gray-800 px-3 py-2 rounded-lg border border-gray-600 hover:bg-gray-700 transition-colors text-xs sm:text-sm font-medium whitespace-nowrap flex-1 sm:flex-none">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    <span>Upload Image</span>
                    <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
                  </label>

                  <label className="cursor-pointer flex items-center justify-center gap-2 bg-blue-900/40 hover:bg-blue-800/60 border border-blue-700/50 transition-colors px-3 py-2 rounded-lg text-xs sm:text-sm font-medium text-blue-100 whitespace-nowrap flex-1 sm:flex-none">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                    </svg>
                    <span>Camera</span>
                    <input type="file" accept="image/*" capture="environment" onChange={handleUpload} className="hidden" />
                  </label>
                </>
              ) : (
                <>
                  <button 
                    onClick={handleRemoveImage}
                    className="flex items-center justify-center gap-2 bg-red-900/50 hover:bg-red-800 border border-red-700/50 px-3 py-2 rounded-lg transition-colors text-xs sm:text-sm font-medium text-red-200 flex-1 sm:flex-none"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>Discard</span>
                  </button>

                  {!isRightSidebarOpen && (
                    <button 
                      onClick={() => setIsRightSidebarOpen(true)}
                      className="flex items-center justify-center gap-2 p-2 sm:px-3 bg-blue-900/40 hover:bg-blue-800/60 rounded-lg border border-blue-700/50 transition-colors shadow-sm focus:outline-none group shrink-0"
                      title="Toggle Output Tools"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-blue-200">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                      </svg>
                      <span className="text-xs font-bold tracking-widest uppercase text-blue-200 hidden lg:inline ml-1">Tools</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Primary Action Row: Auto Detect, Rectify, and Aspect Ratio */}
          {image && (
            <div className="flex flex-col lg:flex-row items-center justify-between gap-3 bg-gray-900/50 p-2 rounded-lg border border-gray-800/60 w-full">
              <div className="flex w-full lg:w-auto items-center gap-2">
                <button
                  onClick={detectCorners}
                  className="flex-1 lg:flex-none bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-md text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap"
                >
                  Auto Detect
                </button>
                <button
                  onClick={rectify}
                  className="flex-1 lg:flex-none bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-md text-xs sm:text-sm font-semibold transition-colors shadow-[0_0_15px_rgba(16,185,129,0.2)] whitespace-nowrap"
                >
                  Rectify Image
                </button>
              </div>

              {/* Aspect Ratio Dropdown */}
              <div className="flex flex-wrap items-center justify-center lg:justify-end gap-2 w-full lg:w-auto ml-auto">
                {detectMsg && (
                  <span className="text-[10px] text-yellow-400 font-mono hidden lg:inline-block mr-2">{detectMsg}</span>
                )}
                
                <span className="text-[10px] text-gray-400 font-semibold tracking-widest uppercase hidden sm:inline">Ratio:</span>
                <select
                  value={getSelectValue()}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "auto") {
                      setIsCustom(false);
                      setAspectRatio("auto");
                      if (matrix) rectify("auto", rotation);
                    } else if (val === "custom") {
                      setIsCustom(true);
                      const x = parseFloat(customX) || 16;
                      const y = parseFloat(customY) || 9;
                      const ratio = x / y;
                      setAspectRatio(ratio);
                      if (matrix) rectify(ratio, rotation);
                    } else {
                      setIsCustom(false);
                      const num = parseFloat(val);
                      setAspectRatio(num);
                      if (matrix) rectify(num, rotation);
                    }
                  }}
                  className="flex-1 sm:flex-none bg-black/50 text-white text-xs sm:text-sm px-2 py-2 rounded-md outline-none border border-gray-700 cursor-pointer focus:border-emerald-500 transition-colors"
                >
                  <option value="auto">Auto-Estimate Aspect Ratio</option>
                  <option value="1">Square (1:1)</option>
                  <option value="1.414">A4 Document (1:1.414)</option>
                  <option value="1.333">Standard Photo (4:3)</option>
                  <option value="1.778">Laptop (16:9)</option>
                  <option value="custom">Custom Ratio</option>
                </select>
                
                {getSelectValue() === "custom" && (
                  <div className="flex items-center gap-1 animate-fadeIn shrink-0">
                    <input
                      type="number" min="1" value={customX} onChange={(e) => handleCustomChange(e.target.value, customY)}
                      className="bg-black/50 w-12 sm:w-14 text-xs sm:text-sm px-1 py-2 rounded-md outline-none border border-gray-700 focus:border-emerald-500 transition-colors text-center [color-scheme:dark]"
                      placeholder="X"
                    />
                    <span className="text-gray-400 font-bold">:</span>
                    <input
                      type="number" min="1" value={customY} onChange={(e) => handleCustomChange(customX, e.target.value)}
                      className="bg-black/50 w-12 sm:w-14 text-xs sm:text-sm px-1 py-2 rounded-md outline-none border border-gray-700 focus:border-emerald-500 transition-colors text-center [color-scheme:dark]"
                      placeholder="Y"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </header>

        {/* --- PAGE CONTENT --- */}
        <div className="w-full max-w-6xl flex flex-col items-center p-4 sm:p-6 space-y-12">
          
          {/* Helper Text if empty */}
          {!image && (
            <div className="flex flex-col items-center justify-center mt-20 text-center opacity-60 px-4">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="w-24 h-24 text-gray-600 mb-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
              <h2 className="text-xl font-medium text-gray-300">No Image Loaded</h2>
              <p className="text-sm text-gray-500 mt-2 max-w-md">Upload an image, take a photo, or open the Applications sidebar to explore samples.</p>
            </div>
          )}

          {/* Interactive Canvases */}
          {image && (
            <div className="flex flex-col xl:flex-row flex-wrap gap-8 justify-center w-full">
              {/* Input Area */}
              <div className="flex flex-col gap-2 flex-1 min-w-[300px] items-center">
                <span className="text-xs font-semibold tracking-widest uppercase text-gray-400 self-start w-full max-w-[600px]">
                  Input [Source]
                </span>
                
                <div className="relative w-full flex justify-center max-w-[600px]">
                  {/* <canvas
                    ref={visibleCanvasRef}
                    className="border border-gray-700 rounded cursor-crosshair w-full block bg-gray-900/50 shadow-lg"
                    style={{ height: "auto" }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                  /> */}
                  <canvas
                    ref={visibleCanvasRef}
                    className="border border-gray-700 rounded cursor-crosshair w-full block bg-gray-900/50 shadow-lg"
                    style={{ height: "auto", touchAction: "none" }} /* touchAction: "none" is still required! */
                    
                    /* Unified Pointer Events (Handles Mouse, Touch, and Stylus automatically) */
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                  />
                  
                  {/* Floating Action Overlay for Input Area */}
                  <div className="absolute top-3 right-3 flex flex-col gap-3">
                    <button
                      onClick={resetCorners}
                      title="Reset Corners"
                      className="p-2 sm:p-2.5 bg-black/60 hover:bg-gray-600 text-gray-200 hover:text-white rounded-full backdrop-blur-md transition-all duration-200 hover:scale-110 shadow-md border border-gray-600/50 hover:border-gray-400"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 sm:w-5 sm:h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Output Area */}
              <div className="flex flex-col gap-2 flex-1 min-w-[300px] items-center">
                <span className="text-xs font-semibold tracking-widest uppercase text-gray-400 self-start w-full max-w-[600px]">
                  Output [Rectified]
                </span>
                
                <div className="relative w-full flex justify-center max-w-[600px]">
                  <canvas
                    ref={outputRef}
                    className="border border-gray-700 rounded w-full bg-gray-900/50 block shadow-lg"
                    style={outputCanvasStyle}
                  />
                </div>
              </div>
            </div>
          )}

          {/* CV Pipeline */}
          {image && (
            <DebugPipeline 
              grayRef={grayRef} 
              blurRef={blurRef} 
              edgeRef={edgeRef} 
              dilateRef={dilateRef} 
              contourRef={contourRef} 
              polyRef={polyRef} 
            />
          )}

          {/* Unified Mathematical Explanation */}
          {matrix && outSize && (
            <ExplanationPanel matrix={matrix} outSize={outSize} aspectRatio={aspectRatio} />
          )}

        </div>
      </main>
      
      {/* Global CSS injected specifically to hide file input default margins in some mobile browsers */}
      <style dangerouslySetInnerHTML={{ __html: `
        input[type="file"] {
          display: none;
        }
        /* Scrollbar styles for the app menus */
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent; 
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #374151; 
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #4B5563; 
        }
      `}} />
    </div>
  );
}