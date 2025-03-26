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
  const markerRef = useRef<mapboxgl.Marker | null>(null);
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
    // Create an invisible marker for click detection
    if (!markerRef.current) {
      const el = document.createElement('div');
      el.className = 'bus-marker';
      el.style.width = '30px';
      el.style.height = '30px';
      el.style.cursor = 'pointer';
      el.style.background = 'transparent';
      
      markerRef.current = new mapboxgl.Marker({
        element: el,
        anchor: 'center',
      })
        .setLngLat([bus.Longitude, bus.Latitude])
        .addTo(map);
      
      el.addEventListener('click', onClick);
    } else {
      markerRef.current.setLngLat([bus.Longitude, bus.Latitude]);
    }

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
      if (markerRef.current) {
        markerRef.current.remove();
      }
      
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
    };
  }, [bus, map]);

  const addModelLayer = () => {
    // Create a THREE.js camera and scene for the custom layer
    const camera = new THREE.Camera();
    const scene = new THREE.Scene();
    let renderer: THREE.WebGLRenderer;
    let busModel: THREE.Object3D;

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
      scale: modelAsMercatorCoordinate.meterInMercatorCoordinateUnits() * 0.05 // Increased scale factor
    };

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
        if (!busModel) {
          return;
        }

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

  return null;
};

export default Bus3DModel;
