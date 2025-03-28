import React, { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import { RouteData } from "@/services/routeApi";

interface RouteLayerProps {
  map: mapboxgl.Map;
  routeData: RouteData;
}

const RouteLayer: React.FC<RouteLayerProps> = ({ map, routeData }) => {
  const routeSourcesRef = useRef<string[]>([]);

  useEffect(() => {
    if (!routeData) return;
    
    // Clean up existing sources and layers
    routeSourcesRef.current.forEach(id => {
      if (map.getLayer(id)) {
        map.removeLayer(id);
      }
      if (map.getSource(id)) {
        map.removeSource(id);
      }
    });
    
    routeSourcesRef.current = [];
    
    // Add each path as a separate line
    routeData.paths.forEach((path, pathIndex) => {
      const sourceId = `route-source-${pathIndex}`;
      const layerId = `route-layer-${pathIndex}`;
      
      // Convert coordinates to GeoJSON format
      const coordinates = path.coordinates.map(coord => 
        [coord.longitude, coord.latitude]
      );
      
      // Add source
      map.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates
          }
        }
      });
      
      // Add line layer before the bus layer and POI labels
      map.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#07c1ff',
          'line-width': 4,
          'line-opacity': 0.8
        }
      }, 'bus-model-layer-group'); // This ensures routes are below buses
      
      routeSourcesRef.current.push(sourceId);
    });

    // Cleanup on unmount or when routeData changes
    return () => {
      routeSourcesRef.current.forEach(id => {
        if (map.getLayer(id)) {
          map.removeLayer(id);
        }
        if (map.getSource(id)) {
          map.removeSource(id);
        }
      });
      routeSourcesRef.current = [];
    };
  }, [map, routeData]);

  return null; // This component doesn't render anything
};

export default RouteLayer; 