import React, { useEffect, useRef, useCallback, useState } from "react";
import mapboxgl from "mapbox-gl";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { BusData } from "@/services/busApi";

interface Bus3DModelProps {
  bus: BusData;
  map: mapboxgl.Map;
  onClick: () => void;
}

// Set to true for development, can be made configurable later
const DEBUG_MODE = false;

const Bus3DModel: React.FC<Bus3DModelProps> = ({ bus, map, onClick }) => {
  const modelRef = useRef<any>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const layerId = useRef<string>(`bus-model-${bus.VehicleId}`);
  const debugObjectsRef = useRef<{
    axes: THREE.Line[];
    boundingBox: THREE.LineSegments | null;
    scene: THREE.Scene | null;
  }>({
    axes: [],
    boundingBox: null,
    scene: null
  });
  const [debugStats, setDebugStats] = useState({
    zoom: 0,
    scale: 0,
    scaleFactor: 0,
    zoomFactor: 0,
    elevation: 0,
    modelX: 0,
    modelY: 0,
    modelZ: 0,
    heading: 0,
  });
  const [showBoundingBox, setShowBoundingBox] = useState(true);
  const [showAxis, setShowAxis] = useState(true);
  const [showMarker, setShowMarker] = useState(true);
  
  // Calculate scale based on zoom level
  const calculateScale = useCallback((zoom: number) => {
    const baseScale = 10;
    const baseZoom = 12;
    const zoomSpeed = 3;
    const [minScale, maxScale] = [0.05, 0.35];
    
    // Inverse exponential scaling factor (bigger at low zoom, smaller at high zoom)
    const scaleFactor = Math.pow(zoomSpeed, baseZoom - zoom);
    
    // Clamp the scale between reasonable values
    const scale = Math.min(Math.max(baseScale * scaleFactor, minScale), maxScale);
    
    setDebugStats(prev => ({
      ...prev,
      zoom,
      scale,
      scaleFactor,
    }));
    
    return scale;
  }, []);

  // Update model transform
  const getModelTransform = useCallback((zoom: number) => {
    const modelOrigin: [number, number] = [bus.Longitude, bus.Latitude];
    // 25 to correct the model rotation offset
    const modelRotate = [0, 0, ((bus.Heading + 25) * Math.PI) / 180];

    // Add elevation adjustment based on zoom level
    const baseElevation = 0;
    const zoomFactor = Math.max(0, 14 - zoom); // Start increasing elevation below zoom level 14
    const elevationAdjustment = zoomFactor * 200; // Reduced from 500 to 150 for more gradual elevation change

    const modelAsMercatorCoordinate = mapboxgl.MercatorCoordinate.fromLngLat(
      modelOrigin,
      baseElevation + elevationAdjustment
    );

    // Update debug stats
    setDebugStats(prev => ({
      ...prev,
      zoomFactor,
      elevation: baseElevation + elevationAdjustment,
      modelX: modelAsMercatorCoordinate.x,
      modelY: modelAsMercatorCoordinate.y,
      modelZ: modelAsMercatorCoordinate.z,
      heading: bus.Heading,
    }));

    return {
      translateX: modelAsMercatorCoordinate.x,
      translateY: modelAsMercatorCoordinate.y,
      translateZ: modelAsMercatorCoordinate.z,
      rotateX: modelRotate[0],
      rotateY: modelRotate[1],
      rotateZ: modelRotate[2],
      scale: modelAsMercatorCoordinate.meterInMercatorCoordinateUnits() * calculateScale(zoom)
    };
  }, [bus.Longitude, bus.Latitude, bus.Heading, calculateScale]);

  // Update or create marker
  const updateMarker = () => {
    if (!markerRef.current) {
      // Create marker element
      const el = document.createElement('div');
      el.className = 'bus-marker';
      el.style.width = '100px';
      el.style.height = '100px';
      el.style.cursor = 'pointer';
      el.style.background = DEBUG_MODE ? 'rgba(255, 0, 0, 0.2)' : 'transparent';
      el.style.borderRadius = '50%';
      el.style.transform = 'translate(-50%, -50%)';
      el.style.display = showMarker ? 'block' : 'none';
      
      // Create and add marker
      markerRef.current = new mapboxgl.Marker({
        element: el,
        anchor: 'center',
      })
        .setLngLat([bus.Longitude, bus.Latitude])
        .addTo(map);
      
      // Add click handler
      el.addEventListener('click', onClick);
    } else {
      // Update marker position and visibility
      markerRef.current.setLngLat([bus.Longitude, bus.Latitude]);
      const el = markerRef.current.getElement();
      el.style.display = showMarker ? 'block' : 'none';
    }
  };

  const cleanupDebugObjects = () => {
    // Remove and dispose of existing debug objects
    debugObjectsRef.current.axes.forEach(axis => {
      if (axis.geometry) axis.geometry.dispose();
      if (axis.material) {
        if (Array.isArray(axis.material)) {
          axis.material.forEach(m => m.dispose());
        } else {
          axis.material.dispose();
        }
      }
      debugObjectsRef.current.scene?.remove(axis);
    });
    
    if (debugObjectsRef.current.boundingBox) {
      if (debugObjectsRef.current.boundingBox.geometry) {
        debugObjectsRef.current.boundingBox.geometry.dispose();
      }
      if (debugObjectsRef.current.boundingBox.material) {
        if (Array.isArray(debugObjectsRef.current.boundingBox.material)) {
          debugObjectsRef.current.boundingBox.material.forEach(m => m.dispose());
        } else {
          debugObjectsRef.current.boundingBox.material.dispose();
        }
      }
      debugObjectsRef.current.scene?.remove(debugObjectsRef.current.boundingBox);
    }
    
    debugObjectsRef.current.axes = [];
    debugObjectsRef.current.boundingBox = null;
  };

  const createDebugObjects = (scene: THREE.Scene) => {
    debugObjectsRef.current.scene = scene;
    
    // Clean up existing debug objects if they exist
    cleanupDebugObjects();
    
    // Create axes
    const axes = [
      { color: 0xff0000, start: [0, 0, 0], end: [2000, 0, 0] }, // X axis - red
      { color: 0x00ff00, start: [0, 0, 0], end: [0, 2000, 0] }, // Y axis - green
      { color: 0x0000ff, start: [0, 0, 0], end: [0, 0, 2000] }  // Z axis - blue
    ];

    debugObjectsRef.current.axes = axes.map(axis => {
      const material = new THREE.LineBasicMaterial({ 
        color: axis.color,
        linewidth: 3
      });
      const points = [
        new THREE.Vector3(...axis.start),
        new THREE.Vector3(...axis.end)
      ];
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, material);
      line.visible = showAxis;
      scene.add(line);
      return line;
    });

    // Create bounding box
    const boxSize = 2000;
    const boxGeometry = new THREE.BoxGeometry(boxSize, boxSize, boxSize);
    const edges = new THREE.EdgesGeometry(boxGeometry);
    const boxMaterial = new THREE.LineBasicMaterial({ 
      color: 0xffffff,
      linewidth: 2,
      transparent: true,
      opacity: 0.5
    });
    const boundingBox = new THREE.LineSegments(edges, boxMaterial);
    boundingBox.position.set(boxSize/2, boxSize/2, boxSize/2);
    boundingBox.visible = showBoundingBox;
    scene.add(boundingBox);
    debugObjectsRef.current.boundingBox = boundingBox;
  };

  const updateDebugVisibility = useCallback(() => {
    debugObjectsRef.current.axes.forEach(axis => {
      axis.visible = showAxis;
    });

    if (debugObjectsRef.current.boundingBox) {
      debugObjectsRef.current.boundingBox.visible = showBoundingBox;
    }

    // Trigger a repaint
    if (map) {
      map.triggerRepaint();
    }
  }, [showAxis, showBoundingBox, map]);

  // Update debug visibility when visibility states change
  useEffect(() => {
    updateDebugVisibility();
  }, [showAxis, showBoundingBox, updateDebugVisibility]);

  // Initialize layer only once
  useEffect(() => {
    if (!map.getLayer(layerId.current)) {
      addModelLayer();
    }

    // Only clean up when component unmounts
    return () => {
      if (map.getLayer(layerId.current)) {
        map.removeLayer(layerId.current);
      }
      
      if (modelRef.current?.busModel) {
        console.log('Cleaning up model resources');
        modelRef.current.scene.remove(modelRef.current.busModel);
        modelRef.current.busModel.traverse((child: THREE.Object3D) => {
          if (child instanceof THREE.Mesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach(material => material.dispose());
              } else {
                child.material.dispose();
              }
            }
          }
        });
      }
      
      // Clean up debug objects
      cleanupDebugObjects();
    };
  }, [map]); // Only depend on map

  // Handle marker updates
  useEffect(() => {
    updateMarker();
    return () => {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
    };
  }, [bus.Longitude, bus.Latitude, showMarker]);

  const addModelLayer = () => {
    // Create a THREE.js camera and scene for the custom layer
    const camera = new THREE.Camera();
    const scene = new THREE.Scene();
    let renderer: THREE.WebGLRenderer;
    let busModel: THREE.Object3D;

    // Store scene reference for cleanup
    modelRef.current = { scene, busModel };

    const customLayer = {
      id: layerId.current,
      type: 'custom' as const,
      renderingMode: '3d' as const,
      onAdd: function(map: mapboxgl.Map, gl: WebGLRenderingContext) {
        this.camera = camera;
        this.scene = scene;

        // Add lights
        const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
        directionalLight.position.set(0, -70, 100).normalize();
        this.scene.add(directionalLight);

        const directionalLight2 = new THREE.DirectionalLight(0xffffff, 2);
        directionalLight2.position.set(0, 70, 100).normalize();
        this.scene.add(directionalLight2);

        const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
        this.scene.add(ambientLight);

        // Add debug objects if in debug mode
        if (DEBUG_MODE) {
          createDebugObjects(this.scene);
        }

        // Load the bus GLB model
        const loader = new GLTFLoader();
        loader.load(
          '/Bus.glb',
          (gltf) => {
            busModel = gltf.scene;
            modelRef.current.busModel = busModel;
            
            busModel.rotation.x = Math.PI / 2;
            busModel.rotation.y = Math.PI;
            
            const box = new THREE.Box3().setFromObject(busModel);
            const center = box.getCenter(new THREE.Vector3());
            
            // Center the model on all axes
            busModel.position.set(
              -center.x,
              -center.y,
              -center.z
            );
            
            busModel.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                const newMaterial = new THREE.MeshPhongMaterial({
                  color: child.material.color || 0xFFFF00,
                  side: THREE.DoubleSide,
                  shadowSide: THREE.BackSide,
                  depthWrite: true,
                  depthTest: true,
                  transparent: false,
                  opacity: 1.0,
                });

                if (child.material.map) {
                  newMaterial.map = child.material.map;
                }
                
                child.material = newMaterial;
                child.renderOrder = 1000;
              }
            });

            busModel.updateMatrixWorld(true);
            this.scene.add(busModel);
          },
          undefined,
          (error) => {
            console.error('Error loading bus model:', error);
          }
        );

        // Configure renderer
        renderer = new THREE.WebGLRenderer({
          canvas: map.getCanvas(),
          context: gl,
          antialias: true,
          alpha: true,
          logarithmicDepthBuffer: true
        });
        
        renderer.autoClear = false;
        renderer.setClearColor(0x000000, 0);
        
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.clearDepth(1.0);
      },
      render: function(gl: WebGLRenderingContext, matrix: number[]) {
        if (!busModel) return;

        // Get current transform with updated zoom
        const currentTransform = getModelTransform(map.getZoom());

        const rotationZ = new THREE.Matrix4().makeRotationAxis(
          new THREE.Vector3(0, 0, 1),
          currentTransform.rotateZ
        );

        const m = new THREE.Matrix4().fromArray(matrix);
        const l = new THREE.Matrix4()
          .makeTranslation(
            currentTransform.translateX,
            currentTransform.translateY,
            currentTransform.translateZ
          )
          .scale(
            new THREE.Vector3(
              currentTransform.scale,
              currentTransform.scale,
              currentTransform.scale
            )
          )
          .multiply(rotationZ);

        this.camera.projectionMatrix = m.multiply(l);
        renderer.resetState();
        renderer.render(this.scene, this.camera);
        map.triggerRepaint();
      }
    };

    // Add the custom layer to the map
    console.log('Adding layer to map:', layerId.current);
    map.addLayer(customLayer, 'bus-model-layer-group');
  };

  return (
    <>
      {DEBUG_MODE && (
        <div style={{
          position: 'fixed',
          top: '10px',
          right: '10px',
          background: 'rgba(0,0,0,0.8)',
          color: 'white',
          padding: '10px',
          borderRadius: '5px',
          fontFamily: 'monospace',
          fontSize: '12px',
          zIndex: 1000,
        }}>
          <div>Zoom Level: {debugStats.zoom.toFixed(2)}</div>
          <div>Scale: {debugStats.scale.toFixed(4)}</div>
          <div>Scale Factor: {debugStats.scaleFactor.toFixed(4)}</div>
          <div>Zoom Factor: {debugStats.zoomFactor.toFixed(4)}</div>
          <div>Elevation: {debugStats.elevation.toFixed(2)}m</div>
          <div>Model Position:</div>
          <div>X: {debugStats.modelX.toFixed(6)}</div>
          <div>Y: {debugStats.modelY.toFixed(6)}</div>
          <div>Z: {debugStats.modelZ.toFixed(6)}</div>
          <div>Heading: {debugStats.heading.toFixed(2)}°</div>
          <div className="mt-2 border-t border-white/20 pt-2">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showBoundingBox}
                onChange={(e) => setShowBoundingBox(e.target.checked)}
                className="accent-blue-500"
              />
              <span>Show Bounding Box</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer mt-1">
              <input
                type="checkbox"
                checked={showAxis}
                onChange={(e) => setShowAxis(e.target.checked)}
                className="accent-blue-500"
              />
              <span>Show Axis</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer mt-1">
              <input
                type="checkbox"
                checked={showMarker}
                onChange={(e) => setShowMarker(e.target.checked)}
                className="accent-blue-500"
              />
              <span>Show Marker</span>
            </label>
          </div>
        </div>
      )}
    </>
  );
};

export default Bus3DModel;
