
import React from "react";
import { BusData, formatLastUpdated, getOccupancyColor, getOccupancyLabel } from "@/services/busApi";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface InfoPanelProps {
  bus: BusData | null;
  isVisible: boolean;
  onClose: () => void;
}

const InfoPanel: React.FC<InfoPanelProps> = ({ bus, isVisible, onClose }) => {
  if (!bus) return null;

  const occupancyColor = getOccupancyColor(bus.OccupancyStatusReportLabel);
  const lastUpdated = formatLastUpdated(bus.LastUpdated);
  
  return (
    <div 
      className={cn(
        "fixed bottom-6 left-0 right-0 mx-auto w-11/12 max-w-md z-10 transition-all duration-500 ease-in-out",
        isVisible ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0 pointer-events-none"
      )}
    >
      <div className="glass rounded-2xl overflow-hidden shadow-lg border border-white/20">
        <div className="bg-bus px-6 py-4 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="text-sm uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">Bus</span>
              <h2 className="text-xl font-semibold">{bus.Name}</h2>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <div className="text-sm font-medium">Route {bus.RouteId}</div>
                <div className="text-xs opacity-80">Run {bus.RunId}</div>
              </div>
              <button 
                onClick={onClose}
                aria-label="Close panel"
                className="bg-white/20 rounded-full p-1.5 hover:bg-white/30 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
        
        <div className="p-6 bg-white/95">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-500 font-medium mb-1">Destination</div>
              <div className="font-medium">{bus.Destination}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 font-medium mb-1">Status</div>
              <div className="font-medium">{bus.DisplayStatus}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 font-medium mb-1">Last Stop</div>
              <div className="font-medium">{bus.LastStop}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 font-medium mb-1">Direction</div>
              <div className="font-medium">{bus.DirectionLong}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 font-medium mb-1">Occupancy</div>
              <div className={cn("inline-block px-2 py-0.5 rounded-full text-xs font-semibold", occupancyColor)}>
                {getOccupancyLabel(bus.OccupancyStatusReportLabel)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 font-medium mb-1">Last Updated</div>
              <div className="font-medium">{lastUpdated}</div>
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-xs font-medium text-gray-600">Live Tracking</span>
              </div>
              <div className="text-xs text-gray-500">
                Capacity: {bus.OnBoard}/{bus.TotalCapacity}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InfoPanel;
