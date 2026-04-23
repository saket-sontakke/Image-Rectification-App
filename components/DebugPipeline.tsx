// components/DebugPipeline.tsx

"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";

interface DebugPipelineProps {
  grayRef: React.RefObject<HTMLCanvasElement | null>;
  blurRef: React.RefObject<HTMLCanvasElement | null>;
  edgeRef: React.RefObject<HTMLCanvasElement | null>;
  dilateRef: React.RefObject<HTMLCanvasElement | null>;
  contourRef: React.RefObject<HTMLCanvasElement | null>;
  polyRef: React.RefObject<HTMLCanvasElement | null>;
}

export default function DebugPipeline({ grayRef, blurRef, edgeRef, dilateRef, contourRef, polyRef }: DebugPipelineProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [modalImageSrc, setModalImageSrc] = useState<string | null>(null);

  const steps = [
    { ref: grayRef, title: "1. Grayscale" },
    { ref: blurRef, title: "2. Gaussian Blur (9x9)" },
    { ref: edgeRef, title: "3. Canny Edges" },
    { ref: dilateRef, title: "4. Morphological Close" },
    { ref: contourRef, title: "5. Extracted Contours" },
    { ref: polyRef, title: "6. Polygon Approx. (Corners)" },
  ];

  // Update modal image when index changes
  useEffect(() => {
    if (activeIndex !== null) {
      const canvas = steps[activeIndex].ref.current;
      if (canvas) {
        setModalImageSrc(canvas.toDataURL("image/png"));
      }
    }
  }, [activeIndex, steps]);

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeIndex !== null) {
      setActiveIndex((activeIndex + 1) % steps.length);
    }
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeIndex !== null) {
      setActiveIndex((activeIndex - 1 + steps.length) % steps.length);
    }
  };

  const closeModal = () => {
    setActiveIndex(null);
    setModalImageSrc(null);
  };

  return (
    <>
      <div className="mt-12 p-6 border border-gray-800 bg-gray-900/50 rounded-xl w-full max-w-5xl">
        <h3 className="text-sm font-bold tracking-widest uppercase text-gray-400 mb-6 border-b border-gray-800 pb-2">
          OpenCV Edge Detection & Corner Approximation
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          {steps.map((step, index) => (
            <div key={index} className="flex flex-col gap-2 group cursor-pointer" onClick={() => setActiveIndex(index)}>
              <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest group-hover:text-emerald-400 transition-colors">
                {step.title}
              </span>
              <div className="relative overflow-hidden rounded border border-gray-800 group-hover:border-emerald-500 transition-colors">
                <canvas 
                  ref={step.ref as React.RefObject<HTMLCanvasElement>} 
                  className="w-full h-auto bg-black opacity-80 group-hover:opacity-100 transition-opacity" 
                />
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8 text-white">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                  </svg>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Lightbox Modal (Using React Portal to ensure it covers the entire screen) */}
      {activeIndex !== null && typeof document !== "undefined" && createPortal(
        <div 
          className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center p-4 sm:p-8 backdrop-blur-sm"
          onClick={closeModal}
        >
          {/* Top Bar */}
          <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent">
            <span className="text-emerald-400 font-mono tracking-widest uppercase text-sm sm:text-base font-bold drop-shadow-md">
              {steps[activeIndex].title}
            </span>
            <button onClick={closeModal} className="text-gray-400 hover:text-white p-2 bg-gray-900/80 rounded-full border border-gray-700 transition-all hover:scale-110">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Navigation & Image */}
          <div className="relative w-full max-w-7xl flex items-center justify-center flex-1 h-full min-h-0">
            {/* Prev Button */}
            <button 
              onClick={handlePrev} 
              className="absolute left-2 sm:left-8 z-10 p-3 sm:p-4 bg-gray-900/80 border border-gray-700 text-white rounded-full hover:bg-emerald-600 transition-all hover:scale-110 shadow-xl"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>

            {/* Expanded Image */}
            {modalImageSrc && (
              <img 
                src={modalImageSrc} 
                alt={steps[activeIndex].title} 
                className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl border border-gray-800 select-none"
                onClick={(e) => e.stopPropagation()} // Prevent click from closing modal
              />
            )}

            {/* Next Button */}
            <button 
              onClick={handleNext} 
              className="absolute right-2 sm:right-8 z-10 p-3 sm:p-4 bg-gray-900/80 border border-gray-700 text-white rounded-full hover:bg-emerald-600 transition-all hover:scale-110 shadow-xl"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>
          
          {/* Progress Indicators */}
          <div className="absolute bottom-8 flex gap-2" onClick={(e) => e.stopPropagation()}>
            {steps.map((_, idx) => (
              <button 
                key={idx} 
                onClick={() => setActiveIndex(idx)}
                className={`w-3 h-3 rounded-full transition-all duration-300 ${idx === activeIndex ? 'bg-emerald-500 w-8' : 'bg-gray-600 hover:bg-gray-400'}`}
              />
            ))}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}