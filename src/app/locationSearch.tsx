'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';

interface LocationSearchProps {
  mapboxToken: string;
  onLocationSelect: (lng: number, lat: number, zoom?: number) => void;
}

interface GeocodingFeature {
  id: string;
  place_name: string;
  center: [number, number];
  relevance: number;
  properties: {
    [key: string]: any;
  };
}

export default function LocationSearch({ mapboxToken, onLocationSelect }: LocationSearchProps) {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [results, setResults] = useState<GeocodingFeature[]>([]);
  const [showResults, setShowResults] = useState<boolean>(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close results dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSearch = useCallback(async () => {
    if (!searchTerm.trim()) return;
    
    setIsSearching(true);
    
    try {
      const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
        searchTerm
      )}.json?access_token=${mapboxToken}&limit=5`;
      
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error('Geocoding failed');
      
      const data = await response.json();
      setResults(data.features || []);
      setShowResults(true);
    } catch (error) {
      console.error('Search location error:', error);
    } finally {
      setIsSearching(false);
    }
  }, [searchTerm, mapboxToken]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  }, []);

  const handleResultClick = useCallback((feature: GeocodingFeature) => {
    onLocationSelect(feature.center[0], feature.center[1]);
    setSearchTerm(feature.place_name);
    setShowResults(false);
  }, [onLocationSelect]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  }, [handleSearch]);

  return (
    <div 
      ref={searchContainerRef}
      className="absolute bottom-8 left-0 right-0 mx-auto w-full max-w-md px-4 "
    >
      <div className="relative bg-white rounded-lg shadow-lg">
        <div className="flex items-center">
          <input
            type="text"
            placeholder="Search for a location..."
            value={searchTerm}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            className="flex-1 px-4 py-3 rounded-l-lg border-0 focus:outline-none text-zinc-950"
          />
          <button
            onClick={handleSearch}
            disabled={isSearching}
            className={`px-4 py-3 rounded-r-lg ${
              isSearching ? 'bg-gray-300' : 'bg-blue-600 hover:bg-blue-700'
            } text-white`}
          >
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </div>

        {showResults && results.length > 0 && (
          <div className="absolute bottom-full mb-2 left-0 w-full bg-white rounded-lg shadow-lg max-h-60 overflow-y-auto text-black">
            {results.map((result) => (
              <div
                key={result.id}
                className="px-4 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100"
                onClick={() => handleResultClick(result)}
              >
                <p className="text-sm font-medium">{result.place_name}</p>
                <p className="text-xs text-gray-500">
                  {result.properties.category || 'Location'}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}