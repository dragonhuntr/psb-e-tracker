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

interface DebugStatsProps {
  stats: {
    zoom: number;
    scale: number;
    scaleFactor: number;
    zoomFactor: number;
    elevation: number;
    modelX: number;
    modelY: number;
    modelZ: number;
    heading: number;
  };
}

const DebugStats: React.FC<DebugStatsProps> = ({ stats }) => {
  return (
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
      <div>Zoom Level: {stats.zoom.toFixed(2)}</div>
      <div>Scale: {stats.scale.toFixed(4)}</div>
      <div>Scale Factor: {stats.scaleFactor.toFixed(4)}</div>
      <div>Zoom Factor: {stats.zoomFactor.toFixed(4)}</div>
      <div>Elevation: {stats.elevation.toFixed(2)}m</div>
      <div>Model Position:</div>
      <div>X: {stats.modelX.toFixed(6)}</div>
      <div>Y: {stats.modelY.toFixed(6)}</div>
      <div>Z: {stats.modelZ.toFixed(6)}</div>
      <div>Heading: {stats.heading.toFixed(2)}°</div>
    </div>
  );
};

const Bus3DModel: React.FC<Bus3DModelProps> = ({ bus, map, onClick }) => {
  const modelRef = useRef<any>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const layerId = useRef<string>(`bus-model-${bus.VehicleId}`);
  const [debugStats, setDebugStats] = useState<DebugStatsProps['stats']>({
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
      el.style.width = '30px';
      el.style.height = '30px';
      el.style.cursor = 'pointer';
      el.style.background = 'transparent';
      
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
      // Update marker position
      markerRef.current.setLngLat([bus.Longitude, bus.Latitude]);
    }
  };

  useEffect(() => {
    // Update marker position and click handler
    updateMarker();
    
    // Initial add of the custom layer
    if (!map.getLayer(layerId.current)) {
      addModelLayer();
    } else {
      // Update position of existing model
      updateModelPosition();
    }

    return () => {
      // Clean up when component unmounts or updates
      if (map.getLayer(layerId.current)) {
        map.removeLayer(layerId.current);
      }
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null; // Reset the ref so a new marker can be created
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
    };
  }, [bus, map, onClick]); // Added onClick to dependencies

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

        // Load the bus GLB model
        const loader = new GLTFLoader();
        loader.load(
          '/Bus.glb',
          (gltf) => {
            busModel = gltf.scene;
            modelRef.current.busModel = busModel;
            
            busModel.rotation.x = Math.PI / 2;
            
            const box = new THREE.Box3().setFromObject(busModel);
            const center = box.getCenter(new THREE.Vector3());
            
            busModel.position.set(
              -center.x,
              -box.min.y,
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
    map.addLayer(customLayer);
  };

  const updateModelPosition = () => {
    if (map.getLayer(layerId.current)) {
      map.removeLayer(layerId.current);
    }
    // Small timeout to ensure proper cleanup before adding new layer
    setTimeout(() => {
      addModelLayer();
    }, 0);
  };

  return (
    <>
      <DebugStats stats={debugStats} />
    </>
  );
};

export default Bus3DModel;
