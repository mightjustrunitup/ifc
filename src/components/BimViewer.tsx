import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import * as OBC from "@thatopen/components";
import * as THREE from "three";
import Stats from "stats.js";
import { toast } from "sonner";

export interface BimViewerRef {
  createGeometry: (toolCall: any) => void;
  loadIfcFile: (file: File) => void;
}

export const BimViewer = forwardRef<BimViewerRef>((props, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [components, setComponents] = useState<OBC.Components | null>(null);
  const [world, setWorld] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const statsRef = useRef<Stats | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize components
    const comp = new OBC.Components();
    const worlds = comp.get(OBC.Worlds);
    const world = worlds.create<
      OBC.SimpleScene,
      OBC.OrthoPerspectiveCamera,
      OBC.SimpleRenderer
    >();

    world.scene = new OBC.SimpleScene(comp);
    world.scene.setup();
    world.scene.three.background = new THREE.Color(0x2c2c2c);

    // Enhanced lighting setup for better material visibility
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    world.scene.three.add(ambientLight);

    // Main directional light (sun-like)
    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight1.position.set(20, 30, 15);
    directionalLight1.castShadow = true;
    world.scene.three.add(directionalLight1);

    // Fill light from opposite side
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight2.position.set(-15, 20, -10);
    world.scene.three.add(directionalLight2);

    // Rim light from above
    const directionalLight3 = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight3.position.set(0, 50, 0);
    world.scene.three.add(directionalLight3);

    // Hemisphere light for natural sky/ground color
    const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x444444, 0.3);
    world.scene.three.add(hemiLight);

    world.renderer = new OBC.SimpleRenderer(comp, containerRef.current);
    
    // Enhanced renderer settings for better material quality
    const renderer = world.renderer.three;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    
    world.camera = new OBC.OrthoPerspectiveCamera(comp);
    world.camera.controls.setLookAt(78, 20, -2.2, 26, -4, 25);

    comp.init();
    comp.get(OBC.Grids).create(world);

    // Setup IFC Loader
    const setupLoader = async () => {
      const ifcLoader = comp.get(OBC.IfcLoader);
      await ifcLoader.setup({
        autoSetWasm: false,
        wasm: {
          path: "https://unpkg.com/web-ifc@0.0.72/",
          absolute: true,
        },
      });

      // Setup Fragments Manager
      const workerUrl = "/worker.mjs";
      const fragments = comp.get(OBC.FragmentsManager);
      fragments.init(workerUrl);

      world.camera.controls.addEventListener("rest", () =>
        fragments.core.update(true)
      );

      fragments.list.onItemSet.add(({ value: model }) => {
        console.log('Model loaded:', model);
        model.useCamera(world.camera.three);
        world.scene.three.add(model.object);
        console.log('Model added to scene:', model.object);
        
        // Give more time for geometry to be processed and force updates
        setTimeout(() => {
          // Force multiple updates to ensure geometry is computed
          fragments.core.update(true);
          world.scene.three.updateMatrixWorld(true);
          model.object.updateMatrixWorld(true);
          
          // Wait a bit more then calculate bounding box
          setTimeout(() => {
            // Calculate bounding box from all scene objects
            const box = new THREE.Box3();
            
            // Traverse all objects in the model
            model.object.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                child.geometry.computeBoundingBox();
                if (child.geometry.boundingBox) {
                  const childBox = child.geometry.boundingBox.clone();
                  childBox.applyMatrix4(child.matrixWorld);
                  box.union(childBox);
                }
              }
            });
            
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            
            console.log('Model bounding box - Center:', center, 'Size:', size);
            console.log('Model object children count:', model.object.children.length);
            
            // Calculate the maximum dimension to determine camera distance
            const maxDim = Math.max(size.x, size.y, size.z);
            
            console.log('Camera positioning - maxDim:', maxDim);
            
            // Position camera based on model size
            if (maxDim > 0.1) {
              const fov = world.camera.three.fov * (Math.PI / 180);
              let cameraDistance = Math.abs(maxDim / Math.tan(fov / 2));
              cameraDistance *= 2; // Add padding
              
              // Position camera at an angle to see the model better
              const offset = cameraDistance * 0.7;
              world.camera.controls.setLookAt(
                center.x + offset,
                center.y + offset,
                center.z + offset,
                center.x,
                center.y,
                center.z
              );
              
              console.log('Camera positioned at distance:', cameraDistance);
            } else {
              // Fallback: position camera close to origin
              console.warn('Model has invalid bounding box, using default camera position');
              world.camera.controls.setLookAt(
                10, 10, 10,
                0, 0, 0
              );
            }
            
            // Force final render update
            fragments.core.update(true);
            toast.success("Model loaded successfully!");
          }, 200);
        }, 100);
      });
    };

    setupLoader();
    setComponents(comp);
    setWorld(world);

    // Setup stats
    const stats = new Stats();
    stats.showPanel(2);
    stats.dom.style.position = "absolute";
    stats.dom.style.left = "8px";
    stats.dom.style.top = "8px";
    stats.dom.style.zIndex = "100";
    containerRef.current.appendChild(stats.dom);
    statsRef.current = stats;

    world.renderer.onBeforeUpdate.add(() => stats.begin());
    world.renderer.onAfterUpdate.add(() => stats.end());

    return () => {
      comp.dispose();
      if (statsRef.current) {
        statsRef.current.dom.remove();
      }
    };
  }, []);

  useImperativeHandle(ref, () => ({
    loadIfcFile: async (file: File) => {
      await handleFileUpload(file);
    },
    createGeometry: (toolCall: any) => {
      if (!world || !components) {
        toast.error("Viewer not ready yet");
        return;
      }

      try {
        const { name: functionName, arguments: args } = toolCall.function;
        const params = JSON.parse(args);
        
        let geometry: THREE.BufferGeometry;
        let material: THREE.MeshStandardMaterial;
        let mesh: THREE.Mesh;

        const color = params.color || '#808080';
        material = new THREE.MeshStandardMaterial({ color });

        switch (functionName) {
          case 'create_box':
            geometry = new THREE.BoxGeometry(params.width, params.height, params.depth);
            mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(params.x || 0, params.y || 0, params.z || 0);
            mesh.name = params.name;
            world.scene.three.add(mesh);
            toast.success(`Created box: ${params.name}`);
            break;

          case 'create_sphere':
            geometry = new THREE.SphereGeometry(params.radius, 32, 32);
            mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(params.x || 0, params.y || 0, params.z || 0);
            mesh.name = params.name;
            world.scene.three.add(mesh);
            toast.success(`Created sphere: ${params.name}`);
            break;

          case 'create_cylinder':
            geometry = new THREE.CylinderGeometry(params.radius, params.radius, params.height, 32);
            mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(params.x || 0, params.y || 0, params.z || 0);
            mesh.name = params.name;
            world.scene.three.add(mesh);
            toast.success(`Created cylinder: ${params.name}`);
            break;

          case 'create_cone':
            geometry = new THREE.ConeGeometry(params.radius, params.height, 32);
            mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(params.x || 0, params.y || 0, params.z || 0);
            mesh.name = params.name;
            world.scene.three.add(mesh);
            toast.success(`Created cone: ${params.name}`);
            break;

          case 'create_torus':
            geometry = new THREE.TorusGeometry(params.radius, params.tube, 16, 100);
            mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(params.x || 0, params.y || 0, params.z || 0);
            mesh.name = params.name;
            world.scene.three.add(mesh);
            toast.success(`Created torus: ${params.name}`);
            break;

          case 'create_plane':
            geometry = new THREE.PlaneGeometry(params.width, params.height);
            mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(params.x || 0, params.y || 0, params.z || 0);
            mesh.rotation.x = -Math.PI / 2;
            mesh.name = params.name;
            world.scene.three.add(mesh);
            toast.success(`Created plane: ${params.name}`);
            break;

          case 'create_wall': {
            const wallThickness = params.thickness || 0.2;
            const wallGeometry = new THREE.BoxGeometry(params.length, params.height, wallThickness);
            const wallMaterial = new THREE.MeshStandardMaterial({ color: params.color || '#e8e8e8' });
            const wall = new THREE.Mesh(wallGeometry, wallMaterial);
            wall.position.set(
              params.x + params.length / 2,
              params.y + params.height / 2,
              params.z
            );
            if (params.rotationY) {
              wall.rotation.y = (params.rotationY * Math.PI) / 180;
            }
            wall.name = params.name;
            world.scene.three.add(wall);
            toast.success(`Created wall: ${params.name}`);
            break;
          }

          case 'create_door': {
            const doorGroup = new THREE.Group();
            doorGroup.name = params.name;
            
            const doorGeometry = new THREE.BoxGeometry(params.width, params.height, params.thickness);
            const doorMaterial = new THREE.MeshStandardMaterial({ color: params.color || '#8b4513' });
            const door = new THREE.Mesh(doorGeometry, doorMaterial);
            door.position.set(0, params.height / 2, 0);
            
            const frameThickness = 0.05;
            const frameMaterial = new THREE.MeshStandardMaterial({ color: '#654321' });
            
            const topFrame = new THREE.Mesh(
              new THREE.BoxGeometry(params.width + frameThickness * 2, frameThickness, params.thickness + frameThickness),
              frameMaterial
            );
            topFrame.position.set(0, params.height + frameThickness / 2, 0);
            
            doorGroup.add(door, topFrame);
            doorGroup.position.set(params.x, params.y, params.z);
            if (params.rotationY) {
              doorGroup.rotation.y = (params.rotationY * Math.PI) / 180;
            }
            world.scene.three.add(doorGroup);
            toast.success(`Created door: ${params.name}`);
            break;
          }

          case 'create_window': {
            const windowGroup = new THREE.Group();
            windowGroup.name = params.name;
            
            const frameThickness = 0.05;
            const frameMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff' });
            const glassMaterial = new THREE.MeshStandardMaterial({ 
              color: '#87ceeb',
              transparent: true,
              opacity: 0.3
            });
            
            const glass = new THREE.Mesh(
              new THREE.BoxGeometry(params.width, params.height, 0.01),
              glassMaterial
            );
            
            const topFrame = new THREE.Mesh(
              new THREE.BoxGeometry(params.width + frameThickness * 2, frameThickness, frameThickness),
              frameMaterial
            );
            topFrame.position.set(0, params.height / 2, 0);
            
            const bottomFrame = new THREE.Mesh(
              new THREE.BoxGeometry(params.width + frameThickness * 2, frameThickness, frameThickness),
              frameMaterial
            );
            bottomFrame.position.set(0, -params.height / 2, 0);
            
            windowGroup.add(glass, topFrame, bottomFrame);
            windowGroup.position.set(params.x, params.y + params.height / 2, params.z);
            if (params.rotationY) {
              windowGroup.rotation.y = (params.rotationY * Math.PI) / 180;
            }
            world.scene.three.add(windowGroup);
            toast.success(`Created window: ${params.name}`);
            break;
          }

          case 'create_column': {
            const columnGeometry = new THREE.BoxGeometry(params.width, params.height, params.depth);
            const columnMaterial = new THREE.MeshStandardMaterial({ color: params.color || '#a0a0a0' });
            const column = new THREE.Mesh(columnGeometry, columnMaterial);
            column.position.set(params.x, params.y + params.height / 2, params.z);
            column.name = params.name;
            world.scene.three.add(column);
            toast.success(`Created column: ${params.name}`);
            break;
          }

          case 'create_beam': {
            const beamGeometry = new THREE.BoxGeometry(params.length, params.height, params.width);
            const beamMaterial = new THREE.MeshStandardMaterial({ color: params.color || '#a0a0a0' });
            const beam = new THREE.Mesh(beamGeometry, beamMaterial);
            beam.position.set(params.x + params.length / 2, params.y, params.z);
            if (params.rotationY) {
              beam.rotation.y = (params.rotationY * Math.PI) / 180;
            }
            beam.name = params.name;
            world.scene.three.add(beam);
            toast.success(`Created beam: ${params.name}`);
            break;
          }

          case 'create_slab': {
            const slabGeometry = new THREE.BoxGeometry(params.width, params.thickness, params.depth);
            const slabMaterial = new THREE.MeshStandardMaterial({ color: params.color || '#d0d0d0' });
            const slab = new THREE.Mesh(slabGeometry, slabMaterial);
            slab.position.set(params.x + params.width / 2, params.y, params.z + params.depth / 2);
            slab.name = params.name;
            world.scene.three.add(slab);
            toast.success(`Created slab: ${params.name}`);
            break;
          }

          case 'create_stairs': {
            const stairsGroup = new THREE.Group();
            stairsGroup.name = params.name;
            
            const stepMaterial = new THREE.MeshStandardMaterial({ color: params.color || '#c0c0c0' });
            for (let i = 0; i < params.steps; i++) {
              const stepGeometry = new THREE.BoxGeometry(params.width, params.stepHeight, params.stepDepth);
              const step = new THREE.Mesh(stepGeometry, stepMaterial);
              step.position.set(
                0,
                i * params.stepHeight + params.stepHeight / 2,
                i * params.stepDepth + params.stepDepth / 2
              );
              stairsGroup.add(step);
            }
            
            stairsGroup.position.set(params.x, params.y, params.z);
            if (params.rotationY) {
              stairsGroup.rotation.y = (params.rotationY * Math.PI) / 180;
            }
            world.scene.three.add(stairsGroup);
            toast.success(`Created stairs: ${params.name} with ${params.steps} steps`);
            break;
          }

          case 'create_roof': {
            const roofGroup = new THREE.Group();
            roofGroup.name = params.name;
            
            const pitchRad = (params.pitch * Math.PI) / 180;
            const roofHeight = (params.width / 2) * Math.tan(pitchRad);
            
            const roofMaterial = new THREE.MeshStandardMaterial({ color: params.color || '#8b0000' });
            
            const leftSide = new THREE.Mesh(
              new THREE.BoxGeometry(params.width / Math.cos(pitchRad), 0.05, params.depth),
              roofMaterial
            );
            leftSide.rotation.z = pitchRad;
            leftSide.position.set(-params.width / 4, roofHeight / 2, 0);
            
            const rightSide = new THREE.Mesh(
              new THREE.BoxGeometry(params.width / Math.cos(pitchRad), 0.05, params.depth),
              roofMaterial
            );
            rightSide.rotation.z = -pitchRad;
            rightSide.position.set(params.width / 4, roofHeight / 2, 0);
            
            roofGroup.add(leftSide, rightSide);
            roofGroup.position.set(params.x, params.y, params.z);
            world.scene.three.add(roofGroup);
            toast.success(`Created roof: ${params.name}`);
            break;
          }

          case 'create_room': {
            const roomGroup = new THREE.Group();
            roomGroup.name = params.name;
            
            const wallMaterial = new THREE.MeshStandardMaterial({ color: '#e8e8e8' });
            const floorMaterial = new THREE.MeshStandardMaterial({ color: '#d0d0d0' });
            
            const floor = new THREE.Mesh(
              new THREE.BoxGeometry(params.width, 0.1, params.depth),
              floorMaterial
            );
            floor.position.set(params.width / 2, 0, params.depth / 2);
            
            const wall1 = new THREE.Mesh(
              new THREE.BoxGeometry(params.width, params.height, params.wallThickness),
              wallMaterial
            );
            wall1.position.set(params.width / 2, params.height / 2, 0);
            
            const wall2 = new THREE.Mesh(
              new THREE.BoxGeometry(params.width, params.height, params.wallThickness),
              wallMaterial
            );
            wall2.position.set(params.width / 2, params.height / 2, params.depth);
            
            const wall3 = new THREE.Mesh(
              new THREE.BoxGeometry(params.wallThickness, params.height, params.depth),
              wallMaterial
            );
            wall3.position.set(0, params.height / 2, params.depth / 2);
            
            const wall4 = new THREE.Mesh(
              new THREE.BoxGeometry(params.wallThickness, params.height, params.depth),
              wallMaterial
            );
            wall4.position.set(params.width, params.height / 2, params.depth / 2);
            
            const ceiling = new THREE.Mesh(
              new THREE.BoxGeometry(params.width, 0.1, params.depth),
              floorMaterial
            );
            ceiling.position.set(params.width / 2, params.height, params.depth / 2);
            
            roomGroup.add(floor, wall1, wall2, wall3, wall4, ceiling);
            roomGroup.position.set(params.x, params.y, params.z);
            world.scene.three.add(roomGroup);
            toast.success(`Created room: ${params.name}`);
            break;
          }

          case 'create_building': {
            const buildingGroup = new THREE.Group();
            buildingGroup.name = params.name;
            
            for (let i = 0; i < params.floors; i++) {
              const floorGeometry = new THREE.BoxGeometry(params.width, params.floorHeight, params.depth);
              const floorMaterial = new THREE.MeshStandardMaterial({ color: params.color || '#cccccc' });
              const floor = new THREE.Mesh(floorGeometry, floorMaterial);
              floor.position.set(
                params.x || 0,
                (params.y || 0) + i * params.floorHeight + params.floorHeight / 2,
                params.z || 0
              );
              buildingGroup.add(floor);
            }
            
            world.scene.three.add(buildingGroup);
            toast.success(`Created building: ${params.name} with ${params.floors} floors`);
            break;
          }

          default:
            toast.error(`Unknown geometry type: ${functionName}`);
        }
      } catch (error) {
        console.error('Error creating geometry:', error);
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        toast.error(`Failed to create geometry: ${errorMsg}`);
        throw error;
      }
    }
  }));

  const handleFileUpload = async (file: File) => {
    if (!components) return;

    if (!file.name.toLowerCase().endsWith(".ifc")) {
      toast.error("Please upload a valid IFC file");
      return;
    }

    setIsLoading(true);
    setLoadingProgress(0);

    try {
      const ifcLoader = components.get(OBC.IfcLoader);
      const arrayBuffer = await file.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);

      await ifcLoader.load(buffer, false, file.name, {
        processData: {
          progressCallback: (progress) => {
            setLoadingProgress(Math.round(progress * 100));
          },
        },
      });
    } catch (error) {
      console.error("Error loading IFC file:", error);
      toast.error("Failed to load IFC file. Please check the console for details.");
    } finally {
      setIsLoading(false);
      setLoadingProgress(0);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  return (
    <div className="relative w-full h-screen">
      <div
        ref={containerRef}
        className="absolute inset-0 bg-gradient-to-b from-background to-background/95"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      />
      
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50">
          <div className="bg-card p-8 rounded-lg shadow-2xl border border-border max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold mb-4 text-foreground">
              Loading IFC Model...
            </h3>
            <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-300 ease-out"
                style={{ width: `${loadingProgress}%` }}
              />
            </div>
            <p className="text-sm text-muted-foreground mt-4 text-center">
              {loadingProgress}% complete
            </p>
          </div>
        </div>
      )}

      <div className="absolute top-4 right-4 z-10">
        <div className="bg-card/90 backdrop-blur-sm p-4 rounded-lg shadow-lg border border-border max-w-xs">
          <h3 className="text-sm font-semibold mb-2 text-foreground">Controls</h3>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• Left click + drag to rotate</li>
            <li>• Right click + drag to pan</li>
            <li>• Scroll to zoom</li>
            <li>• Drop IFC file anywhere to load</li>
          </ul>
        </div>
      </div>

      <div className="absolute bottom-4 left-4 right-4 z-10 flex justify-center">
        <label className="cursor-pointer">
          <input
            type="file"
            accept=".ifc"
            onChange={handleFileInputChange}
            className="hidden"
          />
          <div className="bg-gradient-to-r from-primary to-accent text-primary-foreground px-8 py-4 rounded-lg shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 font-semibold text-lg border border-primary/20">
            Upload IFC File
          </div>
        </label>
      </div>
    </div>
  );
});
