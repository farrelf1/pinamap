'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { Feature, Point, GeoJsonProperties } from 'geojson';

interface PanelProps {
  feature: Feature | null;
  results: Feature[];
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onSearch: (receiver: string) => void;
  onSelectResult: (feature: Feature) => void;
  onNewPin: (feature: Feature) => void;
  onPinFormToggle: (show: boolean) => void;
  pinFormData?: {
    latitude: string;
    longitude: string;
  };
  isLoading: boolean;
}

// Image processing utility function
const compressImage = async (file: File, maxWidth: number, maxHeight: number, quality = 0.1): Promise<File> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (event) => {
      img.src = event.target?.result as string;
    };

    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // Calculate new dimensions
      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width *= maxHeight / height;
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      // Draw and compress image
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Canvas toBlob failed'));
            return;
          }

          const compressedFile = new File([blob], file.name, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
          resolve(compressedFile);
        },
        'image/jpeg',
        quality
      );
    };

    reader.onerror = () => reject(new Error('FileReader failed'));
    img.onerror = () => reject(new Error('Image loading failed'));

    reader.readAsDataURL(file);
  });
};

export default function Panel({
  feature,
  results,
  searchQuery,
  onSearchQueryChange,
  onSearch,
  onSelectResult,
  onNewPin,
  onPinFormToggle,
  pinFormData,
  isLoading,
}: PanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    message: '',
    receiver: '',
    image: null as File | null,
  });
  const [markerLocation, setMarkerLocation] = useState<[number, number] | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (pinFormData?.latitude && pinFormData?.longitude) {
      setMarkerLocation([
        parseFloat(pinFormData.longitude),
        parseFloat(pinFormData.latitude),
      ]);
    }
  }, [pinFormData]);

  const handleLoadImage = useCallback((featureId: string, imageUrl: string) => {
    setLoadedImages(prev => {
      const newSet = new Set(prev);
      newSet.add(featureId);
      return newSet;
    });
  }, []);

  const handleFormChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
      if (errorMessage) setErrorMessage(null);
    },
    [errorMessage]
  );

  const handleImageChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const originalFile = e.target.files[0];
      setIsSubmitting(true);
  
      try {
        console.log('Original file size:', (originalFile.size / 1024).toFixed(2), 'KB');
        
        // Compress image (max 1200px, 70% quality)
        const compressedFile = await compressImage(originalFile, 1200, 1200, 0.7);
        
        console.log('Compressed file size:', (compressedFile.size / 1024).toFixed(2), 'KB');
        console.log('Compression ratio:', 
          ((originalFile.size - compressedFile.size) / originalFile.size * 100).toFixed(2), '%');
  
        setFormData(prev => ({ ...prev, image: compressedFile }));
        
        // Create preview URL
        const reader = new FileReader();
        reader.onload = (event) => {
          setImagePreview(event.target?.result as string);
        };
        reader.readAsDataURL(compressedFile);
  
      } catch (error) {
        console.error('Image compression error:', error);
        setErrorMessage('Failed to process image');
        // Fallback to original file if compression fails
        setFormData(prev => ({ ...prev, image: originalFile }));
        const reader = new FileReader();
        reader.onload = (event) => {
          setImagePreview(event.target?.result as string);
        };
        reader.readAsDataURL(originalFile);
      } finally {
        setIsSubmitting(false);
      }
    }
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!markerLocation) {
      setErrorMessage('Please drag the marker to a location on the map.');
      return;
    }

    if (!formData.message.trim() || !formData.receiver.trim()) {
      setErrorMessage('Please fill in all fields.');
      return;
    }

    setIsSubmitting(true);

    try {
      const formPayload = new FormData();
      formPayload.append('message', formData.message);
      formPayload.append('receiver', formData.receiver);
      formPayload.append('latitude', markerLocation[1].toString());
      formPayload.append('longitude', markerLocation[0].toString());
      
      if (formData.image) {
        formPayload.append('image', formData.image);
      }

      const response = await fetch('/api/submit', {
        method: 'POST',
        body: formPayload,
      });

      if (!response.ok) {
        throw new Error(`Failed to pin memory: ${response.statusText}`);
      }

      const result = await response.json();
      const newMemory = result.data?.[0];

      if (!newMemory || !newMemory.id) {
        throw new Error('Invalid response from server');
      }

      const newFeature: Feature<Point, GeoJsonProperties> = {
        type: 'Feature',
        properties: {
          id: `msg${newMemory.id}`,
          message: newMemory.message,
          receiver: newMemory.receiver,
          time: newMemory.time,
          hasImage: newMemory.has_image,
          image_url: newMemory.image_url,
        },
        geometry: {
          type: 'Point',
          coordinates: [newMemory.longitude, newMemory.latitude],
        },
      };

      onNewPin(newFeature);
      
      // Reset form state
      setFormData({ message: '', receiver: '', image: null });
      setImagePreview(null);
      setMarkerLocation(null);
      setShowForm(false);
      onPinFormToggle(false);
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to submit memory');
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, markerLocation, onNewPin, onPinFormToggle]);

  const renderFeatureCard = useCallback((f: Feature) => {
    const featureId = f.properties?.id;
    const hasImage = f.properties?.hasImage;
    const imageUrl = f.properties?.image_url;
    const isImageLoaded = loadedImages.has(featureId);

    return (
      <div
        key={featureId}
        className="border border-gray-300 rounded-lg p-3 shadow hover:shadow-md transition cursor-pointer bg-white"
        onClick={() => onSelectResult(f)}
      >
        <div className="mb-2">
          <p className="text-sm text-gray-500">To: <span className="text-black font-semibold">{f.properties?.receiver}</span></p>
          <p className="text-sm text-gray-500">Time: <span className="text-black">{new Date(f.properties?.time).toLocaleString()}</span></p>
        </div>
        <p className="text-gray-800 text-sm italic mb-1">"{f.properties?.message}"</p>
        
        {hasImage && (
          <div className="mb-2">
            {isImageLoaded ? (
              <img 
                src={imageUrl} 
                alt="Memory" 
                className="w-full h-auto rounded border border-gray-200"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleLoadImage(featureId, imageUrl);
                }}
                className="w-full bg-gray-100 hover:bg-gray-200 rounded p-2 text-xs text-gray-700 flex items-center justify-center"
              >
                <span>📷 Contains image - Click to load</span>
              </button>
            )}
          </div>
        )}
        
        <p className="text-xs text-gray-500">
          📍{' '}
          {(f.geometry.type === 'Point' && Array.isArray(f.geometry.coordinates))
            ? f.geometry.coordinates.join(', ')
            : 'unknown location'}
        </p>
      </div>
    );
  }, [loadedImages, handleLoadImage, onSelectResult]);

  const handleToggleForm = useCallback(() => {
    const toggled = !showForm;
    setShowForm(toggled);
    onPinFormToggle(toggled);
    
    if (!toggled) {
      setFormData({ message: '', receiver: '', image: null });
      setImagePreview(null);
      setErrorMessage(null);
    }
  }, [showForm, onPinFormToggle]);

  return (
    <div className="absolute left-4 top-4 right-4 max-w-xs bg-white shadow-lg p-5 rounded-lg z-10 overflow-y-auto max-h-[90vh] text-gray-800 border border-gray-300">
      <h2 className="text-2xl font-bold mb-4">pin a memory</h2>

      {!showForm && (
        <>
          <div className="flex items-center space-x-2 mb-4">
            <input
              type="text"
              placeholder="search receiver..."
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none w-1"
            />
            <button
              onClick={() => onSearch(searchQuery)}
              disabled={isLoading}
              className={`${
                isLoading ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'
              } text-white px-3 py-2 rounded-lg transition`}
            >
              {isLoading ? 'loading...' : 'search'}
            </button>
          </div>

          {isLoading && results.length === 0 && !feature && (
            <div className="text-center py-3 text-gray-500">Loading...</div>
          )}

          {results.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">Found {results.length} memories:</p>
              {results.map(renderFeatureCard)}
            </div>
          ) : feature ? (
            <div className="space-y-3">{renderFeatureCard(feature)}</div>
          ) : (
            <p className="text-gray-500">click a point or search</p>
          )}
        </>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <input
              type="text"
              name="receiver"
              placeholder="receiver"
              value={formData.receiver}
              onChange={handleFormChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded"
              disabled={isSubmitting}
            />
            <p className="text-xs text-gray-500 mt-1">who this memory is for</p>
          </div>
          
          <div>
            <textarea
              name="message"
              placeholder="message"
              value={formData.message}
              onChange={handleFormChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded"
              rows={4}
              disabled={isSubmitting}
            />
            <p className="text-xs text-gray-500 mt-1">your message</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Image (optional)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100"
              disabled={isSubmitting}
            />
            {imagePreview && (
              <div className="mt-2">
                <img 
                  src={imagePreview} 
                  alt="Preview" 
                  className="max-w-full h-auto rounded border border-gray-200"
                />
                <button
                  type="button"
                  onClick={() => {
                    setFormData(prev => ({ ...prev, image: null }));
                    setImagePreview(null);
                  }}
                  className="mt-1 text-xs text-red-500 hover:text-red-700"
                >
                  Remove image
                </button>
              </div>
            )}
          </div>

          {markerLocation ? (
            <p className="text-sm text-gray-700">📍 marker position: {markerLocation[1].toFixed(5)}, {markerLocation[0].toFixed(5)}</p>
          ) : (
            <p className="text-sm text-red-500">drag the marker on the map to set location</p>
          )}

          {errorMessage && (
            <p className="text-red-500 text-sm p-2 bg-red-50 rounded">{errorMessage}</p>
          )}

          <button 
            type="submit" 
            className={`w-full ${
              isSubmitting ? 'bg-gray-500' : 'bg-black hover:bg-gray-800'
            } text-white py-2 rounded-lg transition`}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'submitting...' : 'submit memory'}
          </button>
        </form>
      )}

      <button
        onClick={handleToggleForm}
        className={`mt-4 w-full ${
          showForm 
            ? 'bg-blue-600 hover:bg-blue-700' 
            : 'bg-blue-600 hover:bg-blue-700'
        } text-white py-2 rounded-lg transition`}
        disabled={isSubmitting}
      >
        {showForm ? 'cancel' : 'pin a memory'}
      </button>
    </div>
  );
}