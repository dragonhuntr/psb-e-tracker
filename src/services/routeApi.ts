import { toast } from "sonner";

export interface RouteCoordinate {
  longitude: number;
  latitude: number;
  altitude: number;
}

export interface RoutePath {
  name: string;
  coordinates: RouteCoordinate[];
}

export interface RouteData {
  name: string;
  paths: RoutePath[];
}

// Function to fetch and parse KML route data
export const fetchRouteData = async (): Promise<RouteData> => {
  try {
    const response = await fetch(
      import.meta.env.VITE_ROUTE_API_URL
    );
    
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }
    
    const kmlText = await response.text();
    return parseKmlToRouteData(kmlText);
  } catch (error) {
    console.error("Error fetching route data:", error);
    toast.error("Could not retrieve route data");
    return { name: "Error", paths: [] };
  }
};

// Function to parse KML text to RouteData
export const parseKmlToRouteData = (kmlText: string): RouteData => {
  try {
    const parser = new DOMParser();
    const kmlDoc = parser.parseFromString(kmlText, "text/xml");
    
    // Get document name
    const docNameElement = kmlDoc.querySelector("Document > name");
    const docName = docNameElement ? docNameElement.textContent || "Unknown Route" : "Unknown Route";
    
    // Get all placemarks (line segments)
    const placemarks = kmlDoc.querySelectorAll("Placemark");
    const paths: RoutePath[] = [];
    
    placemarks.forEach((placemark) => {
      const nameElement = placemark.querySelector("name");
      const name = nameElement ? nameElement.textContent || "Unknown Path" : "Unknown Path";
      
      const coordinatesElement = placemark.querySelector("LineString > coordinates");
      if (!coordinatesElement || !coordinatesElement.textContent) return;
      
      const coordinatesText = coordinatesElement.textContent.trim();
      const coordinates: RouteCoordinate[] = coordinatesText
        .split(" ")
        .filter(coord => coord.trim().length > 0)
        .map(coordString => {
          const [longitude, latitude, altitude] = coordString.split(",").map(Number);
          return { longitude, latitude, altitude };
        });
      
      paths.push({
        name,
        coordinates
      });
    });
    
    return {
      name: docName,
      paths
    };
  } catch (error) {
    console.error("Error parsing KML data:", error);
    return { name: "Error", paths: [] };
  }
};
