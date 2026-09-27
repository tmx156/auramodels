import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Eraser, Check, X, RotateCcw, Loader } from 'lucide-react';

/**
 * SignaturePad - Canvas-based signature collection
 * Used for collecting client signatures on invoices
 */
const SignaturePad = ({
  onSave,
  onCancel,
  saving = false,
  width = 500,
  height = 200,
  penColor = '#1a1a2e',
  backgroundColor = '#ffffff'
}) => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [context, setContext] = useState(null);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Set up high DPI canvas for sharp signatures
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Set drawing style
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = penColor;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    setContext(ctx);
  }, [width, height, penColor, backgroundColor]);

  // Get position from event
  const getPosition = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    if (e.touches) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    }

    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }, []);

  // Start drawing
  const startDrawing = useCallback((e) => {
    if (!context) return;
    e.preventDefault();

    const pos = getPosition(e);
    context.beginPath();
    context.moveTo(pos.x, pos.y);
    setIsDrawing(true);
    setHasSignature(true);
  }, [context, getPosition]);

  // Draw
  const draw = useCallback((e) => {
    if (!isDrawing || !context) return;
    e.preventDefault();

    const pos = getPosition(e);
    context.lineTo(pos.x, pos.y);
    context.stroke();
  }, [isDrawing, context, getPosition]);

  // Stop drawing
  const stopDrawing = useCallback(() => {
    if (!context) return;
    context.closePath();
    setIsDrawing(false);
  }, [context]);

  // Clear canvas
  const clearCanvas = useCallback(() => {
    if (!context) return;
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, width, height);
    setHasSignature(false);
  }, [context, width, height, backgroundColor]);

  // Get signature as data URL
  const getSignatureData = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.toDataURL('image/png');
  }, []);

  // Handle save
  const handleSave = useCallback(() => {
    if (!hasSignature) {
      alert('Please sign in the box above');
      return;
    }

    const signatureData = getSignatureData();
    if (signatureData) {
      onSave?.(signatureData);
    }
  }, [hasSignature, getSignatureData, onSave]);

  // Add event listeners
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Mouse events
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);

    // Touch events
    canvas.addEventListener('touchstart', startDrawing, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', stopDrawing);

    return () => {
      canvas.removeEventListener('mousedown', startDrawing);
      canvas.removeEventListener('mousemove', draw);
      canvas.removeEventListener('mouseup', stopDrawing);
      canvas.removeEventListener('mouseout', stopDrawing);
      canvas.removeEventListener('touchstart', startDrawing);
      canvas.removeEventListener('touchmove', draw);
      canvas.removeEventListener('touchend', stopDrawing);
    };
  }, [startDrawing, draw, stopDrawing]);

  return (
    <div className="space-y-4">
      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-sm text-blue-800">
          Please sign in the box below using your mouse or finger (on touch devices).
          Your signature confirms acceptance of the invoice terms.
        </p>
      </div>

      {/* Canvas Container */}
      <div className="relative">
        <div className="border-2 border-gray-300 rounded-lg overflow-hidden bg-white">
          <canvas
            ref={canvasRef}
            className="cursor-crosshair touch-none"
            style={{ display: 'block' }}
          />

          {/* Signature line */}
          <div
            className="absolute bottom-8 left-8 right-8 border-b border-gray-300"
            style={{ pointerEvents: 'none' }}
          />
          <div
            className="absolute bottom-2 left-8 text-xs text-gray-400"
            style={{ pointerEvents: 'none' }}
          >
            Sign above this line
          </div>
        </div>

        {/* Placeholder text when empty */}
        {!hasSignature && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ opacity: 0.3 }}
          >
            <p className="text-gray-400 text-lg italic">Sign here</p>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between">
        <button
          onClick={clearCanvas}
          className="flex items-center space-x-2 px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Clear</span>
        </button>

        <div className="flex items-center space-x-3">
          <button
            onClick={onCancel}
            className="flex items-center space-x-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <X className="w-4 h-4" />
            <span>Cancel</span>
          </button>
          <button
            onClick={handleSave}
            disabled={!hasSignature || saving}
            className="flex items-center space-x-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            <span>{saving ? 'Saving...' : 'Accept & Sign'}</span>
          </button>
        </div>
      </div>

      {/* Legal text */}
      <p className="text-xs text-gray-500 text-center">
        By signing above, I confirm that I have read and agree to the terms of this invoice.
        I authorise the charges as listed.
      </p>
    </div>
  );
};

export default SignaturePad;
