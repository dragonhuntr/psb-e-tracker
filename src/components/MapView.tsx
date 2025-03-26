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

const MapView: React.FC<MapViewProps> = ({ className }) => {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const routeSourcesRef = useRef<string[]>([]);
  
  const [buses, setBuses] = useState<BusData[]>([]);
  const [selectedBus, setSelectedBus] = useState<BusData | null>(null);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [routeData, setRouteData] = useState<RouteData | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current) return;
    if (map.current) return; // Don't initialize map more than once

    // Create map
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/limit-/cm36l188r015v01qkhf10d7pa",
      center: [-79.979146, 42.117963],
      zoom: 16.09,
      pitch: 43.00,
      bearing: 8.80,
      antialias: true,
    });

    // Add navigation controls
    map.current.addControl(
      new mapboxgl.NavigationControl({
        visualizePitch: true,
        showCompass: true,
      }),
      "top-right"
    );

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
        
        // If selected bus exists, update its data
        if (selectedBus) {
          const updatedSelectedBus = data.find(bus => bus.VehicleId === selectedBus.VehicleId);
          if (updatedSelectedBus) {
            setSelectedBus(updatedSelectedBus);
          }
        }
        
        toast.success(`Found ${data.length} active buses`);
      } else {
        // Set default bus location when no buses are found
        const defaultBus: BusData = {
          VehicleId: 0,
          Latitude: 42.118093,
          Longitude: -79.982131,
          Heading: 0,
          Speed: 0,
          LastUpdated: new Date().toISOString(),
          BlockFareboxId: 0,
          CommStatus: "0",
          Destination: "",
          Deviation: 0,
          Direction: "0",
          DirectionLong: "0",
          DisplayStatus: "0",
          StopId: 0,
          CurrentStatus: "",
          DriverName: "",
          DriverLastName: "",
          DriverFirstName: "",
          DriverFareboxId: 0,
          VehicleFareboxId: 0,
          GPSStatus: 0,
          LastStop: "",
          Name: "",
          OccupancyStatus: 0,
          OnBoard: 0,
          OpStatus: "",
          RouteId: 0,
          RunId: 0,
          TripId: 0,
          SeatingCapacity: 0,
          TotalCapacity: 0,
          PropertyName: "",
          OccupancyStatusReportLabel: ""
        };
        setBuses([defaultBus]);
        toast.warning("No active buses found - showing default location");
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

  // Handle bus selection
  const handleBusClick = (bus: BusData) => {
    setSelectedBus(bus);
    setShowInfoPanel(true);
    
    // Fly to the selected bus with enhanced zoom and pitch
    if (map.current) {
      map.current.flyTo({
        center: [bus.Longitude, bus.Latitude],
        zoom: 18, // Closer zoom
        pitch: 60,
        bearing: bus.Heading || 0, // Orient the map to match bus heading
        speed: 0.8,
        essential: true, // This ensures the animation happens
      });
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
        isVisible={showInfoPanel && selectedBus !== null} 
        onClose={() => setShowInfoPanel(false)}
      />
      
      {/* Map controls overlay */}
      <div className="fixed top-6 left-0 right-0 mx-auto z-10 flex justify-center">
        <div className="glass rounded-full px-6 py-3 flex items-center shadow-lg">
          <div className="text-sm font-medium">Erie Metropolitan Transit Authority</div>
          <div className="mx-2 h-4 w-px bg-gray-300"></div>
          <div className="text-sm text-gray-600">Route 18 Tracking</div>
        </div>
      </div>
      
      {/* Debug info - only during development */}
      {buses.length > 0 && (
        <div className="fixed bottom-20 left-6 z-10 bg-white/80 p-2 rounded-md text-xs shadow-md">
          <div>Bus Count: {buses.length}</div>
          <div>Latest Bus Position: {buses[0].Latitude.toFixed(6)}, {buses[0].Longitude.toFixed(6)}</div>
        </div>
      )}
    </div>
  );
};

export default MapView;
