import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { BusData, fetchBusLocations } from "@/services/busApi";
import { fetchRouteData, RouteData } from "@/services/routeApi";
import Bus3DModel from "./Bus3DModel";
import InfoPanel from "./InfoPanel";
import { toast } from "sonner";

// Update to use VITE environment variable
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '';

interface MapViewProps {
  className?: string;
}

interface MapPosition {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}

const MapView: React.FC<MapViewProps> = ({ className }) => {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const routeSourcesRef = useRef<string[]>([]);
  const navigationControl = useRef<mapboxgl.NavigationControl | null>(null);
  
  const [buses, setBuses] = useState<BusData[]>([]);
  const [selectedBus, setSelectedBus] = useState<BusData | null>(null);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [previousMapPosition, setPreviousMapPosition] = useState<MapPosition | null>(null);
  
  // Derived state to track when we're actively following a bus
  const isFollowingBus = selectedBus !== null && showInfoPanel;

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current) return;
    if (map.current) return; // Don't initialize map more than once

    // Create map
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/limit-/cm36l188r015v01qkhf10d7pa",
      center: [-79.979146, 42.117963],
      zoom: 15.7,
      pitch: 43.00,
      bearing: 8.80,
      antialias: true,
    });

    // Add navigation controls
    navigationControl.current = new mapboxgl.NavigationControl({
      visualizePitch: true,
      showCompass: true,
    });
    map.current.addControl(navigationControl.current, "top-right");

    // Map load complete
    map.current.on("load", () => {
      toast.success("Map loaded successfully");
      setIsMapLoaded(true);
      
      // Load route data
      loadRouteData();
      
      // Initial load of bus data
      loadBusData();
    });

    // Clean up on unmount
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);
  
  // Load route data
  const loadRouteData = async () => {
    try {
      const data = await fetchRouteData();
      setRouteData(data);
      toast.success("Route data loaded");
    } catch (error) {
      console.error("Error loading route data:", error);
      toast.error("Failed to load route data");
    }
  };
  
  // Fetch bus data
  const loadBusData = async () => {
    try {
      const data = await fetchBusLocations();
      if (data.length > 0) {
        console.log("Bus data loaded:", data);
        setBuses(data);
        
        // If we're following a bus, update its position
        if (isFollowingBus && selectedBus) {
          const updatedSelectedBus = data.find(bus => bus.VehicleId === selectedBus.VehicleId);
          if (updatedSelectedBus && map.current) {
            setSelectedBus(updatedSelectedBus);
            
            // Instantly update camera position to follow bus
            map.current.setCenter([updatedSelectedBus.Longitude, updatedSelectedBus.Latitude]);
            map.current.setBearing(updatedSelectedBus.Heading || 0);
          }
        }
        
        toast.success(`Found ${data.length} active buses`);
      } else {
        toast.warning("No active buses found");
      }
    } catch (error) {
      console.error("Error fetching bus data:", error);
      toast.error("Failed to load bus locations");
    }
  };
  
  // Add route layers to map
  useEffect(() => {
    if (!map.current || !routeData || !isMapLoaded) return;
    
    // Clean up existing sources and layers
    routeSourcesRef.current.forEach(id => {
      if (map.current?.getLayer(id)) {
        map.current.removeLayer(id);
      }
      if (map.current?.getSource(id)) {
        map.current.removeSource(id);
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
      map.current!.addSource(sourceId, {
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
      
      // Add line layer
      map.current!.addLayer({
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
      });
      
      routeSourcesRef.current.push(sourceId);
    });
    
  }, [routeData, isMapLoaded]);

  // Set up polling for bus data
  useEffect(() => {
    // Skip if map isn't loaded yet
    if (!isMapLoaded) return;
    
    // Initial fetch already happened on map load
    
    // Set up polling interval
    const interval = setInterval(loadBusData, 10000); // Poll every 10 seconds

    return () => {
      clearInterval(interval);
    };
  }, [isMapLoaded, selectedBus]);

  // Function to disable map interactions
  const disableMapInteractions = () => {
    if (!map.current) return;
    
    // Disable map interactions
    map.current.dragPan.disable();
    map.current.scrollZoom.disable();
    map.current.doubleClickZoom.disable();
    map.current.touchZoomRotate.disable();
    map.current.keyboard.disable();
    
    // Remove navigation control
    if (navigationControl.current) {
      map.current.removeControl(navigationControl.current);
    }
  };

  // Function to enable map interactions
  const enableMapInteractions = () => {
    if (!map.current) return;
    
    // Enable map interactions
    map.current.dragPan.enable();
    map.current.scrollZoom.enable();
    map.current.doubleClickZoom.enable();
    map.current.touchZoomRotate.enable();
    map.current.keyboard.enable();
    
    // Add back navigation control
    if (navigationControl.current && !map.current.hasControl(navigationControl.current)) {
      map.current.addControl(navigationControl.current, "top-right");
    }
  };

  // Handle bus selection
  const handleBusClick = (bus: BusData) => {
    if (!map.current) return;
    
    // Store current map position before flying to bus
    setPreviousMapPosition({
      center: map.current.getCenter().toArray() as [number, number],
      zoom: map.current.getZoom(),
      pitch: map.current.getPitch(),
      bearing: map.current.getBearing()
    });
    
    setSelectedBus(bus);
    setShowInfoPanel(true);
    
    // Fly to the selected bus with enhanced zoom and pitch
    map.current.flyTo({
      center: [bus.Longitude, bus.Latitude],
      zoom: 18, // Closer zoom
      pitch: 60,
      bearing: bus.Heading || 0, // Orient the map to match bus heading
      speed: 4,
      essential: true, // This ensures the animation happens
    });

    // Disable map interactions after the animation
    map.current.once('moveend', disableMapInteractions);
  };

  // Handle info panel close
  const handleInfoPanelClose = () => {
    setShowInfoPanel(false);
    setSelectedBus(null);
    
    // Enable map interactions before starting the animation
    enableMapInteractions();
    
    // Restore previous map position if available
    if (map.current && previousMapPosition) {
      map.current.flyTo({
        center: previousMapPosition.center,
        zoom: previousMapPosition.zoom,
        pitch: previousMapPosition.pitch,
        bearing: previousMapPosition.bearing,
        speed: 10,
        essential: true,
      });
      setPreviousMapPosition(null);
    }
  };

  return (
    <div className={className}>
      <div ref={mapContainer} className="map-container" />
      
      {/* Render 3D bus models */}
      {map.current && buses.map(bus => (
        <Bus3DModel 
          key={`bus-model-${bus.VehicleId}`} 
          bus={bus} 
          map={map.current as mapboxgl.Map}
          onClick={() => handleBusClick(bus)}
        />
      ))}
      
      {/* Info panel - only shown when a bus is selected */}
      <InfoPanel 
        bus={selectedBus} 
        isVisible={isFollowingBus} 
        onClose={handleInfoPanelClose}
      />
      
      {/* Map controls overlay */}
      <div className="fixed top-6 left-0 right-0 mx-auto z-10 flex justify-center">
        <div className="glass rounded-full px-6 py-3 flex items-center shadow-lg">
          <div className="text-sm font-medium">Erie Metropolitan Transit Authority</div>
          <div className="mx-2 h-4 w-px bg-gray-300"></div>
          <div className="text-sm text-gray-600">Route 18 Tracking</div>
        </div>
      </div>
    </div>
  );
};

export default MapView;
