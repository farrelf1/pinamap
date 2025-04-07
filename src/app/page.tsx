'use client';

import * as React from 'react';
import { useRef, useEffect, useState, useCallback } from 'react';
import { Map, Source, Layer, Marker, GeolocateControl } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';

import { clusterLayer, clusterCountLayer, unclusteredPointLayer } from './layers';
import Panel from './panel';
import LocationSearch from './locationSearch';

import type { MapRef } from 'react-map-gl/mapbox';
import type { GeoJSONSource, MapLayerMouseEvent } from 'mapbox-gl';
import type { Feature, FeatureCollection, Point } from 'geojson';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

// Helper function to convert API data to GeoJSON features
const formatFeatures = (data: any[]): Feature[] => {
  return data.map((msg: any) => ({
    type: 'Feature',
    properties: {
      id: `msg${msg.id}`,
      message: msg.message,
      receiver: msg.receiver,
      time: msg.time,
    },
    geometry: {
      type: 'Point',
      coordinates: [msg.longitude, msg.latitude],
    },
  }));
};

export default function MemoryMap() {
  const mapRef = useRef<MapRef>(null);

  const [geojsonData, setGeojsonData] = useState<FeatureCollection>({
    type: 'FeatureCollection',
    features: [],
  });

  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);
  const [matchedFeatures, setMatchedFeatures] = useState<Feature[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [pinMode, setPinMode] = useState<boolean>(false);
  const [pinLocation, setPinLocation] = useState<[number, number]>([-103.59, 40.67]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [tempMarker, setTempMarker] = useState<[number, number] | null>(null);

  // Fetch initial data
  useEffect(() => {
    setIsLoading(true);
    fetch('/api/messages')
      .then(res => res.json())
      .then(data => {
        const formatted = formatFeatures(data);
        setGeojsonData({ type: 'FeatureCollection', features: formatted });
      })
      .catch(err => {
        console.error('Failed to fetch memories:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const handleMouseEnter = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map?.getCanvas()?.style) {
      map.getCanvas().style.cursor = 'pointer';
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map?.getCanvas()?.style) {
      map.getCanvas().style.cursor = '';
    }
  }, []);

  const onClick = useCallback((event: MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    if (!feature) {
      setTempMarker(null);
      return;
    }

    const isCluster = !!feature.properties?.cluster;

    if (isCluster) {
      const clusterId = feature.properties?.cluster_id;
      if (!clusterId) return;

      const mapboxSource = mapRef.current?.getSource('messages') as GeoJSONSource;

      mapboxSource.getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err || zoom == null) return;
        const coordinates = (feature.geometry as Point).coordinates as [number, number];
        mapRef.current?.easeTo({ center: coordinates, zoom, duration: 500 });
      });
    } else {
      setSelectedFeature(feature);
      setMatchedFeatures([]);
      setSearchQuery(''); // Clear search query when a feature is clicked
      setTempMarker(null);
    }
  }, []);

  const handleSearch = useCallback(async (receiver: string) => {
    setSearchQuery(receiver);
    setTempMarker(null);
    
    if (!receiver) {
      setMatchedFeatures([]);
      return;
    }

    setIsLoading(true);

    // First filter locally
    const localMatches = geojsonData.features.filter(
      f => f.properties?.receiver?.toLowerCase() === receiver.toLowerCase()
    );

    try {
      // Then try to get more from server
      const res = await fetch(`/api/search?receiver=${encodeURIComponent(receiver)}`);
      if (!res.ok) {
        throw new Error('Search request failed');
      }
      
      const serverData = await res.json();
      const serverMatches = formatFeatures(serverData || []);

      // Merge new features with existing data (avoid duplicates)
      const existingIds = new Set(geojsonData.features.map(f => f.properties?.id));
      const newFeatures = serverMatches.filter(f => !existingIds.has(f.properties?.id));

      if (newFeatures.length > 0) {
        setGeojsonData(prevData => ({
          ...prevData,
          features: [...prevData.features, ...newFeatures],
        }));
      }

      // Merge search results (avoid duplicates)
      const allMatches = [...localMatches];
      const seen = new Set(localMatches.map(f => f.properties?.id));
      for (const f of serverMatches) {
        if (!seen.has(f.properties?.id)) allMatches.push(f);
      }

      setMatchedFeatures(allMatches);
      setSelectedFeature(null);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, [geojsonData.features]);

  const handleNewPin = useCallback((feature: Feature) => {
    setGeojsonData(prevData => ({
      ...prevData,
      features: [...prevData.features, feature],
    }));
    
    setMatchedFeatures([]);
    setSelectedFeature(feature);
    setSearchQuery('');
    setTempMarker(null);
    
    const coordinates = (feature.geometry as Point).coordinates as [number, number];
    mapRef.current?.easeTo({ center: coordinates, zoom: 9, duration: 500 });
  }, []);

  const handleZoomToFeature = useCallback((feature: Feature) => {
    setMatchedFeatures([]);
    setSelectedFeature(feature);
    setSearchQuery('');
    setTempMarker(null);
    
    const coordinates = (feature.geometry as Point).coordinates as [number, number];
    mapRef.current?.easeTo({ center: coordinates, zoom: 9, duration: 500 });
  }, []);

  const handlePinToggle = useCallback((show: boolean) => {
    setPinMode(show);
    if (show) {
      const center = mapRef.current?.getCenter();
      if (center) {
        setPinLocation([center.lng, center.lat]);
      }
    }
    setTempMarker(null);
  }, []);

  const handleLocationSelect = useCallback((lng: number, lat: number, zoom: number = 13) => {
    mapRef.current?.easeTo({
      center: [lng, lat],
      zoom,
      duration: 1000,
    });
  }, []);

  const handleTempMarker = useCallback((lng: number, lat: number) => {
    setTempMarker([lng, lat]);
  }, []);

  return (
    <div className="w-full h-screen flex">
      <div className="flex-1 relative">
        <Map
          initialViewState={{ latitude: 40.67, longitude: -103.59, zoom: 3 }}
          mapStyle="mapbox://styles/mapbox/streets-v12"
          mapboxAccessToken={MAPBOX_TOKEN}
          interactiveLayerIds={[clusterLayer.id!, unclusteredPointLayer.id!]}
          onClick={onClick}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          ref={mapRef}
        >
          <GeolocateControl position="top-right" />
          
          <Source
            id="messages"
            type="geojson"
            data={geojsonData}
            cluster={true}
            clusterMaxZoom={14}
            clusterRadius={50}
          >
            <Layer {...clusterLayer} />
            <Layer {...clusterCountLayer} />
            <Layer {...unclusteredPointLayer} />
          </Source>

          {pinMode && (
            <Marker
              longitude={pinLocation[0]}
              latitude={pinLocation[1]}
              draggable
              onDragEnd={(e) =>
                setPinLocation([e.lngLat.lng, e.lngLat.lat])
              }
            />
          )}

          {tempMarker && (
            <Marker
              longitude={tempMarker[0]}
              latitude={tempMarker[1]}
              color="#3b82f6"
            />
          )}
        </Map>
        
        <LocationSearch 
          mapboxToken={MAPBOX_TOKEN}
          onLocationSelect={handleLocationSelect}
          onTempMarker={handleTempMarker}
        />
      </div>

      <Panel
        feature={selectedFeature}
        results={matchedFeatures}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onSearch={handleSearch}
        onSelectResult={handleZoomToFeature}
        onNewPin={handleNewPin}
        pinFormData={{
          latitude: pinLocation[1].toFixed(6),
          longitude: pinLocation[0].toFixed(6),
        }}
        onPinFormToggle={handlePinToggle}
        isLoading={isLoading}
      />
    </div>
  );
}