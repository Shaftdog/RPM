import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { Upload, Send, Plus, CheckCircle, CalendarIcon } from "lucide-react";
import { format, isPast, isToday, isTomorrow } from "date-fns";
import { cn } from "@/lib/utils";

interface ExtractedTask {
  name: string;
  type: "Milestone" | "Sub-Milestone" | "Task" | "Subtask";
  category: "Personal" | "Business";
  subcategory: string;
  timeHorizon: string;
  priority: "High" | "Medium" | "Low";
  estimatedTime: number;
  caloriesIntake?: number;
  caloriesExpenditure?: number;
  why: string;
  description?: string;
  dueDate?: string;
  xDate?: string;
  dependencies: string[];
  selected?: boolean;
}

export default function TaskCaptureInterface() {
  const [chatMessage, setChatMessage] = useState("");
  const [extractedTasks, setExtractedTasks] = useState<ExtractedTask[]>([]);
  const [chatHistory, setChatHistory] = useState([
    {
      type: "ai",
      message: "Hi! I can help extract tasks from your content. Try pasting an email, meeting notes, or uploading a document."
    }
  ]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const extractTasksMutation = useMutation({
    mutationFn: async (data: { content?: string; file?: File }) => {
      const formData = new FormData();
      if (data.content) {
        formData.append('content', data.content);
      }
      if (data.file) {
        formData.append('file', data.file);
      }
      
      const response = await fetch('/api/tasks/extract', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error(`${response.status}: ${await response.text()}`);
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      const tasksWithSelection = data.tasks.map((task: ExtractedTask) => ({
        ...task,
        selected: true
      }));
      setExtractedTasks(tasksWithSelection);
      
      setChatHistory(prev => [
        ...prev,
        {
          type: "ai",
          message: `I've extracted ${data.tasks.length} tasks from your content. Please review the task table on the right and make any adjustments before submitting.`
        }
      ]);
      
      toast({
        title: "Tasks extracted successfully",
        description: `Found ${data.tasks.length} actionable tasks`,
      });
    },
    onError: (error) => {
      toast({
        title: "Extraction failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createTasksMutation = useMutation({
    mutationFn: async (tasks: ExtractedTask[]) => {
      // Use the new bulk endpoint with dependencies
      const selectedTasks = tasks
        .filter(task => task.selected)
        .map(task => ({
          name: task.name,
          type: task.type,
          category: task.category,
          subcategory: task.subcategory,
          timeHorizon: task.timeHorizon,
          priority: task.priority,
          estimatedTime: task.estimatedTime,
          caloriesIntake: task.caloriesIntake,
          caloriesExpenditure: task.caloriesExpenditure,
          why: task.why,
          description: task.description,
          dueDate: task.dueDate ? new Date(task.dueDate) : null,
          xDate: task.xDate ? new Date(task.xDate) : null,
          dependencies: task.dependencies || [], // Include dependencies for hierarchical processing
        }));

      const response = await apiRequest("POST", "/api/tasks/bulk", {
        tasks: selectedTasks
      });
      
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks/rollups'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tasks/tree'] });
      
      toast({
        title: "Tasks created successfully",
        description: `${data.tasksCreated} tasks added${data.hierarchiesCreated > 0 ? ` with ${data.hierarchiesCreated} hierarchical relationships` : ''} to your workspace`,
      });
      setExtractedTasks([]);
    },
    onError: (error) => {
      toast({
        title: "Failed to create tasks",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = () => {
    if (!chatMessage.trim()) return;

    setChatHistory(prev => [
      ...prev,
      { type: "user", message: chatMessage }
    ]);

    extractTasksMutation.mutate({ content: chatMessage });
    setChatMessage("");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    extractTasksMutation.mutate({ file });
  };

  const handleTaskUpdate = (index: number, field: keyof ExtractedTask, value: any) => {
    setExtractedTasks(prev => prev.map((task, i) => 
      i === index ? { ...task, [field]: value } : task
    ));
  };

  const handleSubmitTasks = () => {
    createTasksMutation.mutate(extractedTasks);
  };

  const selectedTaskCount = extractedTasks.filter(task => task.selected).length;

  const personalSubcategories = ["Physical", "Mental", "Relationship", "Environmental", "Financial", "Adventure"];
  const businessSubcategories = ["Marketing", "Sales", "Operations", "Products", "Production"];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[800px]">
      {/* Left Panel - AI Chat Interface */}
      <Card className="flex flex-col">
        <CardHeader>
          <CardTitle>AI Task Extraction</CardTitle>
          <p className="text-sm text-muted-foreground">
            Upload files or describe your tasks in natural language
          </p>
        </CardHeader>
        
        {/* File Upload Area */}
        <CardContent className="border-b border-border">
          <div
            className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
            data-testid="file-upload-area"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.doc,.docx,.jpg,.jpeg,.png"
              onChange={handleFileUpload}
              className="hidden"
              data-testid="file-input"
            />
            <Upload className="h-12 w-12 text-muted-foreground mb-4 mx-auto" />
            <p className="text-sm text-muted-foreground">Drop files here or click to upload</p>
            <p className="text-xs text-muted-foreground mt-1">PDF, TXT, DOC, JPG, PNG supported</p>
          </div>
        </CardContent>
        
        {/* Chat Messages */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {chatHistory.map((message, index) => (
            <div key={index} className={`flex ${message.type === 'user' ? 'justify-end' : ''}`}>
              <div className={`max-w-sm rounded-lg px-4 py-2 ${
                message.type === 'ai' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-secondary text-secondary-foreground'
              }`}>
                <p className="text-sm">{message.message}</p>
              </div>
            </div>
          ))}
          
          {extractTasksMutation.isPending && (
            <div className="flex">
              <div className="bg-primary text-primary-foreground rounded-lg px-4 py-2 max-w-sm">
                <p className="text-sm">Analyzing your content...</p>
              </div>
            </div>
          )}
        </div>
        
        {/* Chat Input */}
        <CardContent className="border-t border-border">
          <div className="flex space-x-3">
            <Input
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              placeholder="Describe your tasks or paste content here..."
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              data-testid="input-chat-message"
            />
            <Button onClick={handleSendMessage} disabled={extractTasksMutation.isPending} data-testid="button-send-message">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {/* Right Panel - Task Preview Table */}
      <Card className="flex flex-col">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Extracted Tasks</CardTitle>
            <span className="text-sm text-muted-foreground" data-testid="text-task-count">
              {extractedTasks.length} tasks found
            </span>
          </div>
        </CardHeader>
        
        <CardContent className="flex-1 overflow-auto">
          {extractedTasks.length > 0 ? (
            <div className="space-y-4">
              {extractedTasks.map((task, index) => (
                <Card key={index} className={`p-4 ${!task.selected ? 'opacity-50' : ''}`}>
                  <div className="flex items-start space-x-3">
                    <Checkbox
                      checked={task.selected || false}
                      onCheckedChange={(checked) => handleTaskUpdate(index, 'selected', checked)}
                      className="mt-1"
                      data-testid={`checkbox-task-${index}`}
                    />
                    <div className="flex-1 space-y-3">
                      {/* Task Name */}
                      <Input
                        value={task.name}
                        onChange={(e) => handleTaskUpdate(index, 'name', e.target.value)}
                        className="font-medium"
                        data-testid={`input-task-name-${index}`}
                      />
                      
                      {/* Task Details Row */}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <label className="text-muted-foreground">Type</label>
                          <Select 
                            value={task.type} 
                            onValueChange={(value) => handleTaskUpdate(index, 'type', value)}
                          >
                            <SelectTrigger data-testid={`select-task-type-${index}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Milestone">Milestone</SelectItem>
                              <SelectItem value="Sub-Milestone">Sub-Milestone</SelectItem>
                              <SelectItem value="Task">Task</SelectItem>
                              <SelectItem value="Subtask">Subtask</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div>
                          <label className="text-muted-foreground">Category</label>
                          <div className="space-y-1">
                            <Badge 
                              variant={task.category === 'Business' ? 'default' : 'secondary'}
                              className={task.category === 'Business' ? 'bg-business text-business-foreground' : 'bg-personal text-personal-foreground'}
                            >
                              {task.category}
                            </Badge>
                            <Select 
                              value={task.subcategory} 
                              onValueChange={(value) => handleTaskUpdate(index, 'subcategory', value)}
                            >
                              <SelectTrigger data-testid={`select-task-subcategory-${index}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(task.category === 'Personal' ? personalSubcategories : businessSubcategories)
                                  .map(sub => (
                                    <SelectItem key={sub} value={sub}>{sub}</SelectItem>
                                  ))
                                }
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                      
                      {/* X Date (Work Date) Row */}
                      <div className="space-y-1">
                        <label className="text-muted-foreground text-sm">Work Date (X Date)</label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal h-9 text-sm",
                                !task.xDate && "text-muted-foreground",
                                task.xDate && "text-blue-600"
                              )}
                              data-testid={`button-task-x-date-${index}`}
                            >
                              <CalendarIcon className="mr-2 h-3 w-3" />
                              {task.xDate ? (
                                <span>
                                  {isToday(new Date(task.xDate))
                                    ? "Work on Today"
                                    : isTomorrow(new Date(task.xDate))
                                    ? "Work on Tomorrow"
                                    : format(new Date(task.xDate), "MMM dd, yyyy")}
                                </span>
                              ) : (
                                <span>No work date</span>
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="single"
                              selected={task.xDate ? new Date(task.xDate) : undefined}
                              onSelect={(date) => handleTaskUpdate(index, 'xDate', date?.toISOString())}
                            />
                          </PopoverContent>
                        </Popover>
                        {task.xDate && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs w-full"
                            onClick={() => handleTaskUpdate(index, 'xDate', null)}
                          >
                            Clear work date
                          </Button>
                        )}
                      </div>
                      
                      {/* Due Date Row */}
                      <div className="space-y-1">
                        <label className="text-muted-foreground text-sm">Due Date</label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-start text-left font-normal h-9 text-sm",
                                !task.dueDate && "text-muted-foreground",
                                task.dueDate && isPast(new Date(task.dueDate)) && !isToday(new Date(task.dueDate)) && "text-red-600"
                              )}
                              data-testid={`button-task-due-date-${index}`}
                            >
                              <CalendarIcon className="mr-2 h-3 w-3" />
                              {task.dueDate ? (
                                <span className={cn(
                                  task.dueDate && isPast(new Date(task.dueDate)) && !isToday(new Date(task.dueDate)) && "text-red-500"
                                )}>
                                  {isToday(new Date(task.dueDate))
                                    ? "Due Today"
                                    : isTomorrow(new Date(task.dueDate))
                                    ? "Due Tomorrow"
                                    : isPast(new Date(task.dueDate))
                                    ? `Overdue: ${format(new Date(task.dueDate), "MMM dd, yyyy")}`
                                    : format(new Date(task.dueDate), "MMM dd, yyyy")}
                                </span>
                              ) : (
                                <span>No due date</span>
                              )}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="single"
                              selected={task.dueDate ? new Date(task.dueDate) : undefined}
                              onSelect={(date) => handleTaskUpdate(index, 'dueDate', date?.toISOString())}
                            />
                          </PopoverContent>
                        </Popover>
                        {task.dueDate && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs w-full"
                            onClick={() => handleTaskUpdate(index, 'dueDate', null)}
                          >
                            Clear due date
                          </Button>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <label className="text-muted-foreground">Priority</label>
                          <Badge 
                            variant={
                              task.priority === 'High' ? 'destructive' : 
                              task.priority === 'Medium' ? 'secondary' : 'outline'
                            }
                          >
                            {task.priority}
                          </Badge>
                        </div>
                        
                        <div>
                          <label className="text-muted-foreground">Time (hrs)</label>
                          <Input
                            type="number"
                            value={task.estimatedTime}
                            onChange={(e) => handleTaskUpdate(index, 'estimatedTime', parseFloat(e.target.value))}
                            step="0.5"
                            min="0"
                            data-testid={`input-task-time-${index}`}
                          />
                        </div>
                        
                        <div>
                          <label className="text-muted-foreground">Time Horizon</label>
                          <Select 
                            value={task.timeHorizon} 
                            onValueChange={(value) => handleTaskUpdate(index, 'timeHorizon', value)}
                          >
                            <SelectTrigger data-testid={`select-task-horizon-${index}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Today">Today</SelectItem>
                              <SelectItem value="Week">Week</SelectItem>
                              <SelectItem value="1 Year">1 Year</SelectItem>
                              <SelectItem value="Quarter">Quarter</SelectItem>
                              <SelectItem value="Month">Month</SelectItem>
                              <SelectItem value="5 Year">5 Year</SelectItem>
                              <SelectItem value="10 Year">10 Year</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      {/* Calorie fields */}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <label className="text-muted-foreground">Calorie Intake</label>
                          <Input
                            type="number"
                            value={task.caloriesIntake || ""}
                            onChange={(e) => handleTaskUpdate(index, 'caloriesIntake', e.target.value ? parseFloat(e.target.value) : undefined)}
                            step="1"
                            min="0"
                            placeholder="e.g., 300"
                            data-testid={`input-calorie-intake-${index}`}
                          />
                        </div>
                        
                        <div>
                          <label className="text-muted-foreground">Calorie Expenditure</label>
                          <Input
                            type="number"
                            value={task.caloriesExpenditure || ""}
                            onChange={(e) => handleTaskUpdate(index, 'caloriesExpenditure', e.target.value ? parseFloat(e.target.value) : undefined)}
                            step="1"
                            min="0"
                            placeholder="e.g., 150"
                            data-testid={`input-calorie-expenditure-${index}`}
                          />
                        </div>
                      </div>
                      
                      {/* Why field */}
                      <div>
                        <label className="text-muted-foreground text-sm">Why</label>
                        <Textarea
                          value={task.why}
                          onChange={(e) => handleTaskUpdate(index, 'why', e.target.value)}
                          rows={2}
                          data-testid={`textarea-task-why-${index}`}
                        />
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-center">
              <div>
                <p className="text-muted-foreground">No tasks extracted yet</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Upload a file or describe your tasks in the chat
                </p>
              </div>
            </div>
          )}
        </CardContent>
        
        {/* Actions */}
        {extractedTasks.length > 0 && (
          <CardContent className="border-t border-border bg-muted/50">
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-4">
                <Button variant="outline" size="sm" data-testid="button-add-manual">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Task Manually
                </Button>
                <span className="text-sm text-muted-foreground">
                  {selectedTaskCount} of {extractedTasks.length} tasks selected
                </span>
              </div>
              <div className="flex space-x-3">
                <Button variant="outline" data-testid="button-review-details">
                  Review Details
                </Button>
                <Button 
                  onClick={handleSubmitTasks}
                  disabled={selectedTaskCount === 0 || createTasksMutation.isPending}
                  data-testid="button-submit-tasks"
                >
                  {createTasksMutation.isPending ? (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    `Submit ${selectedTaskCount} Tasks`
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
