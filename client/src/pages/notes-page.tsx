import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Search,
  Trash2,
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Menu,
  X,
  Indent,
  Outdent,
  Flag,
  ListTodo,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import type { Note } from "@shared/schema";

interface NoteBlock {
  id: string;
  type: "paragraph" | "h1" | "h2" | "h3" | "ul" | "ol";
  content: string;
  indentLevel: number;
  isFlagged: boolean;
  isCollapsed: boolean;
}

interface NoteContent {
  blocks: NoteBlock[];
}

function generateBlockId(): string {
  return Math.random().toString(36).substring(2, 11);
}

// Helper functions for outline numbering (placed outside component for performance)
function toAlpha(n: number): string {
  let result = '';
  let num = n;
  while (num > 0) {
    num--;
    result = String.fromCharCode(97 + (num % 26)) + result;
    num = Math.floor(num / 26);
  }
  return result;
}

function toRoman(n: number): string {
  const romanNumerals = [
    ['', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix'],
    ['', 'x', 'xx', 'xxx', 'xl', 'l', 'lx', 'lxx', 'lxxx', 'xc'],
    ['', 'c', 'cc', 'ccc', 'cd', 'd', 'dc', 'dcc', 'dccc', 'cm'],
  ];
  if (n <= 0 || n >= 1000) return n.toString();
  const ones = n % 10;
  const tens = Math.floor(n / 10) % 10;
  const hundreds = Math.floor(n / 100) % 10;
  return romanNumerals[2][hundreds] + romanNumerals[1][tens] + romanNumerals[0][ones];
}

// Get outline marker based on indent level
// Level 0: 1. 2. 3.    Level 1: a. b. c.    Level 2: i. ii. iii.
// Level 3: 1) 2) 3)    Level 4: a) b) c)    Level 5: i) ii) iii)
function getOutlineMarker(indentLevel: number, count: number): string {
  const style = indentLevel % 6;
  switch (style) {
    case 0: return `${count}.`;
    case 1: return `${toAlpha(count)}.`;
    case 2: return `${toRoman(count)}.`;
    case 3: return `${count})`;
    case 4: return `${toAlpha(count)})`;
    case 5: return `${toRoman(count)})`;
    default: return `${count}.`;
  }
}

export default function NotesPage() {
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [currentTitle, setCurrentTitle] = useState("");
  const [blocks, setBlocks] = useState<NoteBlock[]>([{ id: generateBlockId(), type: "paragraph", content: "", indentLevel: 0, isFlagged: false, isCollapsed: false }]);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastLoadedNoteId = useRef<string | null>(null);
  const blockRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const activeEditingBlockRef = useRef<string | null>(null);
  const blocksRef = useRef<NoteBlock[]>([]);
  const { toast } = useToast();

  blocksRef.current = blocks;

  const { data: notes = [], isLoading } = useQuery<Note[]>({
    queryKey: ["/api/notes", searchQuery],
    queryFn: async () => {
      const url = searchQuery ? `/api/notes?search=${encodeURIComponent(searchQuery)}` : "/api/notes";
      const response = await fetch(url);
      return response.json();
    },
  });

  const createNoteMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/notes", {
        title: "Untitled",
        content: { blocks: [{ id: generateBlockId(), type: "paragraph", content: "", indentLevel: 0, isFlagged: false, isCollapsed: false }] },
        tags: [],
      });
      return await response.json() as Note;
    },
    onMutate: async () => {
      if (saveTimerRef.current && lastLoadedNoteId.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        
        const response = await apiRequest("PATCH", `/api/notes/${lastLoadedNoteId.current}`, {
          title: currentTitle || "Untitled",
          content: { blocks },
        });
        const savedNote = await response.json() as Note;
        
        queryClient.setQueryData<Note[]>(["/api/notes", searchQuery], (oldNotes) => {
          if (!oldNotes) return [savedNote];
          return oldNotes.map((note) => (note.id === savedNote.id ? savedNote : note));
        });
      }
    },
    onSuccess: (newNote) => {
      queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      setSelectedNoteId(newNote.id);
      toast({ title: "Note created" });
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Note> }) => {
      const response = await apiRequest("PATCH", `/api/notes/${id}`, updates);
      return await response.json() as Note;
    },
    onSuccess: (updatedNote) => {
      queryClient.setQueryData<Note[]>(["/api/notes", searchQuery], (oldNotes) => {
        if (!oldNotes) return [updatedNote];
        return oldNotes.map((note) => (note.id === updatedNote.id ? updatedNote : note));
      });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/notes/${id}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/notes"] });
      const updatedNotes = queryClient.getQueryData<Note[]>(["/api/notes", searchQuery]);
      if (updatedNotes && updatedNotes.length > 0) {
        setSelectedNoteId(updatedNotes[0].id);
      } else {
        setSelectedNoteId(null);
      }
      toast({ title: "Note deleted" });
    },
  });

  const createTasksMutation = useMutation({
    mutationFn: async (tasksData: any[]) => {
      const response = await apiRequest("POST", "/api/tasks/bulk", { tasks: tasksData });
      return await response.json();
    },
    onSuccess: (result) => {
      const count = result.tasksCreated || 0;
      toast({ 
        title: "Tasks created", 
        description: `Created ${count} task${count !== 1 ? 's' : ''}. View them in the Planning tab under Backlog.`
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });

  const selectedNote = notes.find((note) => note.id === selectedNoteId);

  const flushPendingSave = useCallback(() => {
    if (saveTimerRef.current && lastLoadedNoteId.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      
      updateNoteMutation.mutate({
        id: lastLoadedNoteId.current,
        content: { blocks },
        title: currentTitle || "Untitled",
      } as any);
    }
  }, [blocks, currentTitle, updateNoteMutation]);

  useEffect(() => {
    if (selectedNote && selectedNoteId !== lastLoadedNoteId.current) {
      flushPendingSave();
      
      lastLoadedNoteId.current = selectedNoteId;
      setCurrentTitle(selectedNote.title);
      
      const content = selectedNote.content as NoteContent;
      if (content?.blocks && content.blocks.length > 0) {
        const migratedBlocks = content.blocks.map((block: any) => ({
          id: block.id || generateBlockId(),
          type: block.type || "paragraph",
          content: block.content || "",
          indentLevel: block.indentLevel ?? 0,
          isFlagged: block.isFlagged ?? false,
          isCollapsed: block.isCollapsed ?? false,
        }));
        setBlocks(migratedBlocks);
      } else {
        setBlocks([{ id: generateBlockId(), type: "paragraph", content: "", indentLevel: 0, isFlagged: false, isCollapsed: false }]);
      }
    }
  }, [selectedNoteId, selectedNote, flushPendingSave]);

  useEffect(() => {
    if (!selectedNoteId && notes.length > 0) {
      setSelectedNoteId(notes[0].id);
    }
  }, [notes, selectedNoteId]);

  const saveNote = useCallback(() => {
    if (!selectedNoteId) return;

    const freshBlocks = blocksRef.current.map(block => {
      const ref = blockRefs.current.get(block.id);
      if (ref) {
        return { ...block, content: ref.textContent || "" };
      }
      return block;
    });

    updateNoteMutation.mutate({
      id: selectedNoteId,
      updates: {
        title: currentTitle || "Untitled",
        content: { blocks: freshBlocks },
      },
    });
  }, [selectedNoteId, currentTitle, updateNoteMutation]);

  const debouncedSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      saveNote();
      saveTimerRef.current = null;
    }, 1500);
  }, [saveNote]);

  const handleTitleChange = (newTitle: string) => {
    setCurrentTitle(newTitle);
    debouncedSave();
  };

  const updateBlock = (blockId: string, updates: Partial<NoteBlock>) => {
    setBlocks(prev => prev.map(block => 
      block.id === blockId ? { ...block, ...updates } : block
    ));
    debouncedSave();
  };

  const handleBlockKeyDown = (e: React.KeyboardEvent, blockId: string, blockIndex: number) => {
    const block = blocks[blockIndex];
    const currentDomContent = blockRefs.current.get(blockId)?.textContent || "";
    
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      
      // If current block is empty and is a list, convert to paragraph (exit list)
      if (currentDomContent === "" && (block.type === "ol" || block.type === "ul")) {
        setBlocks(prev => prev.map(b => 
          b.id === blockId ? { ...b, type: "paragraph" as const } : b
        ));
        debouncedSave();
        return;
      }
      
      // Preserve list type when creating new block
      const newBlockType = (block.type === "ol" || block.type === "ul") ? block.type : "paragraph";
      
      const newBlock: NoteBlock = {
        id: generateBlockId(),
        type: newBlockType,
        content: "",
        indentLevel: block.indentLevel,
        isFlagged: false,
        isCollapsed: false,
      };
      setBlocks(prev => {
        const updatedBlocks = prev.map(b => 
          b.id === blockId ? { ...b, content: currentDomContent } : b
        );
        const newBlocks = [...updatedBlocks];
        newBlocks.splice(blockIndex + 1, 0, newBlock);
        return newBlocks;
      });
      debouncedSave();
      
      setTimeout(() => {
        const ref = blockRefs.current.get(newBlock.id);
        ref?.focus();
      }, 0);
    }
    
    if (e.key === "Backspace" && currentDomContent === "" && blocks.length > 1) {
      e.preventDefault();
      
      // If list item is empty on backspace, convert to paragraph first before deleting
      if (block.type === "ol" || block.type === "ul") {
        setBlocks(prev => prev.map(b => 
          b.id === blockId ? { ...b, type: "paragraph" as const } : b
        ));
        debouncedSave();
        return;
      }
      
      const newBlocks = blocks.filter(b => b.id !== blockId);
      setBlocks(newBlocks);
      debouncedSave();
      
      if (blockIndex > 0) {
        setTimeout(() => {
          const prevBlock = newBlocks[blockIndex - 1];
          const ref = blockRefs.current.get(prevBlock.id);
          ref?.focus();
        }, 0);
      }
    }
    
    if (e.key === "Tab") {
      e.preventDefault();
      const freshContent = currentDomContent;
      setBlocks(prev => prev.map(b => 
        b.id === blockId ? { 
          ...b, 
          content: freshContent,
          indentLevel: e.shiftKey 
            ? Math.max(0, b.indentLevel - 1) 
            : Math.min(5, b.indentLevel + 1)
        } : b
      ));
      debouncedSave();
    }
  };

  const toggleFlag = (blockId: string) => {
    setBlocks(prev => prev.map(block => 
      block.id === blockId ? { ...block, isFlagged: !block.isFlagged } : block
    ));
    debouncedSave();
  };

  const toggleCollapse = (blockId: string) => {
    setBlocks(prev => prev.map(block => 
      block.id === blockId ? { ...block, isCollapsed: !block.isCollapsed } : block
    ));
    debouncedSave();
  };

  const hasChildren = (blockIndex: number): boolean => {
    if (blockIndex >= blocks.length - 1) return false;
    const currentIndent = blocks[blockIndex].indentLevel;
    return blocks[blockIndex + 1]?.indentLevel > currentIndent;
  };

  const isHiddenByCollapse = (blockIndex: number): boolean => {
    for (let i = blockIndex - 1; i >= 0; i--) {
      const prevBlock = blocks[i];
      if (prevBlock.indentLevel < blocks[blockIndex].indentLevel) {
        if (prevBlock.isCollapsed) return true;
        break;
      }
    }
    return false;
  };

  const applyBlockFormat = (format: string) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    const blockElement = range.startContainer.parentElement?.closest('[data-block-id]');
    if (!blockElement) return;
    
    const blockId = blockElement.getAttribute('data-block-id');
    if (!blockId) return;
    
    if (format === "h1" || format === "h2" || format === "h3") {
      updateBlock(blockId, { type: format });
    } else if (format === "ul" || format === "ol") {
      updateBlock(blockId, { type: format });
    } else if (format === "paragraph") {
      updateBlock(blockId, { type: "paragraph" });
    } else if (format === "indent") {
      const block = blocks.find(b => b.id === blockId);
      if (block) {
        updateBlock(blockId, { indentLevel: Math.min(5, block.indentLevel + 1) });
      }
    } else if (format === "outdent") {
      const block = blocks.find(b => b.id === blockId);
      if (block) {
        updateBlock(blockId, { indentLevel: Math.max(0, block.indentLevel - 1) });
      }
    } else {
      document.execCommand(format, false);
    }
  };

  const processTags = () => {
    const flaggedBlocks = blocks.filter(b => b.isFlagged);
    if (flaggedBlocks.length === 0) {
      toast({ title: "No tagged items", description: "Flag some lines first using the flag icon" });
      return;
    }

    const tasksToCreate: any[] = [];
    const processedIds = new Set<string>();

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      if (!block.isFlagged || processedIds.has(block.id)) continue;
      if (block.content.trim() === "") continue;

      processedIds.add(block.id);
      
      const taskName = block.content.trim();
      const taskData: any = {
        name: taskName,
        type: "Task",
        category: "Personal",
        subcategory: "Mental",
        timeHorizon: "BACKLOG",
        priority: "Medium",
        status: "not_started",
      };

      const subtasks: any[] = [];
      for (let j = i + 1; j < blocks.length; j++) {
        const childBlock = blocks[j];
        if (childBlock.indentLevel <= block.indentLevel) break;
        
        if (childBlock.isFlagged && childBlock.content.trim() !== "") {
          processedIds.add(childBlock.id);
          subtasks.push({
            name: childBlock.content.trim(),
            type: "Subtask",
            category: "Personal",
            subcategory: "Mental",
            timeHorizon: "BACKLOG",
            priority: "Medium",
            status: "not_started",
            dependencies: [taskName],
          });
        }
      }

      tasksToCreate.push(taskData);
      tasksToCreate.push(...subtasks);
    }

    if (tasksToCreate.length > 0) {
      createTasksMutation.mutate(tasksToCreate, {
        onSuccess: () => {
          const clearedBlocks = blocks.map(block => ({ ...block, isFlagged: false }));
          setBlocks(clearedBlocks);
          
          if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
          }
          
          if (selectedNoteId) {
            updateNoteMutation.mutate({
              id: selectedNoteId,
              updates: {
                title: currentTitle || "Untitled",
                content: { blocks: clearedBlocks },
              },
            });
          }
        }
      });
    }
  };

  const flaggedCount = blocks.filter(b => b.isFlagged).length;

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-background">
      <div
        className={`${
          isSidebarOpen ? "w-64" : "w-0"
        } transition-all duration-300 border-r bg-card overflow-hidden md:relative absolute md:translate-x-0 ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        } z-10 h-full`}
      >
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-semibold text-lg">Notes</h2>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setIsSidebarOpen(false)}
            data-testid="button-close-sidebar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-notes"
            />
          </div>
        </div>

        <div className="p-2">
          <Button
            onClick={() => createNoteMutation.mutate()}
            className="w-full"
            disabled={createNoteMutation.isPending}
            data-testid="button-create-note"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Note
          </Button>
        </div>

        <ScrollArea className="h-[calc(100%-12rem)]">
          <div className="p-2 space-y-1">
            {isLoading ? (
              <div className="text-center text-muted-foreground p-4">Loading...</div>
            ) : notes.length === 0 ? (
              <div className="text-center text-muted-foreground p-4">
                {searchQuery ? "No notes found" : "No notes yet"}
              </div>
            ) : (
              notes.map((note) => (
                <Card
                  key={note.id}
                  className={`p-3 cursor-pointer hover:bg-accent transition-colors ${
                    selectedNoteId === note.id ? "bg-accent" : ""
                  }`}
                  onClick={() => {
                    setSelectedNoteId(note.id);
                    setIsSidebarOpen(false);
                  }}
                  data-testid={`card-note-${note.id}`}
                >
                  <div className="font-medium truncate" data-testid={`text-note-title-${note.id}`}>
                    {note.title}
                  </div>
                  <div className="text-sm text-muted-foreground truncate">
                    {note.updatedAt ? new Date(note.updatedAt).toLocaleDateString() : ""}
                  </div>
                </Card>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedNote ? (
          <>
            <div className="p-4 border-b flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => setIsSidebarOpen(true)}
                data-testid="button-open-sidebar"
              >
                <Menu className="h-5 w-5" />
              </Button>
              
              <Input
                value={currentTitle}
                onChange={(e) => handleTitleChange(e.target.value)}
                className="text-lg font-semibold border-none shadow-none focus-visible:ring-0"
                placeholder="Note title..."
                data-testid="input-note-title"
              />

              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (confirm("Delete this note?")) {
                    deleteNoteMutation.mutate(selectedNote.id);
                  }
                }}
                data-testid="button-delete-note"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>

            <div className="border-b p-2 flex flex-wrap gap-1 bg-card items-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => applyBlockFormat("h1")}
                data-testid="button-format-h1"
              >
                <Heading1 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => applyBlockFormat("h2")}
                data-testid="button-format-h2"
              >
                <Heading2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => applyBlockFormat("h3")}
                data-testid="button-format-h3"
              >
                <Heading3 className="h-4 w-4" />
              </Button>
              <div className="w-px h-6 bg-border" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => applyBlockFormat("bold")}
                data-testid="button-format-bold"
              >
                <Bold className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => applyBlockFormat("italic")}
                data-testid="button-format-italic"
              >
                <Italic className="h-4 w-4" />
              </Button>
              <div className="w-px h-6 bg-border" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => applyBlockFormat("ul")}
                data-testid="button-format-ul"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => applyBlockFormat("ol")}
                data-testid="button-format-ol"
              >
                <ListOrdered className="h-4 w-4" />
              </Button>
              <div className="w-px h-6 bg-border" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => applyBlockFormat("indent")}
                data-testid="button-format-indent"
              >
                <Indent className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => applyBlockFormat("outdent")}
                data-testid="button-format-outdent"
              >
                <Outdent className="h-4 w-4" />
              </Button>
              
              <div className="w-px h-6 bg-border ml-auto" />
              <Button
                variant={flaggedCount > 0 ? "default" : "ghost"}
                size="sm"
                onClick={processTags}
                disabled={createTasksMutation.isPending || flaggedCount === 0}
                data-testid="button-process-tags"
                className="gap-1"
              >
                <ListTodo className="h-4 w-4" />
                Process Tags {flaggedCount > 0 && `(${flaggedCount})`}
              </Button>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-6 space-y-1">
                {blocks.map((block, index) => {
                  if (isHiddenByCollapse(index)) return null;
                  
                  const showCollapseToggle = hasChildren(index);
                  const paddingLeft = block.indentLevel * 24;
                  
                  // Calculate list marker for ordered lists based on indent level
                  const getListMarker = (): string => {
                    if (block.type !== "ol") return "•";
                    
                    // Count position at this indent level
                    let count = 1;
                    for (let i = index - 1; i >= 0; i--) {
                      const prevBlock = blocks[i];
                      if (prevBlock.type === "ol" && prevBlock.indentLevel === block.indentLevel) {
                        count++;
                      } else if (prevBlock.type !== "ol" || prevBlock.indentLevel < block.indentLevel) {
                        break;
                      }
                    }
                    
                    return getOutlineMarker(block.indentLevel, count);
                  };
                  
                  const listMarker = getListMarker();
                  const isListItem = block.type === "ul" || block.type === "ol";
                  
                  const BlockTag = block.type === "h1" ? "h1" : 
                                   block.type === "h2" ? "h2" : 
                                   block.type === "h3" ? "h3" : "div";
                  
                  const blockClasses = `
                    ${block.type === "h1" ? "text-2xl font-bold" : ""}
                    ${block.type === "h2" ? "text-xl font-semibold" : ""}
                    ${block.type === "h3" ? "text-lg font-medium" : ""}
                    ${block.isFlagged ? "bg-amber-100 dark:bg-amber-900/30 rounded px-1" : ""}
                    outline-none min-h-[1.5em] !leading-tight
                  `;
                  
                  return (
                    <div 
                      key={block.id}
                      className="group flex items-start gap-1"
                      style={{ paddingLeft }}
                      data-testid={`block-container-${block.id}`}
                    >
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity pt-0.5 shrink-0">
                        {showCollapseToggle ? (
                          <button
                            onClick={() => toggleCollapse(block.id)}
                            className="p-0.5 hover:bg-accent rounded"
                            data-testid={`button-collapse-${block.id}`}
                          >
                            {block.isCollapsed ? (
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </button>
                        ) : (
                          <div className="w-4.5" />
                        )}
                        
                        <button
                          onClick={() => toggleFlag(block.id)}
                          className={`p-0.5 rounded ${block.isFlagged ? "bg-amber-200 dark:bg-amber-800" : "hover:bg-accent"}`}
                          data-testid={`button-flag-${block.id}`}
                        >
                          <Flag className={`h-3.5 w-3.5 ${block.isFlagged ? "text-amber-600 dark:text-amber-400 fill-current" : "text-muted-foreground"}`} />
                        </button>
                      </div>
                      
                      {isListItem && (
                        <span className="text-muted-foreground shrink-0 min-w-[24px] text-right pr-2" data-testid={`list-marker-${block.id}`}>
                          {listMarker}
                        </span>
                      )}
                      
                      <BlockTag
                        ref={(el) => {
                          if (el) {
                            blockRefs.current.set(block.id, el);
                            if (activeEditingBlockRef.current !== block.id && el.textContent !== block.content) {
                              el.textContent = block.content;
                            }
                          } else {
                            blockRefs.current.delete(block.id);
                          }
                        }}
                        contentEditable
                        suppressContentEditableWarning
                        data-block-id={block.id}
                        className={blockClasses}
                        style={{ flex: 1 }}
                        onFocus={() => {
                          activeEditingBlockRef.current = block.id;
                        }}
                        onBlur={(e) => {
                          activeEditingBlockRef.current = null;
                          const target = e.target as HTMLElement;
                          const content = target.textContent || "";
                          setBlocks(prev => prev.map(b => 
                            b.id === block.id ? { ...b, content } : b
                          ));
                          saveNote();
                        }}
                        onKeyDown={(e) => handleBlockKeyDown(e, block.id, index)}
                        data-testid={`editor-block-${block.id}`}
                      />
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden mb-4"
                onClick={() => setIsSidebarOpen(true)}
                data-testid="button-open-sidebar-empty"
              >
                <Menu className="h-6 w-6" />
              </Button>
              <p>Select a note or create a new one</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
