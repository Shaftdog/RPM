import { useState, useEffect, useRef } from "react";
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
  Indent3,
  Outdent3,
} from "lucide-react";
import type { Note } from "@shared/schema";

interface NoteBlock {
  type: string;
  content: string;
}

interface NoteContent {
  blocks: NoteBlock[];
}

export default function NotesPage() {
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [currentTitle, setCurrentTitle] = useState("");
  const [currentContent, setCurrentContent] = useState<NoteContent>({ blocks: [] });
  const editorRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastLoadedNoteId = useRef<string | null>(null);
  const { toast } = useToast();

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
        content: { blocks: [{ type: "paragraph", content: "" }] },
        tags: [],
      });
      return await response.json() as Note;
    },
    onMutate: async () => {
      if (saveTimerRef.current && lastLoadedNoteId.current && editorRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        
        const blocks = htmlToBlocks(editorRef.current.innerHTML);
        const noteIdToSave = lastLoadedNoteId.current;
        const titleToSave = currentTitle || "Untitled";
        
        const response = await apiRequest("PATCH", `/api/notes/${noteIdToSave}`, {
          title: titleToSave,
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

  const selectedNote = notes.find((note) => note.id === selectedNoteId);

  const flushPendingSave = () => {
    if (saveTimerRef.current && lastLoadedNoteId.current && editorRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      
      const blocks = htmlToBlocks(editorRef.current.innerHTML);
      updateNoteMutation.mutate({
        id: lastLoadedNoteId.current,
        updates: {
          title: currentTitle || "Untitled",
          content: { blocks },
        },
      });
    }
  };

  useEffect(() => {
    if (selectedNote && selectedNoteId !== lastLoadedNoteId.current) {
      flushPendingSave();
      
      lastLoadedNoteId.current = selectedNoteId;
      setCurrentTitle(selectedNote.title);
      const content = selectedNote.content as NoteContent;
      setCurrentContent(content || { blocks: [] });
      
      if (editorRef.current && content?.blocks) {
        editorRef.current.innerHTML = blocksToHtml(content.blocks);
      }
    }
  }, [selectedNoteId, selectedNote]);

  useEffect(() => {
    if (!selectedNoteId && notes.length > 0) {
      setSelectedNoteId(notes[0].id);
    }
  }, [notes, selectedNoteId]);

  const saveNote = () => {
    if (!selectedNoteId || !editorRef.current) return;

    const blocks = htmlToBlocks(editorRef.current.innerHTML);
    
    updateNoteMutation.mutate({
      id: selectedNoteId,
      updates: {
        title: currentTitle || "Untitled",
        content: { blocks },
      },
    });
  };

  const debouncedSave = () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      saveNote();
      saveTimerRef.current = null;
    }, 1500);
  };

  const handleTitleChange = (newTitle: string) => {
    setCurrentTitle(newTitle);
    debouncedSave();
  };

  const applyFormat = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
  };

  const insertHeading = (level: number) => {
    applyFormat("formatBlock", `h${level}`);
  };

  const handleEditorInput = () => {
    debouncedSave();
  };

  function blocksToHtml(blocks: NoteBlock[]): string {
    return blocks
      .map((block) => {
        switch (block.type) {
          case "h1":
            return `<h1>${block.content}</h1>`;
          case "h2":
            return `<h2>${block.content}</h2>`;
          case "h3":
            return `<h3>${block.content}</h3>`;
          case "ul":
            return `<ul><li>${block.content}</li></ul>`;
          case "ol":
            return `<ol><li>${block.content}</li></ol>`;
          default:
            return `<p>${block.content}</p>`;
        }
      })
      .join("");
  }

  function htmlToBlocks(html: string): NoteBlock[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const blocks: NoteBlock[] = [];

    doc.body.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim();
        if (text) {
          blocks.push({ type: "paragraph", content: text });
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement;
        const tagName = element.tagName.toLowerCase();
        
        if (tagName === "h1" || tagName === "h2" || tagName === "h3") {
          blocks.push({ type: tagName, content: element.textContent || "" });
        } else if (tagName === "ul") {
          element.querySelectorAll("li").forEach((li) => {
            blocks.push({ type: "ul", content: li.textContent || "" });
          });
        } else if (tagName === "ol") {
          element.querySelectorAll("li").forEach((li) => {
            blocks.push({ type: "ol", content: li.textContent || "" });
          });
        } else if (tagName === "div" || tagName === "br") {
          const text = element.textContent?.trim();
          if (text) {
            blocks.push({ type: "paragraph", content: text });
          }
        } else {
          blocks.push({ type: "paragraph", content: element.textContent || "" });
        }
      }
    });

    return blocks.length > 0 ? blocks : [{ type: "paragraph", content: "" }];
  }

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

            <div className="border-b p-2 flex flex-wrap gap-1 bg-card">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => insertHeading(1)}
                data-testid="button-format-h1"
              >
                <Heading1 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => insertHeading(2)}
                data-testid="button-format-h2"
              >
                <Heading2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => insertHeading(3)}
                data-testid="button-format-h3"
              >
                <Heading3 className="h-4 w-4" />
              </Button>
              <div className="w-px h-6 bg-border" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => applyFormat("bold")}
                data-testid="button-format-bold"
              >
                <Bold className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => applyFormat("italic")}
                data-testid="button-format-italic"
              >
                <Italic className="h-4 w-4" />
              </Button>
              <div className="w-px h-6 bg-border" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => applyFormat("insertUnorderedList")}
                data-testid="button-format-ul"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => applyFormat("insertOrderedList")}
                data-testid="button-format-ol"
              >
                <ListOrdered className="h-4 w-4" />
              </Button>
              <div className="w-px h-6 bg-border" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => applyFormat("indent")}
                data-testid="button-format-indent"
              >
                <Indent3 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => applyFormat("outdent")}
                data-testid="button-format-outdent"
              >
                <Outdent3 className="h-4 w-4" />
              </Button>
            </div>

            <ScrollArea className="flex-1">
              <div
                ref={editorRef}
                contentEditable
                className="p-6 outline-none prose prose-sm sm:prose lg:prose-lg max-w-none min-h-full !leading-tight"
                onInput={handleEditorInput}
                onBlur={saveNote}
                data-testid="editor-content"
              />
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
