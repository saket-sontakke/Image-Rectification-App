// components/ExplanationPanel.tsx

import 'katex/dist/katex.min.css';
import { BlockMath, InlineMath } from 'react-katex';
import { fmt } from '../utils/geometry';

interface ExplanationPanelProps {
  matrix: number[][];
  outSize: { w: number; h: number };
  aspectRatio: number | "auto";
}

export default function ExplanationPanel({ matrix, outSize, aspectRatio }: ExplanationPanelProps) {
  return (
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
            To prevent perspective "squashing", the output dimensions are calculated carefully. 
            {aspectRatio === "auto" 
              ? " The algorithm automatically estimates the true proportions by taking the maximum width (comparing top/bottom edges) and maximum height (comparing left/right edges) of the distorted polygon." 
              : ` The user has enforced a strict real-world aspect ratio of ${aspectRatio.toFixed(3)}. The algorithm calculates the maximum dimension to preserve image resolution, and mathematically scales the opposing dimension to fit perfectly into the requested ratio.`}
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
  );
}