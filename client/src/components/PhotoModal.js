import React, { useCallback, useEffect, useState, useRef } from 'react';
import { FiX, FiPlay, FiPause, FiDownload } from 'react-icons/fi';

// Detect media type from URL
const getMediaType = (url) => {
  if (!url) return 'image';
  const lower = url.toLowerCase();
  if (lower.includes('.mp4') || lower.includes('.webm') || lower.includes('.mov') || lower.includes('video/')) {
    return 'video';
  }
  if (lower.includes('.gif')) {
    return 'gif';
  }
  if (lower.includes('.heic') || lower.includes('.heif')) {
    return 'heic';
  }
  if (lower.includes('.pdf')) {
    return 'pdf';
  }
  return 'image';
};

const PhotoModal = ({ isOpen, onClose, imageUrl, leadName }) => {
  const [mediaError, setMediaError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const videoRef = useRef(null);
  const mediaType = getMediaType(imageUrl);

  const handleBackdropClick = useCallback((e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  // Toggle video play/pause
  const togglePlayPause = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying]);

  // Download the image/video
  const handleDownload = useCallback(async () => {
    if (!imageUrl) return;

    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // Extract filename from URL or use lead name
      const urlParts = imageUrl.split('/');
      const originalFilename = urlParts[urlParts.length - 1].split('?')[0];
      const extension = originalFilename.split('.').pop() || (mediaType === 'video' ? 'mp4' : 'jpg');
      const filename = leadName ? `${leadName.replace(/[^a-z0-9]/gi, '_')}.${extension}` : originalFilename;

      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
      // Fallback: open in new tab
      window.open(imageUrl, '_blank');
    }
  }, [imageUrl, leadName, mediaType]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
      // Reset error state when modal opens
      setMediaError(false);
      setIsPlaying(true);
    } else {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
    >
      <div className="relative max-w-4xl max-h-screen p-4">
        {/* Action buttons */}
        <div className="absolute top-4 right-4 z-10 flex gap-2">
          {/* Download button */}
          <button
            onClick={handleDownload}
            className="bg-black bg-opacity-50 text-white rounded-full p-2 hover:bg-opacity-70 transition-all duration-200"
            aria-label="Download file"
            title="Download"
          >
            <FiDownload className="h-6 w-6" />
          </button>
          {/* Close button */}
          <button
            onClick={onClose}
            className="bg-black bg-opacity-50 text-white rounded-full p-2 hover:bg-opacity-70 transition-all duration-200"
            aria-label="Close photo modal"
          >
            <FiX className="h-6 w-6" />
          </button>
        </div>

        {/* Media container - supports images, GIFs, videos, and unsupported formats */}
        <div className="relative">
          {!mediaError ? (
            <>
              {/* HEIC - unsupported format message */}
              {mediaType === 'heic' && (
                <div className="max-w-md bg-gray-100 rounded-lg shadow-2xl flex items-center justify-center p-8">
                  <div className="text-center text-gray-600">
                    <span className="text-6xl mb-4 block">📷</span>
                    <p className="text-lg font-medium mb-2">HEIC Format</p>
                    <p className="text-sm mb-4">This Apple image format is not supported in browsers.</p>
                    <button
                      onClick={handleDownload}
                      className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
                    >
                      Download Original File
                    </button>
                  </div>
                </div>
              )}

              {/* PDF - open in new tab */}
              {mediaType === 'pdf' && (
                <div className="max-w-md bg-gray-100 rounded-lg shadow-2xl flex items-center justify-center p-8">
                  <div className="text-center text-gray-600">
                    <span className="text-6xl mb-4 block">📄</span>
                    <p className="text-lg font-medium mb-2">PDF Document</p>
                    <p className="text-sm mb-4">Click below to view or download the PDF.</p>
                    <div className="flex gap-2 justify-center">
                      <button
                        onClick={() => window.open(imageUrl, '_blank')}
                        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
                      >
                        Open PDF
                      </button>
                      <button
                        onClick={handleDownload}
                        className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 transition-colors"
                      >
                        Download
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Video player */}
              {mediaType === 'video' && (
                <div className="relative">
                  <video
                    ref={videoRef}
                    src={imageUrl}
                    className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                    autoPlay
                    loop
                    muted={false}
                    playsInline
                    controls
                    onError={() => setMediaError(true)}
                  />
                  {/* Play/Pause overlay button */}
                  <button
                    onClick={togglePlayPause}
                    className="absolute bottom-20 right-4 bg-black bg-opacity-50 text-white rounded-full p-3 hover:bg-opacity-70 transition-all duration-200"
                    aria-label={isPlaying ? 'Pause video' : 'Play video'}
                  >
                    {isPlaying ? <FiPause className="h-6 w-6" /> : <FiPlay className="h-6 w-6" />}
                  </button>
                </div>
              )}

              {/* GIF - full animation, no controls needed */}
              {mediaType === 'gif' && (
                <img
                  src={imageUrl}
                  alt={leadName}
                  className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                  onError={() => setMediaError(true)}
                />
              )}

              {/* Regular image */}
              {mediaType === 'image' && (
                <img
                  src={imageUrl}
                  alt={leadName}
                  className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                  onError={() => setMediaError(true)}
                />
              )}
            </>
          ) : (
            // Fallback when media fails to load
            <div className="max-w-full max-h-[90vh] bg-gray-100 rounded-lg shadow-2xl flex items-center justify-center p-8">
              <div className="text-center text-gray-500">
                <FiX className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                <p className="text-lg font-medium mb-2">
                  {mediaType === 'video' ? 'Video' : 'Image'} could not be loaded
                </p>
                <p className="text-sm">The file may be missing or corrupted</p>
              </div>
            </div>
          )}

          {/* Media info */}
          <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white p-4 rounded-b-lg">
            <p className="text-lg font-medium">
              {leadName}
              {mediaType !== 'image' && (
                <span className="ml-2 text-xs uppercase bg-white bg-opacity-20 px-2 py-1 rounded">
                  {mediaType}
                </span>
              )}
            </p>
            <p className="text-sm opacity-90">Click outside or press ESC to close</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PhotoModal;
