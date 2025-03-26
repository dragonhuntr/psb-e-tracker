import React, { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { BusData } from "@/services/busApi";

interface Bus3DModelProps {
  bus: BusData;
  map: mapboxgl.Map;
  onClick: () => void;
}

const Bus3DModel: React.FC<Bus3DModelProps> = ({ bus, map, onClick }) => {
  const modelRef = useRef<any>(null);
  const layerId = useRef<string>(`bus-model-${bus.VehicleId}`);
  const [altitude, setAltitude] = useState(5); // Start at 5 meters
  const [scale, setScale] = useState(5);

  const focusOnBus = () => {
    map.flyTo({
      center: [bus.Longitude, bus.Latitude],
      zoom: 18,  // Close zoom level to see the model clearly
      pitch: 60, // Tilt the map to see the 3D model better
      bearing: bus.Heading || 0  // Align map with bus direction
    });
  };

  useEffect(() => {
    // Initial add of the custom layer
    if (!map.getLayer(layerId.current)) {
      addModelLayer();
    } else {
      // Update position of existing model
      updateModelPosition();
    }

    return () => {
      // Clean up when component unmounts
      if (map.getLayer(layerId.current)) {
        map.removeLayer(layerId.current);
      }
    };
  }, [bus, map]); // Dependencies to ensure updates when bus data changes

  const addModelLayer = () => {
    // Create a THREE.js camera and scene for the custom layer
    const camera = new THREE.Camera();
    const scene = new THREE.Scene();
    let renderer: THREE.WebGLRenderer;
    let busModel: THREE.Object3D;
    let clickHandler: (e: mapboxgl.MapMouseEvent) => void;

    // Store scene reference for cleanup
    modelRef.current = { scene, busModel };

    // Bus origin from API data - ensure it's the correct format [lng, lat]
    const modelOrigin: [number, number] = [bus.Longitude, bus.Latitude];
    const modelAltitude = altitude; // Use the state variable
    
    // Only keep heading rotation, remove other rotations
    const headingRadians = (bus.Heading || 0) * (Math.PI / 180);
    const modelRotate = [0, 0, headingRadians]; // Remove pitch and roll rotations

    const modelAsMercatorCoordinate = mapboxgl.MercatorCoordinate.fromLngLat(
      modelOrigin,
      0 // Set base altitude to 0
    );

    // Transformation parameters - remove rotateX and rotateY
    const modelTransform = {
      translateX: modelAsMercatorCoordinate.x,
      translateY: modelAsMercatorCoordinate.y,
      translateZ: modelAsMercatorCoordinate.z + (modelAltitude * modelAsMercatorCoordinate.meterInMercatorCoordinateUnits()),
      rotateX: 0, // No X rotation
      rotateY: 0, // No Y rotation
      rotateZ: modelRotate[2], // Only keep heading rotation
      scale: modelAsMercatorCoordinate.meterInMercatorCoordinateUnits() * 2 * 0.05 // Increased scale factor
    };

    const customLayer = {
      id: layerId.current,
      type: 'custom' as const,
      renderingMode: '3d' as const,
      onAdd: function(map: mapboxgl.Map, gl: WebGLRenderingContext) {
        console.log('Layer onAdd called:', layerId.current);
        this.camera = camera;
        this.scene = scene;

        // Create a helper grid for debugging (remove in production)
        const gridHelper = new THREE.GridHelper(100, 10);
        this.scene.add(gridHelper);

        // Add lights with more intensity
        const directionalLight = new THREE.DirectionalLight(0xffffff, 2); // Increased intensity
        directionalLight.position.set(0, -70, 100).normalize();
        this.scene.add(directionalLight);

        const directionalLight2 = new THREE.DirectionalLight(0xffffff, 2);
        directionalLight2.position.set(0, 70, 100).normalize();
        this.scene.add(directionalLight2);

        const ambientLight = new THREE.AmbientLight(0xffffff, 1.0); // Increased ambient light
        this.scene.add(ambientLight);

        // Load the bus GLB model with enhanced error handling
        const loader = new GLTFLoader();
        console.log('Starting to load model from:', '/Bus.glb');
        loader.load(
          '/Bus.glb',
          (gltf) => {
            busModel = gltf.scene;
            modelRef.current.busModel = busModel;
            
            // Add initial rotation to correct model orientation
            busModel.rotation.x = Math.PI / 2;
            
            // Calculate bounding box before any transformations
            const box = new THREE.Box3().setFromObject(busModel);
            const center = box.getCenter(new THREE.Vector3());
            
            // Center the model on the grid (0,0,0)
            busModel.position.set(
              -center.x,  // Center X axis
              -box.min.y, // Place bottom on grid
              -center.z   // Center Z axis
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
                
                // Log each mesh
                console.log('Mesh found:', {
                  geometry: child.geometry,
                  material: child.material,
                  position: child.position.toArray()
                });
              }
            });

            // Calculate bounding box
            const boxAfter = new THREE.Box3().setFromObject(busModel);
            console.log('Bounding box:', {
              min: boxAfter.min.toArray(),
              max: boxAfter.max.toArray(),
              size: boxAfter.getSize(new THREE.Vector3()).toArray()
            });

            busModel.updateMatrixWorld(true);
            
            // Final position check
            console.log('Final model position:', {
              position: busModel.position.toArray(),
              scale: busModel.scale.toArray(),
              rotation: busModel.rotation.toArray()
            });
            
            this.scene.add(busModel);
          },
          (progress) => {
            const percent = Math.round(progress.loaded / progress.total * 100);
            console.log(`Loading model: ${percent}%`);
          },
          (error) => {
            console.error('Error loading bus model:', error);
            // Add a fallback cube for debugging
            const geometry = new THREE.BoxGeometry(5, 5, 5);
            const material = new THREE.MeshPhongMaterial({ color: 0xff0000 });
            const cube = new THREE.Mesh(geometry, material);
            this.scene.add(cube);
          }
        );

        // Configure renderer with proper settings
        renderer = new THREE.WebGLRenderer({
          canvas: map.getCanvas(),
          context: gl,
          antialias: true,
          alpha: true,
          logarithmicDepthBuffer: true // Add this to help with depth issues
        });
        
        renderer.autoClear = false;
        renderer.setClearColor(0x000000, 0);
        
        // Update WebGL context settings
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.clearDepth(1.0);

        // Add click handler for the bus
        clickHandler = (e: mapboxgl.MapMouseEvent) => {
          const features = map.queryRenderedFeatures(e.point, { layers: [layerId.current] });
          if (features.length > 0) {
            onClick();
          }
        };
        
        map.on('click', clickHandler);
      },
      render: function(gl: WebGLRenderingContext, matrix: number[]) {
        if (!busModel) {
          return;
        }

        // Log position and transformation more frequently during development
        if (Math.random() < 0.05) { // Increased logging frequency to 5%
          const worldPosition = new THREE.Vector3();
          busModel.getWorldPosition(worldPosition);
          console.log('Model world position:', {
            x: worldPosition.x,
            y: worldPosition.y,
            z: worldPosition.z,
            heading: bus.Heading,
            modelTransform
          });
        }

        // Create rotation matrices
        const rotationZ = new THREE.Matrix4().makeRotationAxis(
          new THREE.Vector3(0, 0, 1),
          modelTransform.rotateZ
        );

        const m = new THREE.Matrix4().fromArray(matrix);
        const l = new THREE.Matrix4()
          .makeTranslation(
            modelTransform.translateX,
            modelTransform.translateY,
            modelTransform.translateZ
          )
          .scale(
            new THREE.Vector3(
              modelTransform.scale,
              modelTransform.scale,
              modelTransform.scale
            )
          )
          .multiply(rotationZ);

        this.camera.projectionMatrix = m.multiply(l);
        renderer.resetState();
        renderer.render(this.scene, this.camera);
        
        // Request a new frame to maintain smooth animation
        map.triggerRepaint();
      },
      onRemove: function(map: mapboxgl.Map) {
        console.log('Layer being removed:', layerId.current);
        map.off('click', clickHandler);
        
        if (modelRef.current.busModel) {
          console.log('Cleaning up model resources');
          modelRef.current.scene.remove(modelRef.current.busModel);
          modelRef.current.busModel.traverse((child) => {
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
        
        if (renderer) {
          renderer.dispose();
        }
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
    <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 1000 }}>
      <div style={{ 
        backgroundColor: 'white', 
        padding: '10px', 
        borderRadius: '4px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
        marginBottom: '10px'
      }}>
        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>
            Altitude (meters): {altitude}
          </label>
          <input 
            type="range" 
            min="0" 
            max="20" // Reduced from 50 to 20 meters
            value={altitude} 
            onChange={(e) => {
              setAltitude(Number(e.target.value));
              updateModelPosition();
            }}
          />
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>
            Scale: {scale}
          </label>
          <input 
            type="range" 
            min="0.1" 
            max="2" 
            step="0.1"
            value={scale} 
            onChange={(e) => {
              setScale(Number(e.target.value));
              updateModelPosition();
            }}
          />
        </div>
        <button 
          onClick={focusOnBus}
          style={{
            padding: '8px 16px',
            backgroundColor: '#fff',
            border: '1px solid #ccc',
            borderRadius: '4px',
            cursor: 'pointer',
            width: '100%'
          }}
        >
          Focus on Bus
        </button>
      </div>
    </div>
  );
};

export default Bus3DModel;
