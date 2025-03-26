import React, { useEffect, useRef } from "react";
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

    // Bus origin from API data
    const modelOrigin: [number, number] = [bus.Longitude, bus.Latitude];
    const modelAltitude = 5; // Height in meters
    
    // Only keep heading rotation
    const headingRadians = (bus.Heading || 0) * (Math.PI / 180);
    const modelRotate = [0, 0, headingRadians];

    const modelAsMercatorCoordinate = mapboxgl.MercatorCoordinate.fromLngLat(
      modelOrigin,
      0
    );

    // Transformation parameters
    const modelTransform = {
      translateX: modelAsMercatorCoordinate.x,
      translateY: modelAsMercatorCoordinate.y,
      translateZ: modelAsMercatorCoordinate.z + (modelAltitude * modelAsMercatorCoordinate.meterInMercatorCoordinateUnits()),
      rotateX: 0,
      rotateY: 0,
      rotateZ: modelRotate[2],
      scale: modelAsMercatorCoordinate.meterInMercatorCoordinateUnits() * 0.05
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
        if (!busModel) return;

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
