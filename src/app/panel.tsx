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
  });
  const [markerLocation, setMarkerLocation] = useState<[number, number] | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (pinFormData?.latitude && pinFormData?.longitude) {
      setMarkerLocation([
        parseFloat(pinFormData.longitude),
        parseFloat(pinFormData.latitude),
      ]);
    }
  }, [pinFormData]);

  const handleFormChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
      // Clear any previous error when user makes changes
      if (errorMessage) setErrorMessage(null);
    },
    [errorMessage]
  );

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
      const response = await fetch('/api/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          latitude: markerLocation[1],
          longitude: markerLocation[0],
        }),
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
        },
        geometry: {
          type: 'Point',
          coordinates: [newMemory.longitude, newMemory.latitude],
        },
      };

      onNewPin(newFeature);
      
      // Reset all form state at once
      setFormData({ message: '', receiver: '' });
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

  const renderFeatureCard = useCallback((f: Feature) => (
    <div
      key={f.properties?.id}
      className="border border-gray-300 rounded-lg p-3 shadow hover:shadow-md transition cursor-pointer bg-white"
      onClick={() => onSelectResult(f)}
    >
      <div className="mb-2">
        <p className="text-sm text-gray-500">To: <span className="text-black font-semibold">{f.properties?.receiver}</span></p>
        <p className="text-sm text-gray-500">Time: <span className="text-black">{new Date(f.properties?.time).toLocaleString()}</span></p>
      </div>
      <p className="text-gray-800 text-sm italic mb-1">"{f.properties?.message}"</p>
      <p className="text-xs text-gray-500">
        📍{' '}
        {(f.geometry.type === 'Point' && Array.isArray(f.geometry.coordinates))
          ? f.geometry.coordinates.join(', ')
          : 'unknown location'}
      </p>
    </div>
  ), [onSelectResult]);

  const handleToggleForm = useCallback(() => {
    const toggled = !showForm;
    setShowForm(toggled);
    onPinFormToggle(toggled);
    
    // Clear form state when closing
    if (!toggled) {
      setFormData({ message: '', receiver: '' });
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