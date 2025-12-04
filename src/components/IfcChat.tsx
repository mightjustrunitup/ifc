import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Send, Loader2, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";

type Message = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  status?: 'pending' | 'running' | 'verifying' | 'completed' | 'failed';
  progress?: number;
  projectId?: string;
};

type IfcChatProps = {
  onGenerateIfc: (file: File) => void;
};

export const IfcChat = ({ onGenerateIfc }: IfcChatProps) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Hello! I\'m your BIM generation assistant. I create IFC building models using a 5-stage AI pipeline.\n\n⏱️ Generation typically takes 3-5 minutes as I:\n1. Analyze your requirements\n2. Design the structure\n3. Generate code\n4. Validate it\n5. Build the 3D model\n\nWhat building would you like to create?\n\nExamples:\n• "2-story house, 10m x 8m, concrete"\n• "4-story office, 6m column spacing"\n• "Industrial warehouse with clear span roof"'
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const statusPollRef = useRef<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Clean up any ongoing status polling when component unmounts
  useEffect(() => {
    return () => {
      if (statusPollRef.current !== null) {
        clearInterval(statusPollRef.current);
        statusPollRef.current = null;
      }
    };
  }, []);

  const updateProjectProgress = (project: any) => {
    console.log('Project update received:', project);

    setMessages(prev => {
      const lastMsg = prev[prev.length - 1];
      if (lastMsg?.projectId === project.id) {
        const getStageMessage = () => {
          // Failed status - show error details
          if (project.status === 'failed') {
            return `Generation failed: ${project.last_error || 'Unknown error'}`;
          }
          
          // Completed status
          if (project.status === 'completed') return '✓ IFC file generated successfully';
          
          // Parse current_stage from database
          const stage = project.current_stage || '';
          
          // Match the exact stage names from orchestrate function
          if (stage.includes('Analyzing requirements')) return '🔍 Analyzing requirements...';
          if (stage.includes('Designing structure')) return '📐 Designing structure...';
          if (stage.includes('Generating code')) return '⚙️ ' + stage; // Shows attempt number
          if (stage.includes('Validating code')) return '✓ Validating code...';
          if (stage.includes('Building 3D model')) return '🏗️ Building 3D model...';
          if (stage.includes('Retrying')) return '🔄 ' + stage; // Shows retry count
          if (stage.includes('Completed')) return '✓ Completed!';
          if (stage.includes('Failed')) return '✗ Failed';
          
          return '⏳ Processing...';
        };

        return [
          ...prev.slice(0, -1),
          {
            ...lastMsg,
            content: getStageMessage(),
            status: project.status === 'completed' ? 'completed' : project.status === 'failed' ? 'failed' : 'running',
          }
        ];
      }
      return prev;
    });
    
    // Stop loading when completed or failed
    if (project.status === 'completed' || project.status === 'failed') {
      setIsLoading(false);
      setCurrentProjectId(null);
      stopStatusPolling();
    }
  };

  const stopStatusPolling = () => {
    if (statusPollRef.current !== null) {
      clearInterval(statusPollRef.current);
      statusPollRef.current = null;
    }
  };

  const startStatusPolling = (projectId: string) => {
    stopStatusPolling();

    const pollIntervalMs = 2000; // Poll every 2 seconds for faster updates
    const maxDurationMs = 10 * 60 * 1000; // 10 minutes timeout
    const startTime = Date.now();

    statusPollRef.current = window.setInterval(async () => {
      try {
        const { data: project, error } = await supabase
          .from('projects')
          .select('id, status, current_stage, last_error, ifc_url')
          .eq('id', projectId)
          .maybeSingle();

        if (error) {
          console.error('Status poll error:', error);
          setMessages(prev => [
            ...prev.slice(0, -1),
            {
              role: 'assistant',
              content: `Database error: ${error.message}`,
              status: 'failed',
            },
          ]);
          setIsLoading(false);
          setCurrentProjectId(null);
          stopStatusPolling();
          return;
        }

        if (!project) {
          console.error('Project not found');
          setMessages(prev => [
            ...prev.slice(0, -1),
            {
              role: 'assistant',
              content: 'Error: Project not found',
              status: 'failed',
            },
          ]);
          setIsLoading(false);
          setCurrentProjectId(null);
          stopStatusPolling();
          return;
        }

        updateProjectProgress(project);

        // Load IFC when completed
        if (project.status === 'completed' && project.ifc_url) {
          await loadGeneratedIFC(project.ifc_url);
        }

        // Check timeout
        const elapsed = Date.now() - startTime;
        if (elapsed > maxDurationMs && project.status !== 'completed' && project.status !== 'failed') {
          setMessages(prev => [
            ...prev.slice(0, -1),
            {
              role: 'assistant',
              content: '⚠️ Generation timeout (10 min). The process may still be running. Check back later or try a simpler design.',
              status: 'failed',
            },
          ]);
          setIsLoading(false);
          setCurrentProjectId(null);
          stopStatusPolling();
        }
      } catch (error) {
        console.error('Status poll exception:', error);
        setMessages(prev => [
          ...prev.slice(0, -1),
          {
            role: 'assistant',
            content: `Polling error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            status: 'failed',
          },
        ]);
        setIsLoading(false);
        setCurrentProjectId(null);
        stopStatusPolling();
      }
    }, pollIntervalMs);
  };


  const loadGeneratedIFC = async (url: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], 'generated_model.ifc', { type: 'application/x-step' });
      
      onGenerateIfc(file);
      setIsLoading(false);
      setCurrentProjectId(null);
    } catch (error) {
      console.error('Failed to load IFC:', error);
      toast({
        title: "Load Error",
        description: "Failed to load IFC into viewer",
        variant: "destructive"
      });
      setIsLoading(false);
    }
  };

  const startGeneration = async (prompt: string) => {
    try {
      // Call the new /orchestrate Edge Function
      const { data, error } = await supabase.functions.invoke('orchestrate', {
        body: { 
          user_prompt: prompt,
          project_name: 'Generated Model'
        }
      });

      if (error) {
        throw error;
      }

      const projectId = data.project_id;
      setCurrentProjectId(projectId);
      startStatusPolling(projectId);

      // Add progress tracking message with projectId
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '🚀 Starting generation pipeline...',
        status: 'running',
        projectId
      }]);

    } catch (error) {
      console.error('Orchestration error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to start generation';
      
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${errorMsg}`,
        status: 'failed'
      }]);
      
      toast({
        title: "Generation Error",
        description: errorMsg,
        variant: "destructive"
      });
      
      setIsLoading(false);
      stopStatusPolling();
      setCurrentProjectId(null);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input };
    const userInput = input;
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Start the generation immediately with the user prompt
      await startGeneration(userInput);
    } catch (error) {
      console.error('Generation error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to generate IFC';
      
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${errorMsg}`,
        status: 'failed'
      }]);
      
      toast({
        title: "Error",
        description: errorMsg,
        variant: "destructive"
      });
      
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-destructive" />;
      case 'running':
      case 'verifying':
      case 'pending':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      default:
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <Card className="flex flex-col h-full">
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold">BIM Generator</h2>
        <p className="text-sm text-muted-foreground">AI-powered IFC building generation</p>
      </div>

      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.map((message, idx) => (
            <div
              key={idx}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : message.role === 'system'
                    ? 'bg-accent text-accent-foreground border border-border'
                    : 'bg-muted'
                }`}
              >
                <div className="flex items-start gap-2">
                  {message.status && getStatusIcon(message.status)}
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            </div>
          ))}
          {isLoading && messages[messages.length - 1]?.status !== 'running' && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-4 py-2 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Processing...</span>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-4 border-t">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Describe the building you want to create..."
            disabled={isLoading}
          />
          <Button onClick={handleSend} disabled={isLoading || !input.trim()}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
};
