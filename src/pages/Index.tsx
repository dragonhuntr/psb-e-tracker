
import React from "react";
import MapView from "@/components/MapView";

const Index = () => {
  return (
    <div className="relative w-full h-screen overflow-hidden">
      <MapView className="w-full h-full" />
      
      {/* Attribution */}
      <div className="fixed bottom-2 right-2 text-xs text-gray-500 opacity-60 hover:opacity-100 transition-opacity duration-200">
        © Mapbox © OpenStreetMap
      </div>
    </div>
  );
};

export default Index;
