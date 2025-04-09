'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';

interface LocationSearchProps {
  mapboxToken: string;
  onLocationSelect: (lng: number, lat: number, zoom?: number) => void;
  onTempMarker: (lng: number, lat: number) => void;
}

interface SearchBoxSuggestion {
  name: string;
  name_preferred?: string;
  mapbox_id: string;
  feature_type: string;
  address?: string;
  full_address?: string;
  context?: {
    country?: {
      name: string;
    };
    region?: {
      name: string;
    };
    place?: {
      name: string;
    };
  };
}

interface SearchBoxSuggestResponse {
  suggestions: SearchBoxSuggestion[];
}

interface SearchBoxRetrieveResponse {
  features: Array<{
    geometry: {
      coordinates: [number, number];
    };
    properties: {
      name: string;
      mapbox_id: string;
      feature_type: string;
      name_preferred?: string;
    };
  }>;
}

export default function LocationSearch({ mapboxToken, onLocationSelect, onTempMarker }: LocationSearchProps) {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [results, setResults] = useState<SearchBoxSuggestion[]>([]);
  const [showResults, setShowResults] = useState<boolean>(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const sessionTokenRef = useRef<string>(generateSessionToken());

  // Function to generate a unique session token
  function generateSessionToken(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Reset session token after a successful search cycle
  const resetSessionToken = useCallback(() => {
    sessionTokenRef.current = generateSessionToken();
  }, []);

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

  const fetchSearchSuggestions = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      setShowResults(false);
      return;
    }
    
    setIsSearching(true);
    
    try {
      const endpoint = `https://api.mapbox.com/search/searchbox/v1/suggest?q=${encodeURIComponent(query)}&session_token=${sessionTokenRef.current}&access_token=${mapboxToken}&limit=5`;
      
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error('Search Box suggest API call failed');
      
      const data: SearchBoxSuggestResponse = await response.json();
      setResults(data.suggestions || []);
      setShowResults(data.suggestions.length > 0);
    } catch (error) {
      console.error('Search suggestion error:', error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [mapboxToken]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchTerm(query);

    // Debounce the API calls while typing
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    searchDebounceRef.current = setTimeout(() => {
      fetchSearchSuggestions(query);
    }, 300);
  }, [fetchSearchSuggestions]);

  const retrieveLocation = useCallback(async (mapboxId: string) => {
    setIsSearching(true);
    
    try {
      const endpoint = `https://api.mapbox.com/search/searchbox/v1/retrieve/${mapboxId}?session_token=${sessionTokenRef.current}&access_token=${mapboxToken}`;
      
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error('Search Box retrieve API call failed');
      
      const data: SearchBoxRetrieveResponse = await response.json();
      
      if (data.features && data.features.length > 0) {
        const feature = data.features[0];
        
        const [lng, lat] = feature.geometry.coordinates;
        onLocationSelect(lng, lat);
        onTempMarker(lng, lat);

        // Update the search term with the selected place name
        setSearchTerm(feature.properties.name_preferred || feature.properties.name);
        
        // Reset session token after successful suggest + retrieve cycle
        resetSessionToken();
      }
    } catch (error) {
      console.error('Location retrieve error:', error);
    } finally {
      setIsSearching(false);
      setShowResults(false);
    }
  }, [mapboxToken, onLocationSelect, onTempMarker, resetSessionToken]);

  const handleResultClick = useCallback((suggestion: SearchBoxSuggestion) => {
    retrieveLocation(suggestion.mapbox_id);
  }, [retrieveLocation]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      
      if (results.length > 0) {
        // Select the first result on Enter
        retrieveLocation(results[0].mapbox_id);
      } else if (searchTerm.trim()) {
        // If no results but we have a search term, fetch suggestions
        fetchSearchSuggestions(searchTerm);
      }
    }
  }, [results, searchTerm, fetchSearchSuggestions, retrieveLocation]);

  const getDisplayName = (suggestion: SearchBoxSuggestion): string => {
    if (suggestion.name_preferred) {
      return suggestion.name_preferred;
    }

    let name = suggestion.name_preferred || suggestion.name;
    
    // Add context if available
    const context: string[] = [];
    if (suggestion.context) {
      if (suggestion.context.place?.name) context.push(suggestion.context.place.name);
      if (suggestion.context.region?.name) context.push(suggestion.context.region.name);
      if (suggestion.context.country?.name) context.push(suggestion.context.country.name);
    }
    
    if (context.length > 0) {
      name += `, ${context.join(', ')}`;
    }
    
    return name;
  };

  return (
    <div 
      ref={searchContainerRef}
      className="fixed bottom-0 left-0 right-0 mx-auto w-full max-w-md px-4 pb-[env(safe-area-inset-bottom)]"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }}
    >
      <div className="relative bg-white rounded-lg shadow-lg">
        <div className="flex items-center">
          <input
            type="text"
            placeholder="search for a location..."
            value={searchTerm}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            className="flex-1 px-4 py-3 rounded-lg border-0 focus:outline-none text-zinc-950"
          />
          <button
            onClick={() => results.length > 0 ? retrieveLocation(results[0].mapbox_id) : fetchSearchSuggestions(searchTerm)}
            disabled={isSearching}
            className={`px-4 py-3 rounded-r-lg ${
              isSearching ? 'bg-gray-300' : 'bg-blue-600 hover:bg-blue-700'
            } text-white`}
          >
            {isSearching ? 'search' : 'search'}
          </button>
        </div>

        {showResults && results.length > 0 && (
          <div className="absolute bottom-full mb-2 left-0 w-full bg-white rounded-lg shadow-lg max-h-60 overflow-y-auto text-black">
            {results.map((result) => (
              <div
                key={result.mapbox_id}
                className="px-4 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100"
                onClick={() => handleResultClick(result)}
              >
                <p className="text-sm font-medium">{getDisplayName(result)}</p>
                <p className="text-xs text-gray-500">
                  {result.full_address || 'Location'}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}