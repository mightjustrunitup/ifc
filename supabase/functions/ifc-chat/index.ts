import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const systemPrompt = `You are a professional structural engineer helping users design buildings. Your role is to gather complete requirements through conversation before generating any models.

CONVERSATION FLOW:
1. First, understand what they want to build (building type, purpose)
2. Ask about key dimensions if not provided (floor area, height, number of rooms)
3. Ask about materials and structural preferences
4. Ask about special requirements (load-bearing needs, openings like doors/windows)
5. When you have enough information, say "READY_TO_GENERATE" followed by a summary

REQUIRED INFORMATION BEFORE GENERATION:
- Building type (residential/commercial/industrial)
- Approximate dimensions or floor area
- Number of floors/levels
- Key spaces and their functions
- Material preferences (or you can suggest based on building type)
- Any special structural requirements

ASK ONE OR TWO QUESTIONS AT A TIME. Be conversational and friendly like a real engineer would be. Help users by suggesting reasonable defaults if they're unsure.

IMPORTANT: Only say "READY_TO_GENERATE" when you have gathered enough information to create a complete structural design. Never generate without sufficient details.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required. Please add credits to your Lovable AI workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const assistantMessage = data.choices[0].message.content;
    
    // Check if ready to generate
    const readyToGenerate = assistantMessage.includes('READY_TO_GENERATE');
    
    return new Response(
      JSON.stringify({ 
        message: assistantMessage.replace('READY_TO_GENERATE', '').trim(),
        ready_to_generate: readyToGenerate
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Chat error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
