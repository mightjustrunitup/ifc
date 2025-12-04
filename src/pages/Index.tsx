import { useRef, useState } from "react";
import { BimViewer, BimViewerRef } from "@/components/BimViewer";
import { IfcChat } from "@/components/IfcChat";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

const Index = () => {
  const viewerRef = useRef<BimViewerRef>(null);
  const [lastGeneratedFile, setLastGeneratedFile] = useState<File | null>(null);

  const handleGenerateIfc = (file: File) => {
    console.log('Generated IFC file size:', file.size, 'bytes');
    setLastGeneratedFile(file);
    if (viewerRef.current) {
      viewerRef.current.loadIfcFile(file);
    }
  };

  const handleDownload = () => {
    if (lastGeneratedFile) {
      const url = URL.createObjectURL(lastGeneratedFile);
      const a = document.createElement('a');
      a.href = url;
      a.download = lastGeneratedFile.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="h-screen w-screen flex">
      {/* Chat Panel */}
      <div className="w-96 border-r bg-background">
        <IfcChat onGenerateIfc={handleGenerateIfc} />
      </div>
      
      {/* Viewer Panel */}
      <div className="flex-1 relative">
        <BimViewer ref={viewerRef} />
        
        {/* Download Button */}
        {lastGeneratedFile && (
          <div className="absolute top-4 right-4 z-10">
            <Button onClick={handleDownload} variant="secondary" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Download IFC ({Math.round(lastGeneratedFile.size / 1024)}KB)
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
