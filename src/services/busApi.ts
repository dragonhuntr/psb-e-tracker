import { toast } from "sonner";

export interface BusData {
  BlockFareboxId: number;
  CommStatus: string;
  Destination: string;
  Deviation: number;
  Direction: string;
  DirectionLong: string;
  DisplayStatus: string;
  StopId: number;
  CurrentStatus: string | null;
  DriverName: string;
  DriverLastName: string | null;
  DriverFirstName: string | null;
  DriverFareboxId: number;
  VehicleFareboxId: number;
  GPSStatus: number;
  Heading: number;
  LastStop: string;
  LastUpdated: string;
  Latitude: number;
  Longitude: number;
  Name: string;
  OccupancyStatus: number;
  OnBoard: number;
  OpStatus: string;
  RouteId: number;
  RunId: number;
  Speed: number;
  TripId: number;
  VehicleId: number;
  SeatingCapacity: number;
  TotalCapacity: number;
  PropertyName: string;
  OccupancyStatusReportLabel: string;
}

export const fetchBusLocations = async (): Promise<BusData[]> => {
  try {
    const response = await fetch(
      import.meta.env.VITE_BUS_API_URL
    );
    
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Error fetching bus data:", error);
    toast.error("Could not retrieve bus locations");
    return [];
  }
};

export const formatLastUpdated = (lastUpdatedStr: string): string => {
  try {
    // Parse the Microsoft JSON date format /Date(1742990687000-0400)/
    const timestamp = parseInt(
      lastUpdatedStr.replace(/\/Date\((\d+)([+-]\d{4})\)\//, "$1")
    );
    
    if (isNaN(timestamp)) {
      return "Unknown";
    }
    
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  } catch (error) {
    console.error("Error parsing date:", error);
    return "Unknown";
  }
};

export const getOccupancyLabel = (status: string): string => {
  switch (status.toLowerCase()) {
    case "empty":
      return "Empty";
    case "many seats available":
      return "Many Seats";
    case "few seats available":
      return "Few Seats";
    case "standing room only":
      return "Standing Room";
    case "crushed standing room only":
      return "Full";
    case "not accepting passengers":
      return "Full";
    default:
      return status;
  }
};

export const getOccupancyColor = (status: string): string => {
  switch (status.toLowerCase()) {
    case "empty":
      return "bg-green-100 text-green-800";
    case "many seats available":
      return "bg-green-100 text-green-800";
    case "few seats available":
      return "bg-yellow-100 text-yellow-800";
    case "standing room only":
      return "bg-orange-100 text-orange-800";
    case "crushed standing room only":
      return "bg-red-100 text-red-800";
    case "not accepting passengers":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};
