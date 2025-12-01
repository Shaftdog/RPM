import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, MessageCircle, Send, X } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface ChatPanelProps {
  selectedDate: string;
}

export function AIChatPanel({ selectedDate }: ChatPanelProps) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const { toast } = useToast();

  const dailyChatMutation = useMutation({
    mutationFn: async ({ message, fullHistory }: { message: string; fullHistory: Array<{ role: "user" | "assistant"; content: string }> }) => {
      const response = await apiRequest("POST", "/api/daily/chat", { 
        message,
        conversationHistory: fullHistory,
        selectedDate
      });
      return response.json();
    },
    onSuccess: (data) => {
      setChatHistory(prev => [...prev, { role: "assistant", content: data.response }]);
    },
    onError: () => {
      setChatHistory(prev => prev.slice(0, -1));
      toast({
        title: "Chat error",
        description: "I'm having trouble connecting right now. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSendChatMessage = () => {
    if (!chatMessage.trim() || dailyChatMutation.isPending) return;
    
    const userMessage = chatMessage.trim();
    const newUserEntry = { role: "user" as const, content: userMessage };
    
    const fullHistory = [...chatHistory, newUserEntry];
    
    setChatHistory(fullHistory);
    
    dailyChatMutation.mutate({ message: userMessage, fullHistory });
    setChatMessage("");
  };

  return (
    <>
      {/* Floating Chat Button */}
      <Button
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50 bg-primary hover:bg-primary/90"
        onClick={() => setIsChatOpen(true)}
        style={{ display: isChatOpen ? 'none' : 'flex' }}
        data-testid="button-open-chat"
      >
        <MessageCircle className="h-6 w-6" />
      </Button>

      {/* Chat Panel */}
      {isChatOpen && (
        <div 
          className="fixed bottom-6 right-6 w-96 h-[500px] bg-background border rounded-lg shadow-xl z-50 flex flex-col"
          data-testid="panel-ai-chat"
        >
          {/* Chat Header */}
          <div className="flex items-center justify-between p-3 border-b bg-primary text-primary-foreground rounded-t-lg">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <span className="font-medium">AI Assistant</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-primary-foreground/20"
              onClick={() => setIsChatOpen(false)}
              data-testid="button-close-chat"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Chat Messages */}
          <ScrollArea className="flex-1 p-3">
            <div className="space-y-3">
              {chatHistory.map((msg, index) => (
                <div 
                  key={index} 
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  data-testid={`chat-message-${index}`}
                >
                  <div 
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      msg.role === 'user' 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-muted text-foreground'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {dailyChatMutation.isPending && (
                <div className="flex justify-start" data-testid="chat-loading">
                  <div className="bg-muted text-foreground rounded-lg px-3 py-2 text-sm">
                    <span className="animate-pulse">Thinking...</span>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Chat Input */}
          <div className="p-3 border-t">
            <div className="flex gap-2">
              <Input
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendChatMessage();
                  }
                }}
                disabled={dailyChatMutation.isPending}
                data-testid="input-chat-message"
              />
              <Button
                size="icon"
                onClick={handleSendChatMessage}
                disabled={!chatMessage.trim() || dailyChatMutation.isPending}
                data-testid="button-send-chat"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
