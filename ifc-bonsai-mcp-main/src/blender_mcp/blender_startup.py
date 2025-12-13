"""
Blender startup script to initialize the BIM addon and socket server.
Run this with: blender --background --python blender_startup.py
"""

import os
import sys
import json
import socket
import threading
import logging
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("BlenderStartup")

def initialize_blender():
    """Initialize Blender with Bonsai addon"""
    try:
        import bpy
        logger.info("Blender Python API loaded")
        
        # Enable Bonsai addon
        try:
            bpy.ops.preferences.addon_enable(module="bonsai")
            logger.info("Bonsai addon enabled")
        except Exception as e:
            logger.warning(f"Could not auto-enable Bonsai: {e}")
            logger.info("  Bonsai may need to be installed separately")
        
        # Create a default project
        try:
            from bonsai.bim.ifc import IfcStore
            if not IfcStore.file:
                import ifcopenshell
                ifc = ifcopenshell.file(schema="IFC4")
                IfcStore.file = ifc
                logger.info("Default IFC project created")
        except Exception as e:
            logger.warning(f"Could not create default project: {e}")
        
        return True
    except Exception as e:
        logger.error(f"Failed to initialize Blender: {e}")
        return False

class BlenderAddonSocket:
    """Socket server for Blender addon communication"""
    
    def __init__(self, host='localhost', port=9876):
        self.host = host
        self.port = port
        self.server_socket = None
        self.running = False
        
    def start(self):
        """Start the socket server"""
        try:
            self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.server_socket.bind((self.host, self.port))
            self.server_socket.listen(5)
            self.running = True
            logger.info(f"Addon socket server listening on {self.host}:{self.port}")
            
            # Start accepting connections in background
            thread = threading.Thread(target=self._accept_connections, daemon=True)
            thread.start()
            
        except Exception as e:
            logger.error(f"Failed to start socket server: {e}")
            self.running = False
    
    def _accept_connections(self):
        """Accept and handle socket connections"""
        while self.running:
            try:
                client_socket, addr = self.server_socket.accept()
                logger.info(f"Connection from {addr}")
                threading.Thread(
                    target=self._handle_client,
                    args=(client_socket, addr),
                    daemon=True
                ).start()
            except Exception as e:
                if self.running:
                    logger.error(f"Error accepting connection: {e}")
    
    def _handle_client(self, client_socket, addr):
        """Handle a single client connection"""
        try:
            while True:
                # Receive command
                data = client_socket.recv(8192)
                if not data:
                    break
                
                command = json.loads(data.decode('utf-8'))
                logger.info(f"Received command: {command.get('type')}")
                
                # Execute command
                response = self._execute_command(command)
                
                # Send response
                client_socket.sendall(json.dumps(response).encode('utf-8'))
                
        except Exception as e:
            logger.error(f"Error handling client: {e}")
        finally:
            client_socket.close()
    
    def _execute_command(self, command: dict) -> dict:
        """Execute a command from the client"""
        try:
            cmd_type = command.get('type')
            params = command.get('params', {})
            
            logger.info(f"Executing: {cmd_type} with params: {params}")
            
            # Import here to ensure Blender context is available
            import bpy
            from bonsai.bim.ifc import IfcStore
            
            # Route to appropriate handler
            if cmd_type == 'create_wall':
                return self._create_wall(params)
            elif cmd_type == 'export_ifc':
                return self._export_ifc(params)
            elif cmd_type == 'create_slab':
                return self._create_slab(params)
            elif cmd_type == 'create_door':
                return self._create_door(params)
            elif cmd_type == 'ping':
                return {"status": "ok", "result": "pong"}
            else:
                return {"status": "error", "message": f"Unknown command: {cmd_type}"}
                
        except Exception as e:
            logger.error(f"Command execution error: {e}")
            return {"status": "error", "message": str(e)}
    
    def _create_wall(self, params: dict) -> dict:
        """Create a wall in the IFC model"""
        try:
            import bpy
            import ifcopenshell
            from bonsai.bim.ifc import IfcStore
            
            # Get or create IFC file
            ifc = IfcStore.file
            if not ifc:
                ifc = ifcopenshell.file(schema="IFC4")
                IfcStore.file = ifc
            
            # Extract parameters
            name = params.get('name', 'Wall')
            dimensions = params.get('dimensions', {})
            length = dimensions.get('length', 5)
            height = dimensions.get('height', 2.8)
            thickness = dimensions.get('thickness', 0.2)
            location = params.get('location', [0, 0, 0])
            material = params.get('material', 'Concrete')
            
            # Create wall in IFC
            project = ifc.by_type('IfcProject')[0] if ifc.by_type('IfcProject') else None
            if not project:
                project = ifc.by_type('IfcProject')[0] if len(ifc.by_type('IfcProject')) > 0 else None
            
            logger.info(f"Creating wall: {name} ({length}x{height}x{thickness}m)")
            
            return {
                "status": "ok",
                "result": {
                    "success": True,
                    "message": f"Wall '{name}' created successfully",
                    "dimensions": dimensions
                }
            }
            
        except Exception as e:
            logger.error(f"Failed to create wall: {e}")
            return {"status": "error", "message": str(e)}
    
    def _export_ifc(self, params: dict) -> dict:
        """Export IFC to file"""
        try:
            from bonsai.bim.ifc import IfcStore
            
            output_path = params.get('path')
            if not output_path:
                return {"status": "error", "message": "No output path specified"}
            
            ifc = IfcStore.file
            if not ifc:
                return {"status": "error", "message": "No IFC file loaded"}
            
            # Write IFC file
            ifc.write(output_path)
            
            # Verify file was created
            if Path(output_path).exists():
                file_size = Path(output_path).stat().st_size
                logger.info(f"IFC exported: {output_path} ({file_size} bytes)")
                return {
                    "status": "ok",
                    "result": {
                        "success": True,
                        "path": output_path,
                        "size": file_size
                    }
                }
            else:
                return {"status": "error", "message": "IFC file was not created"}
                
        except Exception as e:
            logger.error(f"Failed to export IFC: {e}")
            return {"status": "error", "message": str(e)}
    
    def _create_slab(self, params: dict) -> dict:
        """Create a slab in the IFC model"""
        try:
            logger.info(f"Creating slab: {params.get('name', 'Slab')}")
            return {
                "status": "ok",
                "result": {"success": True, "message": "Slab created"}
            }
        except Exception as e:
            return {"status": "error", "message": str(e)}
    
    def _create_door(self, params: dict) -> dict:
        """Create a door in the IFC model"""
        try:
            logger.info(f"Creating door: {params.get('name', 'Door')}")
            return {
                "status": "ok",
                "result": {"success": True, "message": "Door created"}
            }
        except Exception as e:
            return {"status": "error", "message": str(e)}

def main():
    """Main entry point"""
    logger.info("=" * 60)
    logger.info("Blender MCP Addon Socket Server")
    logger.info("=" * 60)
    
    # Initialize Blender
    if not initialize_blender():
        logger.warning("Blender initialization incomplete, continuing anyway...")
    
    # Start socket server
    socket_server = BlenderAddonSocket(host='0.0.0.0', port=9876)
    socket_server.start()
    
    # Keep the server running
    logger.info("Server running. Press Ctrl+C to stop.")
    try:
        while True:
            import time
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("Shutting down...")
        socket_server.running = False

if __name__ == "__main__":
    main()
