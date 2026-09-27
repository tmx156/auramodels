import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const API = process.env.REACT_APP_API_URL || '';

const PublicGallery = () => {
  const { token } = useParams();
  const [gallery, setGallery] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  useEffect(() => {
    const fetchGallery = async () => {
      try {
        const res = await axios.get(`${API}/api/shared-gallery/public/${token}`);
        if (res.data.success) {
          setGallery(res.data.gallery);
        } else {
          setError('Gallery not found');
        }
      } catch (err) {
        setError(err.response?.status === 404 ? 'This gallery link is invalid or has been removed.' : 'Something went wrong loading this gallery.');
      } finally {
        setLoading(false);
      }
    };
    fetchGallery();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-4 text-gray-500">Loading gallery...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="text-6xl mb-4">📷</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Gallery Not Found</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  const photos = gallery?.photos || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-orange-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {gallery?.lead_name ? `${gallery.lead_name}'s Photos` : 'Photo Gallery'}
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                {photos.length} photo{photos.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="text-sm text-gray-400">
              Auralndn
            </div>
          </div>
        </div>
      </header>

      {/* Photo Grid */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {photos.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-500">No photos in this gallery.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {photos.map((photo) => {
              const url = photo.cloudinary_secure_url || photo.cloudinary_url;
              return (
                <div
                  key={photo.id}
                  className="group relative cursor-pointer rounded-xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 bg-white"
                  onClick={() => setSelectedPhoto(photo)}
                >
                  <div className="aspect-square">
                    <img
                      src={url}
                      alt={photo.filename || 'Photo'}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  </div>
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all duration-300 flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 text-white text-sm font-medium bg-black/50 px-3 py-1.5 rounded-full transition-opacity duration-300">
                      View
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Lightbox */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white text-3xl font-light z-50"
            onClick={() => setSelectedPhoto(null)}
          >
            &times;
          </button>

          {/* Prev / Next */}
          {photos.length > 1 && (
            <>
              <button
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-4xl font-light z-50"
                onClick={(e) => {
                  e.stopPropagation();
                  const idx = photos.findIndex(p => p.id === selectedPhoto.id);
                  setSelectedPhoto(photos[(idx - 1 + photos.length) % photos.length]);
                }}
              >
                &#8249;
              </button>
              <button
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-4xl font-light z-50"
                onClick={(e) => {
                  e.stopPropagation();
                  const idx = photos.findIndex(p => p.id === selectedPhoto.id);
                  setSelectedPhoto(photos[(idx + 1) % photos.length]);
                }}
              >
                &#8250;
              </button>
            </>
          )}

          <img
            src={selectedPhoto.cloudinary_secure_url || selectedPhoto.cloudinary_url}
            alt={selectedPhoto.filename || 'Photo'}
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Counter */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
            {photos.findIndex(p => p.id === selectedPhoto.id) + 1} / {photos.length}
          </div>
        </div>
      )}
    </div>
  );
};

export default PublicGallery;
